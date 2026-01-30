// components/interfaces/Project/ProjectResourcesBadge.tsx
import React, { useMemo, useState } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent, cn } from 'ui'
import { useProjectLimitsQuery } from 'data/resource-limits/project-limits-query'
import { useProjectUsageQuery } from 'data/resources/project-usage-query'
import { divideValue, formatResource } from './utils'

type ProjectLimitsItem = {
  resource: 'milli_vcpu' | 'ram' | 'iops' | 'storage_size' | 'database_size'
  max_total: number
  max_per_branch: number
}

type ProjectUsageShape = {
  milli_vcpu?: number | null | undefined
  ram?: number | null | undefined
  iops?: number | null | undefined
  storage_size?: number | null | undefined
  database_size?: number | null | undefined
}

/**
 * Shows project resource usage for the last minute.
 * Fetches its own limits + usage based on orgRef + projectRef.
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
  // Fix "last minute" window at mount time so the query key stays stable
  const [timeRange] = useState(() => {
    const now = Date.now() - 60_000
    return {
      start: new Date(Math.floor(now / 60_000) * 60_000).toISOString(),
    }
  })

  const limitsQuery = useProjectLimitsQuery(
    { orgRef: orgRef!, projectRef: projectRef! },
    { enabled: !!orgRef && !!projectRef }
  )

  const usageQuery = useProjectUsageQuery(
    {
      orgRef: orgRef!,
      projectRef: projectRef!,
      start: timeRange.start,
    },
    { enabled: !!orgRef && !!projectRef }
  )

  const limitsData = limitsQuery.data as ProjectLimitsItem[] | undefined
  const usageData = usageQuery.data as ProjectUsageShape | undefined

  const rows = useMemo(() => {
    if (!limitsData && !usageData) return []

    const findMax = (resourceName: string) => {
      if (!limitsData) return null
      const found = limitsData.find((x) => x.resource === resourceName)
      return found ? found.max_total : null
    }

    const out: {
      key: string
      label: string
      percent: number
      usedDisplay: string
      maxDisplay: string
    }[] = []

    // milli_vcpu -> vCPU
    {
      const maxRaw = findMax('milli_vcpu')
      const usedRaw = usageData?.milli_vcpu ?? null
      const max = divideValue('milli_vcpu', maxRaw)
      const used = divideValue('milli_vcpu', usedRaw) ?? 0
      const percent = max ? Math.max(0, Math.min(100, (used / max) * 100)) : 0
      out.push({
        key: 'milli_vcpu',
        label: 'vCPU',
        percent,
        usedDisplay: formatResource('milli_vcpu', usedRaw),
        maxDisplay: max == null ? '—' : formatResource('milli_vcpu', maxRaw),
      })
    }

    // ram -> GiB
    {
      const maxRaw = findMax('ram')
      const usedRaw = usageData?.ram ?? null
      const max = divideValue('ram', maxRaw)
      const used = divideValue('ram', usedRaw) ?? 0
      const percent = max ? Math.max(0, Math.min(100, (used / max) * 100)) : 0
      out.push({
        key: 'ram',
        label: 'RAM',
        percent,
        usedDisplay: formatResource('ram', usedRaw),
        maxDisplay: max == null ? '—' : formatResource('ram', maxRaw),
      })
    }

    // database_size -> GB
    {
      const maxRaw = findMax('database_size')
      const usedRaw = usageData?.database_size ?? null
      const max = divideValue('database_size', maxRaw)
      const used = divideValue('database_size', usedRaw) ?? 0
      const percent = max ? Math.max(0, Math.min(100, (used / max) * 100)) : 0
      out.push({
        key: 'database_size',
        label: 'Database',
        percent,
        usedDisplay: formatResource('database_size', usedRaw),
        maxDisplay: max == null ? '—' : formatResource('database_size', maxRaw),
      })
    }

    // storage_size -> GB
    {
      const maxRaw = findMax('storage_size')
      const usedRaw = usageData?.storage_size ?? null
      const max = divideValue('storage_size', maxRaw)
      const used = divideValue('storage_size', usedRaw) ?? 0
      const percent = max ? Math.max(0, Math.min(100, (used / max) * 100)) : 0
      out.push({
        key: 'storage_size',
        label: 'Storage',
        percent,
        usedDisplay: formatResource('storage_size', usedRaw),
        maxDisplay: max == null ? '—' : formatResource('storage_size', maxRaw),
      })
    }

    // iops -> numeric
    {
      const maxRaw = findMax('iops')
      const usedRaw = usageData?.iops ?? null
      const max = typeof maxRaw === 'number' ? maxRaw : null
      const used = typeof usedRaw === 'number' ? usedRaw : 0
      const percent = max ? Math.max(0, Math.min(100, (used / max) * 100)) : 0
      out.push({
        key: 'iops',
        label: 'IOPS',
        percent,
        usedDisplay: maxRaw == null ? (usedRaw == null ? '—' : String(usedRaw)) : String(usedRaw),
        maxDisplay: max == null ? '—' : String(max),
      })
    }

    return out.filter((r) => r.usedDisplay !== '—' || r.maxDisplay !== '—')
  }, [limitsData, usageData])

  const mostUsed = useMemo(() => {
    if (!rows || rows.length === 0) return null
    const sorted = [...rows].sort((a, b) => b.percent - a.percent)
    return sorted[0]
  }, [rows])

  const stroke = 4
  const radius = Math.max(4, (size - stroke) / 2)
  const circumference = 2 * Math.PI * radius
  const pct = mostUsed ? Math.max(0, Math.min(100, mostUsed.percent)) : 0
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

  const loading = limitsQuery.isLoading || usageQuery.isLoading
  const empty = rows.length === 0 && !loading

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={
            mostUsed ? `${mostUsed.label} usage ${Math.round(mostUsed.percent)}%` : 'No usage info'
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
                  className={resourceColor(mostUsed?.key)}
                  style={{ transition: 'stroke-dasharray 240ms ease' }}
                />
              </g>
            </svg>

            <div
              className="absolute inset-0 flex items-center justify-center font-medium"
              style={{ pointerEvents: 'none', fontSize: 10 }}
            >
              {loading ? '…' : empty ? '—' : `${Math.round(pct)}%`}
            </div>
          </div>
        </button>
      </TooltipTrigger>

      <TooltipContent side="top" align="center" className="min-w-[240px] p-3">
        <div className="space-y-2">
          <div className="text-xs text-foreground-muted">
            Project resource usage (last minute)
          </div>

          {loading ? (
            <div className="text-sm text-foreground-light">Loading usage…</div>
          ) : empty ? (
            <div className="text-sm text-foreground-light">No resource info available</div>
          ) : (
            rows.map((r) => {
              const percent = Math.round(r.percent)
              return (
                <div key={r.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[12px]">{r.label}</span>
                      <span className="text-foreground-muted text-[11px]">({r.usedDisplay})</span>
                    </div>
                    <div className="text-[11px] text-foreground-muted">{r.maxDisplay}</div>
                  </div>

                  <div className="w-full h-2 rounded bg-surface-200 overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className={cn('h-full', resourceColor(r.key), 'transition-all duration-200')}
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
