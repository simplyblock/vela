// components/OrganizationResourcesPanel.tsx
import React, { useMemo, useState } from 'react'
import { useOrganizationLimitsQuery } from 'data/resource-limits/organization-limits-query'
import { useOrganizationUsageQuery } from 'data/resources/organization-usage-query'
import { cn } from 'ui'
import { divideValue, formatResource } from '../Project/utils'

type Props = {
  orgRef?: string
}

type OrgLimitItem = {
  resource:
    | 'milli_vcpu'
    | 'ram'
    | 'iops'
    | 'storage_size'
    | 'database_size'
    | 'ram_bytes'
    | 'nvme_bytes'
    | 'storage_bytes'
  max_total: number | null
  max_per_branch: number | null
}

type OrgUsageShape = {
  milli_vcpu?: number | null | undefined
  ram?: number | null | undefined
  ram_bytes?: number | null | undefined
  iops?: number | null | undefined
  storage_size?: number | null | undefined
  storage_bytes?: number | null | undefined
  database_size?: number | null | undefined
  nvme_bytes?: number | null | undefined
}

/**
 * OrganizationResourcesPanel
 * Reads organization-wide limits (array) and usage (object) and renders rows.
 */
export default function OrganizationResourcesPanel({ orgRef }: Props) {
  const { data: limits, isLoading: loadingLimits } = useOrganizationLimitsQuery(
    { orgRef },
    { enabled: !!orgRef }
  )

  // Fix "last minute" window at mount time so the query key stays stable
  const [timeRange] = useState(() => {
    const now = Date.now() - 60_000
    return {
      start: new Date(Math.floor(now / 60_000) * 60_000).toISOString(),
    }
  })

  const { data: usage, isLoading: loadingUsage } = useOrganizationUsageQuery(
    {
      orgRef,
      start: timeRange.start,
    },
    { enabled: !!orgRef }
  )

  const loading = loadingLimits || loadingUsage

  // definitions: label, candidate keys for limits & usage, and color
  const defs = useMemo(
    () => [
      {
        id: 'milli_vcpu',
        label: 'vCPU',
        maxCandidates: ['milli_vcpu'],
        usedCandidates: ['milli_vcpu'],
        colorClass: 'bg-sky-500',
      },
      {
        id: 'ram',
        label: 'RAM',
        maxCandidates: ['ram', 'ram_bytes'],
        usedCandidates: ['ram', 'ram_bytes'],
        colorClass: 'bg-amber-500',
      },
      {
        id: 'nvme',
        label: 'Database',
        maxCandidates: ['database_size', 'nvme_bytes'],
        usedCandidates: ['database_size', 'nvme_bytes'],
        colorClass: 'bg-violet-500',
      },
      {
        id: 'iops',
        label: 'IOPS',
        maxCandidates: ['iops'],
        usedCandidates: ['iops'],
        colorClass: 'bg-emerald-500',
      },
      {
        id: 'storage',
        label: 'Storage',
        maxCandidates: ['storage_size', 'storage_bytes'],
        usedCandidates: ['storage_size', 'storage_bytes'],
        colorClass: 'bg-sky-700',
      },
    ],
    []
  )

  const rows = useMemo(() => {
    if (!limits && !usage) return []

    // helper: search limits array for resource candidate and return raw max_total (or null)
    const getLimitRaw = (candidates: string[]): { key: string | null; raw: number | null } => {
      if (!Array.isArray(limits)) return { key: null, raw: null }
      for (const candidate of candidates) {
        const found = limits.find((l: OrgLimitItem) => l.resource === candidate)
        if (found && typeof found.max_total === 'number')
          return { key: candidate, raw: found.max_total }
      }
      return { key: null, raw: null }
    }

    // helper: read usage object by candidate keys
    const getUsageRaw = (candidates: string[]): { key: string | null; raw: number | null } => {
      if (!usage) return { key: null, raw: null }
      for (const candidate of candidates) {
        const val = (usage as any)[candidate]
        if (typeof val === 'number') return { key: candidate, raw: val }
      }
      return { key: null, raw: null }
    }

    return (
      defs
        .map((d) => {
          const { key: maxKey, raw: maxRaw } = getLimitRaw(d.maxCandidates)
          const { key: usedKey, raw: usedRaw } = getUsageRaw(d.usedCandidates)

          // Prefer to use the same key for dividing/formatting if possible:
          // prefer the maxKey (so percent uses same unit as limit); else use usedKey; else first candidate
          const chosenKey = maxKey ?? usedKey ?? d.maxCandidates[0] ?? d.usedCandidates[0]

          const maxNum = typeof maxRaw === 'number' ? maxRaw : null
          const usedNumRaw = typeof usedRaw === 'number' ? usedRaw : 0

          // divide values using shared util to produce numbers in display units
          const maxDisplayNumber = maxKey ? divideValue(chosenKey!, maxNum) : null
          const usedDisplayNumber = divideValue(chosenKey!, usedNumRaw) ?? 0

          const pct =
            maxDisplayNumber != null && typeof maxDisplayNumber === 'number' && maxDisplayNumber > 0
              ? Math.min(100, Math.max(0, (usedDisplayNumber / maxDisplayNumber) * 100))
              : null

          return {
            id: d.id,
            label: d.label,
            // keep raw numbers for logic if you need them later (original API numbers)
            usedRaw: usedRaw == null ? null : usedNumRaw,
            maxRaw: maxRaw == null ? null : maxNum,
            // display strings come from shared formatter using the candidate key
            usedDisplay: formatResource(chosenKey!, usedRaw),
            maxDisplay: maxRaw == null ? 'unlimited' : formatResource(chosenKey!, maxRaw),
            pct,
            colorClass: d.colorClass,
          }
        })
        // hide rows that are entirely empty (no max and no usage)
        .filter((r) => r.usedRaw !== null || r.maxRaw !== null)
    )
  }, [limits, usage, defs])

  const mostUsed =
    rows
      .slice()
      .filter((r) => r.pct != null)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0] ?? null

  return (
    <div className="rounded-md border p-4 bg-surface-100">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Organization usage</h3>
          <p className="text-xs text-foreground-muted">
            Quota &amp; usage across the organization (last minute)
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm font-semibold">
            {loading ? '—' : mostUsed ? `${Math.round(mostUsed.pct ?? 0)}%` : '—'}
          </div>
          <div className="text-xs text-foreground-muted">
            {loading ? 'Loading' : mostUsed ? mostUsed.label : 'No data'}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {loading ? (
          <div className="col-span-1 text-xs text-foreground-muted">
            Loading limits &amp; usage…
          </div>
        ) : rows.length === 0 ? (
          <div className="col-span-1 text-xs text-foreground-muted">
            No resource information available.
          </div>
        ) : (
          rows.map((r) => {
            const pct = r.pct ?? 0
            const hasMax = r.maxRaw != null
            return (
              <div key={r.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-foreground">{r.label}</div>
                  <div className="text-xs text-foreground-muted">
                    {r.usedDisplay} / {r.maxDisplay}
                  </div>
                </div>

                <div className="w-full h-2 rounded bg-surface-200 overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-200', r.colorClass)}
                    style={{ width: `${pct}%` }}
                  />
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
