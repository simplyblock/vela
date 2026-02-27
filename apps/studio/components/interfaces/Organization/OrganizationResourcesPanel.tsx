import React, { useMemo } from 'react'
import { useOrganizationLimitsQuery } from 'data/resource-limits/organization-limits-query'
import { useOrgAvailableCreationResourcesQuery } from 'data/resource-limits/org-available-creation-resources-query'
import { cn } from 'ui'
import { divideValue, formatResource } from '../Project/utils'
import type { OrganizationLimitsData } from 'data/resource-limits/organization-limits-query'
import type { OrgAvailableCreationResourcesData } from 'data/resource-limits/org-available-creation-resources-query'

type Props = {
  orgRef?: string
}

type OrgLimitItem = NonNullable<OrganizationLimitsData>[number]
type OrgAllocationKey = keyof OrgAvailableCreationResourcesData &
  ('milli_vcpu' | 'ram' | 'iops' | 'storage_size' | 'database_size')

const RESOURCE_DEFS: Array<{
  key: OrgAllocationKey
  label: string
  colorClass: string
}> = [
  { key: 'milli_vcpu', label: 'vCPU', colorClass: 'bg-sky-500' },
  { key: 'ram', label: 'RAM', colorClass: 'bg-amber-500' },
  { key: 'database_size', label: 'Database', colorClass: 'bg-violet-500' },
  { key: 'iops', label: 'IOPS', colorClass: 'bg-emerald-500' },
  { key: 'storage_size', label: 'Storage', colorClass: 'bg-sky-700' },
]

/**
 * OrganizationResourcesPanel
 * Reads organization-wide limits and available resources and renders allocations.
 * Allocation is computed as: max_total - available.
 */
export default function OrganizationResourcesPanel({ orgRef }: Props) {
  const { data: limits, isLoading: loadingLimits } = useOrganizationLimitsQuery(
    { orgRef },
    { enabled: !!orgRef }
  )

  const { data: available, isLoading: loadingAvailable } = useOrgAvailableCreationResourcesQuery(
    { orgId: orgRef },
    { enabled: !!orgRef }
  )

  const loading = loadingLimits || loadingAvailable

  const rows = useMemo(() => {
    if (!limits && !available) return []

    return RESOURCE_DEFS.map((def) => {
      const limitEntry = Array.isArray(limits)
        ? limits.find((limit: OrgLimitItem) => limit.resource === def.key)
        : undefined
      const maxRaw = typeof limitEntry?.max_total === 'number' ? limitEntry.max_total : null

      const availableValue = available?.[def.key]
      const availableRaw = typeof availableValue === 'number' ? availableValue : 0

      const allocatedRaw = maxRaw == null ? null : Math.max(0, maxRaw - availableRaw)

      const maxDisplayNumber = maxRaw == null ? null : divideValue(def.key, maxRaw)
      const allocatedDisplayNumber = divideValue(def.key, allocatedRaw) ?? 0

      const pct =
        maxDisplayNumber != null && maxDisplayNumber > 0
          ? Math.min(100, Math.max(0, (allocatedDisplayNumber / maxDisplayNumber) * 100))
          : null

      return {
        id: def.key,
        label: def.label,
        allocatedRaw,
        maxRaw,
        allocatedDisplay: formatResource(def.key, allocatedRaw),
        maxDisplay: maxRaw == null ? 'unlimited' : formatResource(def.key, maxRaw),
        pct,
        colorClass: def.colorClass,
      }
    }).filter((row) => row.allocatedRaw !== null || row.maxRaw !== null)
  }, [limits, available])

  const mostAllocated =
    rows
      .slice()
      .filter((row) => row.pct != null)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0] ?? null

  return (
    <div className="rounded-md border p-4 bg-surface-100">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Organization resource allocation</h3>
          <p className="text-xs text-foreground-muted">Allocation across the organization (limits - available)</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm font-semibold">
            {loading ? '--' : mostAllocated ? `${Math.round(mostAllocated.pct ?? 0)}%` : '--'}
          </div>
          <div className="text-xs text-foreground-muted">
            {loading ? 'Loading' : mostAllocated ? mostAllocated.label : 'No data'}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {loading ? (
          <div className="col-span-1 text-xs text-foreground-muted">Loading limits &amp; allocation...</div>
        ) : rows.length === 0 ? (
          <div className="col-span-1 text-xs text-foreground-muted">No resource information available.</div>
        ) : (
          rows.map((row) => {
            const pct = row.pct ?? 0

            return (
              <div key={row.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-foreground">{row.label}</div>
                  <div className="text-xs text-foreground-muted">
                    {row.allocatedDisplay} / {row.maxDisplay}
                  </div>
                </div>

                <div className="w-full h-2 rounded bg-surface-200 overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-200', row.colorClass)}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {row.pct != null ? (
                  <div className="text-xs text-foreground-muted mt-1">{Math.round(row.pct)}%</div>
                ) : (
                  <div className="text-xs text-foreground-muted mt-1">Unlimited / not bounded</div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
