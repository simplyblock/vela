import { formatBytes } from 'lib/helpers'

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
  | 'milli_vcpu_raw' // if you have raw variants (optional)

type ResourceMeta = {
  divider: number
  // normalized unit used for formatting
  unit: 'vCPU' | 'GiB' | 'GB' | 'IOPS' | 'count'
  // optional flag to prefer GiB vs GB for bytes
  preferGiB?: boolean
}

/**
 * Centralized metadata for resources.
 * - divider: the number to divide the raw API value by to get the display value
 * - unit: display unit used by formatResource
 */
const RESOURCE_META: Record<string, ResourceMeta> = {
  milli_vcpu: { divider: 1000, unit: 'vCPU' },
  ram: { divider: 1024 ** 3, unit: 'GiB', preferGiB: true },
  ram_bytes: { divider: 1024 ** 3, unit: 'GiB', preferGiB: true },
  nvme_bytes: { divider: 1_000_000_000, unit: 'GB' },
  database_size: { divider: 1_000_000_000, unit: 'GB' },
  storage_bytes: { divider: 1_000_000_000, unit: 'GB' },
  storage_size: { divider: 1_000_000_000, unit: 'GB' },
  iops: { divider: 1, unit: 'IOPS' },
  // fallback: count -> not divided
}

/** Return metadata for a resource key. Falls back to count unit. */
export function getResourceMeta(key: string): ResourceMeta {
  return (RESOURCE_META[key] as ResourceMeta) ?? { divider: 1, unit: 'count' }
}

/** Convert raw API number to display number (e.g. bytes -> GB number, millis -> vCPU number). */
export function divideValue(key: string, raw: number | null | undefined): number | null {
  if (raw == null) return null
  const meta = getResourceMeta(key)
  if (meta.divider === 0) return raw
  return raw / meta.divider
}

/** Format a value for UI using the meta rules:
 *  - for GiB/GB: show 2 decimals when < 10, else rounded
 *  - for vCPU: 1 decimal if fractional, else no decimals
 *  - for IOPS/count: locale string
 */
export function formatResource(key: string, raw: number | null | undefined): string {
  const meta = getResourceMeta(key)
  const value = divideValue(key, raw)

  if (value == null) return '—'

  if (meta.unit === 'GB') return formatBytes(raw, 'decimal', value < 10 ? 2 : 0)
  if (meta.unit === 'GiB') return formatBytes(raw, 'binary', value < 10 ? 2 : 0)

  if (meta.unit === 'vCPU') {
    return value % 1 === 0 ? `${value.toFixed(0)} ${meta.unit}` : `${value.toFixed(1)} ${meta.unit}`
  }

  if (meta.unit === 'IOPS' || meta.unit === 'count') {
    return Math.round(value).toLocaleString()
  }

  // fallback
  return `${value.toLocaleString()} ${meta.unit}`
}

/** Format raw numbers (for numeric-only resources e.g. iops) */
export function formatRawNumber(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}
