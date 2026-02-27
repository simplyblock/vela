import React, { useMemo } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent, cn } from 'ui'
import { useProjectLimitsQuery, type ProjectLimitsData } from 'data/resource-limits/project-limits-query'
import {
  useProjectAvailableCreationResourcesQuery,
  type ProjectAvailableCreationResourcesData,
} from 'data/resource-limits/project-available-creation-resources-query'
import { divideValue, formatResource } from './utils'

type ProjectLimitItem = NonNullable<ProjectLimitsData>[number]
type ProjectAllocationKey = keyof ProjectAvailableCreationResourcesData 
const RESOURCE_DEFS: Array<{
  key: ProjectAllocationKey
  label: string
}> = [
  { key: 'milli_vcpu', label: 'vCPU' },
  { key: 'ram', label: 'RAM' },
  { key: 'database_size', label: 'Database' },
  { key: 'storage_size', label: 'Storage' },
  { key: 'iops', label: 'IOPS' },
]

/**
 * Shows project resource allocation.
 * Allocation is computed as: max_total - available.
 */
export const ProjectResourcesBadge = ({
  orgRef,
  projectRef,
  size = 36,
}: {
  orgRef?: string
  projectRef?: string
  size?: number
}) => {
  const limitsQuery = useProjectLimitsQuery(
    { orgRef: orgRef!, projectRef: projectRef! },
    { enabled: !!orgRef && !!projectRef }
  )

  const availableQuery = useProjectAvailableCreationResourcesQuery(
    {
      orgId: orgRef!,
      projectId: projectRef!,
    },
    { enabled: !!orgRef && !!projectRef }
  )

  const rows = useMemo(() => {
    const limitsData = limitsQuery.data
    const availableData = availableQuery.data

    if (!limitsData && !availableData) return []

    return RESOURCE_DEFS.map((def) => {
      const limitEntry = Array.isArray(limitsData)
        ? limitsData.find((limit: ProjectLimitItem) => limit.resource === def.key)
        : undefined
      if (!limitEntry) return null
      const maxRaw = typeof limitEntry?.max_total === 'number' ? limitEntry.max_total : null

      const availableValue = availableData?.[def.key]
      const availableRaw = typeof availableValue === 'number' ? availableValue : 0

      const allocatedRaw = maxRaw == null ? null : Math.max(0, maxRaw - availableRaw)

      const maxDisplayNumber = maxRaw == null ? null : divideValue(def.key, maxRaw)
      const allocatedDisplayNumber = divideValue(def.key, allocatedRaw) ?? 0

      const percent =
        maxDisplayNumber != null && maxDisplayNumber > 0
          ? Math.max(0, Math.min(100, (allocatedDisplayNumber / maxDisplayNumber) * 100))
          : 0

      return {
        key: def.key,
        label: def.label,
        percent,
        allocatedDisplay: formatResource(def.key, allocatedRaw),
        maxDisplay: maxRaw == null ? 'unlimited' : formatResource(def.key, maxRaw),
        hasData: allocatedRaw !== null || maxRaw !== null,
      }
    }).filter((row): row is NonNullable<typeof row> => row !== null && row.hasData)
  }, [limitsQuery.data, availableQuery.data])

  const mostAllocated = useMemo(() => {
    if (rows.length === 0) return null
    const sorted = [...rows].sort((a, b) => b.percent - a.percent)
    return sorted[0]
  }, [rows])

  const stroke = 4
  const radius = Math.max(4, (size - stroke) / 2)
  const circumference = 2 * Math.PI * radius
  const pct = mostAllocated ? Math.max(0, Math.min(100, mostAllocated.percent)) : 0
  const dash = (circumference * pct) / 100
  const remaining = Math.max(0, circumference - dash)

  const resourceColor = (key?: string) => {
    switch (key) {
      case 'milli_vcpu':
        return 'bg-brand-600'
      case 'ram':
        return 'bg-amber-600'
      case 'database_size':
        return 'bg-violet-600'
      case 'iops':
        return 'bg-emerald-600'
      case 'storage_size':
        return 'bg-sky-600'
      default:
        return 'bg-foreground'
    }
  }

  const loading = limitsQuery.isLoading || availableQuery.isLoading
  const empty = rows.length === 0 && !loading

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={
            mostAllocated
              ? `${mostAllocated.label} allocation ${Math.round(mostAllocated.percent)}%`
              : 'No allocation info'
          }
          className="inline-flex items-center gap-2 p-0 bg-transparent border-0"
        >
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="block" aria-hidden>
              <g transform={`translate(${size / 2}, ${size / 2})`}>
                <circle r={radius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={stroke} />
                <circle
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${remaining}`}
                  transform={`rotate(-90)`}
                  className={resourceColor(mostAllocated?.key)}
                  style={{ transition: 'stroke-dasharray 240ms ease' }}
                />
              </g>
            </svg>

            <div
              className="absolute inset-0 flex items-center justify-center font-medium"
              style={{ pointerEvents: 'none', fontSize: 10 }}
            >
              {loading ? '...' : empty ? '--' : `${Math.round(pct)}%`}
            </div>
          </div>
        </button>
      </TooltipTrigger>

      <TooltipContent side="top" align="center" className="min-w-[240px] p-3">
        <div className="space-y-2">
          <div className="text-xs text-foreground-muted">Project resource allocation (limits - available)</div>

          {loading ? (
            <div className="text-sm text-foreground-light">Loading allocation...</div>
          ) : empty ? (
            <div className="text-sm text-foreground-light">No resource info available</div>
          ) : (
            rows.map((row) => {
              const percent = Math.round(row.percent)
              return (
                <div key={row.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[12px]">{row.label}</span>
                      <span className="text-foreground-muted text-[11px]">({row.allocatedDisplay})</span>
                    </div>
                    <div className="text-[11px] text-foreground-muted">{row.maxDisplay}</div>
                  </div>

                  <div className="w-full h-2 rounded bg-surface-200 overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className={cn('h-full', resourceColor(row.key), 'transition-all duration-200')}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export default ProjectResourcesBadge
