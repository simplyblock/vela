import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogSectionSeparator,
  DialogTitle,
  DialogTrigger,
  Label_Shadcn_,
  Slider_Shadcn_,
  Card,
} from 'ui'
import { toast } from 'sonner'

import {
  useBranchSliderResourceLimits,
  SliderSpecification,
  ResourceType,
} from 'data/resource-limits/branch-slider-resource-limits'
import { useBranchResizeMutation } from 'data/branches/branch-resize-mutation'
import { useEffectiveBranchLimitsQuery } from 'data/resource-limits/effective-branch-limits-query'

type BranchMaxResources = {
  milli_vcpu: number
  ram_bytes: number
  nvme_bytes: number
  iops: number
  storage_bytes?: number | null | undefined
}

type Props = {
  orgSlug: string
  projectRef: string
  branchId: string
  branchMax: BranchMaxResources
  ramUsageBytes: number // RAM usage as bytes (for “usage + 20%” rule)
  triggerClassName?: string
  isDisabled?: boolean
}

type FormValues = {
  milli_vcpu: number
  ram: number
  database_size: number
  iops: number
  storage_size: number
}

/**
 * BranchResizeModal (uses branchMax prop)
 *
 * - slider specs from useBranchSliderResourceLimits(orgSlug, projectRef)
 * - effective limits from useEffectiveBranchLimitsQuery
 * - current values read from branchMax prop
 * - displays current vs new values and submits changed API params
 */
