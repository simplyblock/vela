// lib/resource-utils.ts
export type ResourceKey =
  | 'milli_vcpu'
  | 'ram'
  | 'ram_bytes'
  | 'nvme_bytes'
  | 'storage_bytes'
  | 'database_size'
  | 'storage_size'
  | 'iops'
  | 'milli_vcpu' // keep for clarity

// canonical units used across components
export const DIVIDERS = {
  milli_vcpu: 1000, // API returns millis; convert to vCPU
  ram: 1024 ** 3, // bytes -> GiB
  ram_bytes: 1024 ** 3,
  nvme_bytes: 1_000_000_000, // bytes -> GB (decimal)
  storage_bytes: 1_000_000_000,
  database_size: 1_000_000_000,
  storage_size: 1_000_000_000,
  iops: 1,
} as const

export type DividerMap = typeof DIVIDERS

export function getDivider(key: ResourceKey | string): number {
  // runtime-safe lookup; fallback to 1
  return (DIVIDERS as any)[key] ?? 1
}

export function toDisplayNumber(raw: number | null | undefined, key: ResourceKey | string) {
  if (raw == null) return null
  const divider = getDivider(key)
  return raw / divider
}

/** Formatters for UI display */
export function formatForUnit(
  raw: number | null | undefined,
  key: ResourceKey | string
): string {
  if (raw == null) return '—'
  const divider = getDivider(key)
  const unitKey = key
  const v = raw / divider

  if(unitKey === 'iops') {
    return new Intl.NumberFormat().format(v) 
  }

  // heuristics to match previous components' behavior
  if (unitKey === 'milli_vcpu') {
    // show vCPU with 0 or 1 decimal
    return v % 1 === 0 ? `${v.toFixed(0)} vCPU` : `${v.toFixed(1)} vCPU`
  }

  if (unitKey === 'ram' || unitKey === 'ram_bytes') {
    // GiB
    return v < 10 ? `${v.toFixed(2)} GiB` : `${Math.round(v)} GiB`
  }

  if (unitKey === 'nvme_bytes' || unitKey === 'database_size' || unitKey === 'storage_bytes' || unitKey === 'storage_size') {
    // GB decimal
    return v < 10 ? `${v.toFixed(2)} GB` : `${Math.round(v)} GB`
  }

  // iops or fallback numeric
  return Number.isFinite(v) ? v.toLocaleString() : '—'
}
