// components/interfaces/Project/ProjectResourcesPanel.tsx
import React, { useMemo, useState } from 'react'
import { useProjectLimitsQuery } from 'data/resource-limits/project-limits-query'
import { useProjectUsageQuery } from 'data/resources/project-usage-query'
import { cn } from 'ui'
import { divideValue, formatResource,formatRawNumber } from './utils'

type Props = {
  orgRef?: string
  projectRef?: string
}

type ProjectLimitItem = {
  resource: 'milli_vcpu' | 'ram' | 'iops' | 'storage_size' | 'database_size'
  max_total: number | null
  max_per_branch: number | null
}

type ProjectUsageShape = {
  milli_vcpu?: number | null | undefined
  ram?: number | null | undefined
  iops?: number | null | undefined
  storage_size?: number | null | undefined
  database_size?: number | null | undefined
}

/**
 * Panel that shows project-wide limits (max_total) + current usage (project usage)
 */
export default function ProjectResourcesPanel({ orgRef, projectRef }: Props) {
  const { data: limitsArr, isLoading: loadingLimits } = useProjectLimitsQuery(
    { orgRef, projectRef },
    { enabled: !!orgRef && !!projectRef }
  )

    const [timeRange] = useState(() => {
    const now = Date.now() - 60_000
    return {
      start: new Date(Math.floor(now / 60_000) * 60_000).toISOString(),
    }
  })

  const { data: usageObj, isLoading: loadingUsage } = useProjectUsageQuery(
    {
      orgRef,
      projectRef,
      start: timeRange.start,
    },
    { enabled: !!orgRef && !!projectRef }
  )

  const loading = loadingLimits || loadingUsage

  const rows = useMemo(() => {
    if (!limitsArr && !usageObj) return []

    const findLimit = (resource: ProjectLimitItem['resource']) => {
      if (!Array.isArray(limitsArr)) return null
      return limitsArr.find((l) => l.resource === resource) ?? null
    }

    // definitions map to the resource-utils keys (we keep same names)
    const defs: {
      key: ProjectLimitItem['resource']
      label: string
      color: string
      usageKey: keyof ProjectUsageShape
    }[] = [
      { key: 'milli_vcpu', label: 'vCPU', color: 'bg-sky-500', usageKey: 'milli_vcpu' },
      { key: 'ram', label: 'RAM', color: 'bg-amber-500', usageKey: 'ram' },
      { key: 'database_size', label: 'Database', color: 'bg-violet-500', usageKey: 'database_size' },
      { key: 'iops', label: 'IOPS', color: 'bg-emerald-500', usageKey: 'iops' },
      { key: 'storage_size', label: 'Storage', color: 'bg-sky-700', usageKey: 'storage_size' },
    ]

    return defs.map((d) => {
      const limitEntry = findLimit(d.key)
      const maxTotalRaw = limitEntry ? limitEntry.max_total : null
      const usedRaw = (usageObj as any)?.[d.usageKey] ?? null

      // compute display numbers using helpers
      const maxDisplay = d.key === 'iops'
        ? (maxTotalRaw == null ? 'unlimited' : formatRawNumber(maxTotalRaw))
        : (maxTotalRaw == null ? 'unlimited' : formatResource(d.key, maxTotalRaw))

      const usedDisplay = d.key === 'iops'
        ? (usedRaw == null ? '—' : formatRawNumber(usedRaw))
        : formatResource(d.key, usedRaw)

      // compute percent using divided numeric values
      const maxNum = typeof maxTotalRaw === 'number' ? divideValue(d.key, maxTotalRaw) : null
      const usedNum = typeof usedRaw === 'number' ? divideValue(d.key, usedRaw) : 0
      //@ts-ignore
      const pct = maxNum && maxNum > 0 ? Math.min(100, Math.max(0, (usedNum / maxNum) * 100)) : null

      return {
        key: d.key,
        label: d.label,
        usedRaw: usedRaw == null ? null : usedNum,
        maxRaw: maxTotalRaw == null ? null : maxNum,
        usedDisplay,
        maxDisplay,
        pct,
        color: d.color,
      }
    })
  }, [limitsArr, usageObj])

  const mostUsed = rows
    .slice()
    .filter((r) => r.pct != null)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0] ?? null

  return (
    <div className="rounded-md border p-4 bg-surface-100">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Project resources</h3>
          <p className="text-xs text-foreground-muted">Overall quotas and current usage</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-semibold">
                {loading ? '—' : mostUsed ? `${Math.round(mostUsed.pct ?? 0)}%` : '—'}
              </div>
              <div className="text-xs text-foreground-muted">
                {loading ? 'Loading' : mostUsed ? mostUsed.label : 'No data'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {loading ? (
          <div className="col-span-1 text-xs text-foreground-muted">Loading limits & usage…</div>
        ) : rows.length === 0 ? (
          <div className="col-span-1 text-xs text-foreground-muted">No resource information available.</div>
        ) : (
          rows.map((r) => {
            const pct = r.pct ?? 0
            const hasMax = r.maxRaw != null
            return (
              <div key={r.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-foreground">{r.label}</div>
                  <div className="text-xs text-foreground-muted">
                    {r.usedDisplay} / {r.maxDisplay}
                  </div>
                </div>

                <div className="w-full h-2 rounded bg-surface-200 overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-200')}
                    style={{ width: `${pct}%` }}
                  >
                    <div className={cn('h-full', r.color)} style={{ width: '100%' }} />
                  </div>
                </div>

                {r.pct != null ? (
                  <div className="text-xs text-foreground-muted mt-1">{Math.round(r.pct)}%</div>
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