export const BranchResizeModal: React.FC<Props> = ({
  orgSlug,
  projectRef,
  branchId,
  branchMax,
  ramUsageBytes,
  triggerClassName,
  isDisabled
}) => {
  const [open, setOpen] = useState(false)
  const { data: effectiveBranchLimits } = useEffectiveBranchLimitsQuery({
    orgRef: orgSlug,
    projectRef,
    branchRef: branchId
  })

  // slider specs (merged system + project limits)
  const { isLoading: specsLoading, data: specs } = useBranchSliderResourceLimits(
    undefined,
    orgSlug,
    projectRef
  )

  const resize = useBranchResizeMutation({
    onSuccess: () => {
      setOpen(false)
    },
  })

  const loading = specsLoading || resize.isLoading

  // react-hook-form
  const { register, setValue, watch, reset } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: {
      milli_vcpu: 0,
      ram: 0,
      database_size: 0,
      iops: 0,
      storage_size: 0,
    },
  })

  // convenience typed view of specs
  const sliderSpecs: Partial<Record<ResourceType, SliderSpecification>> = useMemo(() => {
    if (!specs) return {}
    return {
      milli_vcpu: specs.milli_vcpu,
      ram: specs.ram,
      iops: specs.iops,
      database_size: specs.database_size,
      storage_size: specs.storage_size,
    }
  }, [specs])

  const hasStorage =
    !!sliderSpecs.storage_size && branchMax.storage_bytes !== null && branchMax.storage_bytes !== undefined

  // helper: convert API value (branchMax) -> display value using spec.divider
  const apiToDisplay = (rk: ResourceType, apiVal?: number | null) => {
    const s = sliderSpecs[rk]
    if (!s || apiVal == null) return undefined
    return apiVal / s.divider
  }

  /**
   * Get effective maximum for slider by taking the minimum between:
   * 1. The spec's max value
   * 2. The effective branch limit (if available)
   */
  const getEffectiveMax = (rk: ResourceType, s: SliderSpecification): number => {
    let maxFromSpec = s.max
    
    // Get the effective branch limit for this resource type
    let effectiveLimitDisplay: number | null = null
    
    switch (rk) {
      case 'milli_vcpu':
        if (effectiveBranchLimits?.milli_vcpu != null) {
          effectiveLimitDisplay = (effectiveBranchLimits.milli_vcpu - branchMax.milli_vcpu) / s.divider
        }
        break
      case 'ram':
        if (effectiveBranchLimits?.ram != null) {
          effectiveLimitDisplay = (effectiveBranchLimits.ram - branchMax.ram_bytes) / s.divider
        }
        break
      case 'iops':
        if (effectiveBranchLimits?.iops != null) {
          effectiveLimitDisplay = (effectiveBranchLimits.iops - branchMax.iops) / s.divider
        }
        break
      case 'database_size':
        if (effectiveBranchLimits?.database_size != null) {
          effectiveLimitDisplay = (effectiveBranchLimits.database_size - branchMax.nvme_bytes) / s.divider
        }
        break
      case 'storage_size':
        if (effectiveBranchLimits?.storage_size != null && branchMax.storage_bytes != null) {
          effectiveLimitDisplay = (effectiveBranchLimits.storage_size - branchMax.storage_bytes) / s.divider
        }
        break
    }

    // If we have an effective limit, take the minimum between spec max and effective limit
    if (effectiveLimitDisplay != null) {
      return Math.min(maxFromSpec, effectiveLimitDisplay)
    }

    
    
    // Otherwise just use the spec max
    return maxFromSpec
  }

  /**
   * Effective minimum per resource type, applying downsizing rules:
   *
   * - milli_vcpu: can downsize to spec.min (capped by effective max)
   * - iops:       can downsize to spec.min (capped by effective max)
   * - ram:        can downsize to max(spec.min, ramUsage + 20%) (capped by effective max)
   * - database_size: cannot downsize -> min = current (capped by effective max)
   * - storage_size:  cannot downsize -> min = current (only if we have storage) (capped by effective max)
   */
  const getEffectiveMin = (rk: ResourceType, s: SliderSpecification): number => {
    const effectiveMax = getEffectiveMax(rk, s)
    
    let minValue: number
    
    switch (rk) {
      case 'ram': {
        const usageBytes = ramUsageBytes ?? 0
        const usageDisplay = usageBytes / s.divider
        const lowerBound = usageDisplay * 1.2
        minValue = Math.max(s.min, lowerBound)
        break
      }
      case 'database_size': {
        const currentDisplay = apiToDisplay('database_size', branchMax?.nvme_bytes ?? null)
        if (currentDisplay == null) minValue = s.min
        else minValue = Math.max(s.min, currentDisplay)
        break
      }
      case 'storage_size': {
        const currentDisplay = apiToDisplay('storage_size', branchMax?.storage_bytes ?? null)
        if (currentDisplay == null) minValue = s.min
        else minValue = Math.max(s.min, currentDisplay)
        break
      }
      // milli_vcpu and iops can go all the way down to spec.min
      case 'milli_vcpu':
      case 'iops':
      default:
        minValue = s.min
    }
    
    // Ensure min doesn't exceed max
    return Math.min(effectiveMax, minValue)
  }

  // handy RAM info for the explanation card
  const ramInfo = useMemo(() => {
    const s = sliderSpecs.ram
    if (!s) return null
    const usageDisplay = ramUsageBytes ? ramUsageBytes / s.divider : undefined
    const minDisplay = getEffectiveMin('ram', s)
    const maxDisplay = getEffectiveMax('ram', s)
    return {
      usageDisplay,
      minDisplay,
      maxDisplay,
      unit: s.unit,
    }
  }, [sliderSpecs, ramUsageBytes, effectiveBranchLimits])

  // initialize form values when modal opens (use branchMax when available, else spec.initial / effectiveMin)
  useEffect(() => {
    if (!open) return
    if (!specs) return

    const initial: Partial<FormValues> = {}

    const pick = (rk: ResourceType) => {
      const s = sliderSpecs[rk]
      if (!s) return 0

      const effectiveMin = getEffectiveMin(rk, s)
      const effectiveMax = getEffectiveMax(rk, s)

      let apiCurrent: number | null = null
      switch (rk) {
        case 'milli_vcpu':
          apiCurrent = branchMax?.milli_vcpu ?? null
          break
        case 'ram':
          apiCurrent = branchMax?.ram_bytes ?? null
          break
        case 'iops':
          apiCurrent = branchMax?.iops ?? null
          break
        case 'database_size':
          apiCurrent = branchMax?.nvme_bytes ?? null
          break
        case 'storage_size':
          apiCurrent = hasStorage ? branchMax?.storage_bytes ?? null : null
          break
      }

      if (apiCurrent != null) {
        const displayVal = apiCurrent / s.divider
        // Clamp between effective min and max
        return Math.min(effectiveMax, Math.max(effectiveMin, displayVal))
      }

      if (typeof s.initial === 'number') {
        const displayVal = s.initial
        // Clamp between effective min and max
        return Math.min(effectiveMax, Math.max(effectiveMin, displayVal))
      }

      return effectiveMin
    }

    initial.milli_vcpu = pick('milli_vcpu')
    initial.ram = pick('ram')
    initial.iops = pick('iops')
    initial.database_size = pick('database_size')
    if (hasStorage) {
      initial.storage_size = pick('storage_size')
    }

    reset(initial as FormValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, specs, branchMax, ramUsageBytes, hasStorage, effectiveBranchLimits])

  // build parameters: convert display -> API units using spec.divider, compare to branchMax and include only diffs
  const buildParameters = () => {
    const values = watch()
    const params: {
      milli_vcpu?: number | null
      memory_bytes?: number | null
      iops?: number | null
      database_size?: number | null
      storage_size?: number | null
    } = {}

    const cur = branchMax

    const diffSet = (
      rk: ResourceType,
      displayVal: number | undefined,
      curApi: number | null | undefined,
      targetKey: keyof typeof params
    ) => {
      const s = sliderSpecs[rk]
      if (!s || displayVal == null) return
      const apiVal = displayVal * s.divider
      if (curApi == null || apiVal !== curApi) params[targetKey] = apiVal
    }

    diffSet('milli_vcpu', values.milli_vcpu, cur.milli_vcpu, 'milli_vcpu')
    diffSet('ram', values.ram, cur.ram_bytes, 'memory_bytes')
    diffSet('iops', values.iops, cur.iops, 'iops')
    diffSet('database_size', values.database_size, cur.nvme_bytes, 'database_size')

    // storage_size: if we *don't* have storage, we explicitly send null
    if (!hasStorage) {
      params.storage_size = null
    } else {
      diffSet('storage_size', values.storage_size, cur.storage_bytes ?? null, 'storage_size')
    }

    return params
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!specs) {
      toast.error('Slider configuration missing')
      return
    }
    if (!orgSlug || !projectRef || !branchId) {
      toast.error('Missing references')
      return
    }

    const parameters = buildParameters()
    if (Object.keys(parameters).length === 0) {
      toast.info('No changes to apply')
      return
    }

    resize.mutate(
      { orgSlug, projectRef, branch: branchId, parameters: parameters as any },
      {
        onError: (err: any) => toast.error(err?.message ?? 'Failed to resize branch'),
      }
    )
  }

  // render a slider row with Current (from branchMax) and New values
  const renderSliderRow = (rk: ResourceType) => {
    const s = sliderSpecs[rk]
    if (!s) return null

    const currentDisplay = (() => {
      switch (rk) {
        case 'milli_vcpu':
          return apiToDisplay('milli_vcpu', branchMax?.milli_vcpu ?? null)
        case 'ram':
          return apiToDisplay('ram', branchMax?.ram_bytes ?? null)
        case 'iops':
          return apiToDisplay('iops', branchMax?.iops ?? null)
        case 'database_size':
          return apiToDisplay('database_size', branchMax?.nvme_bytes ?? null)
        case 'storage_size':
          return hasStorage ? apiToDisplay('storage_size', branchMax?.storage_bytes ?? null) : undefined
        default:
          return undefined
      }
    })()

    const value = watch(rk as keyof FormValues) as number
    const effectiveMin = getEffectiveMin(rk, s)
    const effectiveMax = getEffectiveMax(rk, s)

    // Check if effective max is different from spec max (meaning effective limits are applied)
    const isLimitedByEffective = effectiveMax < s.max

    return (
      <div key={rk} className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <Label_Shadcn_ htmlFor={`resize-${rk}`}>{s.label ?? rk}</Label_Shadcn_>
          <div className="text-right">
            <div className="text-[11px] text-foreground-muted font-mono">
              Current:{' '}
              <span className="inline-block w-20 text-right">
                {currentDisplay ?? '—'}
              </span>{' '}
              {s.unit}
            </div>
            <div className="text-[11px] text-foreground-muted font-mono">
              New:{' '}
              <span className="inline-block w-20 text-right">
                {value}
              </span>{' '}
              {s.unit}
            </div>
            <div className="text-[10px] text-foreground-muted font-mono">
              Min allowed: {effectiveMin} {s.unit}
            </div>
            {isLimitedByEffective && (
              <div className="text-[10px] text-warning font-mono">
                Max limited: {effectiveMax} {s.unit}
              </div>
            )}
          </div>
        </div>

        <input type="hidden" {...register(rk as keyof FormValues)} />

        <Slider_Shadcn_
          id={`resize-${rk}`}
          min={effectiveMin}
          max={effectiveMax}
          step={s.step}
          value={[value]}
          onValueChange={(v) => {
            const [next] = v
            setValue(rk as keyof FormValues, next, {
              shouldDirty: true,
              shouldValidate: false,
            })
          }}
          disabled={loading}
        />
      </div>
    )
  }

  const configMissing = !specs || Object.keys(specs).length === 0

  return (
    <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
      <DialogTrigger asChild>
        <Button disabled={isDisabled} type="default" className={triggerClassName}>
          Resize branch
        </Button>
      </DialogTrigger>

      <DialogContent size="xxlarge" className="max-h-[85vh] overflow-y-auto p-0">
        <form onSubmit={onSubmit} className="flex flex-col">
          <DialogHeader padding="small" className="border-b">
            <DialogTitle>Resize branch</DialogTitle>
          </DialogHeader>

          <DialogSection padding="medium" className="space-y-6">
            {configMissing ? (
              <Card className="p-4">
                <p className="text-sm text-foreground-muted">
                  Unable to load slider configuration. Please try again later.
                </p>
              </Card>
            ) : (
              <>
                {/* Explanation card: what is downsizeable and the RAM thresholds */}
                <Card className="p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">How resizing works</p>
                  <ul className="list-disc pl-4 text-xs text-foreground-muted space-y-1">
                    <li>CPU (vCPU) and IOPS can be resized up or down within their limits.</li>
                    <li>
                      RAM can only be decreased down to 120% of the current RAM usage to avoid
                      over-aggressive downsizing.
                    </li>
                    <li>
                      Database size
                      {hasStorage && ' and file storage size'} can only be increased, not decreased.
                    </li>
                    {effectiveBranchLimits && (
                      <li className="text-warning">
                        Some limits may be restricted by organizational or project quotas. (highlighted by this color)
                      </li>
                    )}
                  </ul>
                  {ramInfo && (
                    <div className="mt-2 text-xs text-foreground-muted font-mono space-y-1">
                      {ramInfo.usageDisplay !== undefined && (
                        <div>
                          Current RAM usage: {ramInfo.usageDisplay} {ramInfo.unit}
                        </div>
                      )}
                      <div>
                        Allowed RAM range: {ramInfo.minDisplay} - {ramInfo.maxDisplay} {ramInfo.unit}
                      </div>
                    </div>
                  )}
                </Card>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Database &amp; compute</p>
                  <div className="grid gap-6 md:grid-cols-2">
                    {renderSliderRow('milli_vcpu')}
                    {renderSliderRow('ram')}
                    {renderSliderRow('database_size')}
                    {renderSliderRow('iops')}
                    {hasStorage && renderSliderRow('storage_size')}
                  </div>
                </div>
              </>
            )}
          </DialogSection>

          <DialogSectionSeparator />

          <DialogFooter padding="small" className="gap-2">
            <Button
              type="default"
              htmlType="button"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              disabled={loading || configMissing}
            >
              Apply changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default BranchResizeModal