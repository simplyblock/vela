import { useEffect, useMemo, useState } from 'react'
import { useController, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout/ProjectLayout'
import { NextPageWithLayout } from 'types'
import {
  Button,
  Label_Shadcn_,
  Slider_Shadcn_,
  Form_Shadcn_,
  FormField_Shadcn_,
  cn,
  Card,
} from 'ui'

import { useParams } from 'common'
import { useProjectLimitsQuery } from 'data/resources/project-limits-query'
import { useProjectLimitUpdateMutation } from 'data/resources/project-limit-update-mutation'
import {
  useBranchSliderResourceLimits,
  SliderSpecification,
  ResourceType,
} from 'data/resource-limits/branch-slider-resource-limits'
import { useProjectUsageQuery } from 'data/resources/project-usage-query'
import { useResourceLimitDefinitionsQuery } from 'data/resource-limits/resource-limit-definitions-query'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'

/* ──────────────────────────────────────────────────────────────────
   Types & slider config
------------------------------------------------------------------- */

type SliderKey = 'vcpu' | 'ram' | 'nvme' | 'iops' | 'storage'
type FormValues = { perBranch: Record<SliderKey, number>; project: Record<SliderKey, number> }

type SliderConfig = {
  key: SliderKey
  label: string
  resourceType: ResourceType
}

const SLIDERS: SliderConfig[] = [
  { key: 'vcpu', label: 'vCPU', resourceType: 'milli_vcpu' },
  { key: 'ram', label: 'RAM', resourceType: 'ram' },
  { key: 'nvme', label: 'Database storage', resourceType: 'database_size' },
  { key: 'iops', label: 'IOPS', resourceType: 'iops' },
  { key: 'storage', label: 'Storage', resourceType: 'storage_size' },
]

const SLIDER_KEYS: SliderKey[] = SLIDERS.map((s) => s.key)

/* ──────────────────────────────────────────────────────────────────
   SliderField
------------------------------------------------------------------- */

const SliderField = ({
  name,
  label,
  unit,
  min,
  max,
  step,
  usage,
  current,
  onCommit,
  showUsage = true,
  readOnly = false,
}: {
  name: `perBranch.${SliderKey}` | `project.${SliderKey}`
  label: string
  unit: string
  min: number
  max: number
  step: number
  usage: number
  current: number
  onCommit: (next: number) => void
  showUsage?: boolean
  readOnly?: boolean
}) => {
  const { field } = useController({ name })
  const value = field.value as number

  const usagePct = showUsage && value > 0 ? (usage / value) * 100 : 0
  const nearLimit = showUsage && usagePct > 90

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between">
        <Label_Shadcn_ htmlFor={name} className="text-xs font-medium text-foreground">
          {label}
        </Label_Shadcn_>
        <div className="text-right">
          {/* Always render this row to keep height consistent */}
          <div
            className={cn(
              'text-[11px] font-mono',
              nearLimit ? 'text-destructive' : 'text-foreground-muted',
              !showUsage && 'invisible'
            )}
          >
            Usage:{' '}
            <span className="inline-block w-16 text-right">
              {usage}
            </span>{' '}
            {unit}
          </div>
          <div className="text-[11px] text-foreground-muted font-mono">
            Current:{' '}
            <span className="inline-block w-16 text-right">
              {current}
            </span>{' '}
            {unit}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-grow">
          <Slider_Shadcn_
            id={name}
            min={min}
            max={max}
            step={step}
            value={[value]}
            onValueChange={(v) => {
              if (readOnly) return
              field.onChange(v[0])
            }}
            onValueCommit={(v) => {
              if (readOnly) return
              const next = v[0]
              onCommit(next)
            }}
            className="w-full"
            disabled={readOnly}
          />
        </div>
        <div className="w-20 text-right text-[11px] text-foreground-muted font-mono">
          {value} {unit}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Page
------------------------------------------------------------------- */

const ResourceLimit: NextPageWithLayout = () => {

  const {can: canWriteSettings,isSuccess: isWriteSettingsPermissionSuccess} = useCheckPermissions("project:settings:write")

  const isReadOnly = isWriteSettingsPermissionSuccess ? !canWriteSettings : true
  const [timeRange] = useState(() => {
    const now = Date.now() - 60_000
    return {
      start: new Date(Math.floor(now / 60_000) * 60_000).toISOString(),
    }
  })

  const { slug: orgRef, ref: projectRef } = useParams() as { slug?: string; ref?: string }

  const { data: limitsData } = useProjectLimitsQuery({ orgRef, projectRef })
  const { data: usageData } = useProjectUsageQuery({
    orgRef,
    projectRef,
    start: timeRange.start,
  })

  const { data: sliderSpecs, isLoading: sliderLoading } = useBranchSliderResourceLimits(
    undefined,
    orgRef,
    projectRef
  )

  const { data: definitions, isLoading: defsLoading } = useResourceLimitDefinitionsQuery({
    orgId: orgRef,
  })

  const { mutateAsync: updateLimit, isLoading: isSaving } = useProjectLimitUpdateMutation()

  // Map ResourceType-based specs to SliderKey-based config
  const limitConfig: Record<SliderKey, SliderSpecification> | null = useMemo(() => {
    if (!sliderSpecs) return null

    const map = {} as Record<SliderKey, SliderSpecification>

    SLIDERS.forEach((slider) => {
      const spec = sliderSpecs[slider.resourceType]
      if (spec) {
        map[slider.key] = spec
      }
    })

    return Object.keys(map).length ? map : null
  }, [sliderSpecs])

  // System absolute max per slider key, in display units
  const systemMaxByKey = useMemo(() => {
    const base: Partial<Record<SliderKey, number>> = {}
    if (!definitions || !limitConfig) return base

    SLIDERS.forEach((slider) => {
      const cfg = limitConfig[slider.key]
      if (!cfg) return

      const def = definitions.find((d) => d.resource_type === slider.resourceType)
      if (!def || def.max == null) return

      base[slider.key] = def.max / cfg.divider
    })

    return base
  }, [definitions, limitConfig])

  // usage -> UI units (project-wide usage)
  const usageByKey = useMemo(() => {
    const base: Partial<Record<SliderKey, number>> = {}
    if (!usageData || !limitConfig) return base

    SLIDERS.forEach((slider) => {
      const cfg = limitConfig[slider.key]
      const raw = (usageData as any)?.[slider.resourceType]
      if (raw != null && cfg) {
        base[slider.key] = raw / cfg.divider
      }
    })

    return base
  }, [usageData, limitConfig])

  // defaults from project limits
  const defaults: FormValues | null = useMemo(() => {
    if (!limitsData || !limitConfig) return null

    const perBranch: Record<SliderKey, number> = {
      vcpu: 0,
      ram: 0,
      iops: 0,
      storage: 0,
      nvme: 0,
    }
    const project: Record<SliderKey, number> = {
      vcpu: 0,
      ram: 0,
      iops: 0,
      storage: 0,
      nvme: 0,
    }

    for (const lim of limitsData) {
      const slider = SLIDERS.find((s) => s.resourceType === lim.resource)
      if (!slider) continue
      const key = slider.key
      const cfg = limitConfig[key]
      const div = cfg.divider || 1
      perBranch[key] = (lim.max_per_branch ?? 0) / div
      project[key] = (lim.max_total ?? 0) / div
    }

    // Make sure we don't start below usage / min / per-branch, and not above system max
    SLIDER_KEYS.forEach((key) => {
      const usage = usageByKey[key] ?? 0
      const min = limitConfig[key].min
      const systemMax = systemMaxByKey[key]

      perBranch[key] = Math.max(perBranch[key], usage, min)
      project[key] = Math.max(project[key], perBranch[key], usage, min)

      if (systemMax != null) {
        perBranch[key] = Math.min(perBranch[key], systemMax)
        project[key] = Math.min(project[key], systemMax)
      }
    })

    return { perBranch, project }
  }, [limitsData, limitConfig, usageByKey, systemMaxByKey])

  const form = useForm<FormValues>({
    mode: 'onChange',
    defaultValues:
      defaults ?? {
        perBranch: { vcpu: 0, ram: 0, iops: 0, nvme: 0, storage: 0 },
        project: { vcpu: 0, ram: 0, iops: 0, nvme: 0, storage: 0 },
      },
  })

  useEffect(() => {
    if (defaults) form.reset(defaults)
  }, [defaults, form])

  const perBranch = useWatch({ control: form.control, name: 'perBranch' })
  const project = useWatch({ control: form.control, name: 'project' })

  const limitsLoading = sliderLoading || defsLoading || !limitConfig || !defaults

  // Commit handlers
  const commitPerBranch = (key: SliderKey) => (next: number) => {
    if (!limitConfig) return
    const usage = usageByKey[key] ?? 0
    const cfg = limitConfig[key]
    const upperBound = systemMaxByKey[key] ?? cfg.max

    const clamped = Math.min(Math.max(next, Math.max(cfg.min, usage)), upperBound)
    form.setValue(`perBranch.${key}`, clamped, { shouldDirty: true, shouldValidate: false })

    const projVal = form.getValues(`project.${key}`)
    if (clamped > projVal) {
      form.setValue(`project.${key}`, clamped, { shouldDirty: true, shouldValidate: false })
    }
  }

  const commitProject = (key: SliderKey) => (next: number) => {
    if (!limitConfig) return
    const usage = usageByKey[key] ?? 0
    const cfg = limitConfig[key]
    const branchVal = form.getValues(`perBranch.${key}`)
    const lowerBound = Math.max(cfg.min, usage, branchVal)
    const upperBound = systemMaxByKey[key] ?? cfg.max
    const clamped = Math.min(Math.max(next, lowerBound), upperBound)
    form.setValue(`project.${key}`, clamped, { shouldDirty: true, shouldValidate: false })
  }

  const handleSave = async () => {
    if (!orgRef || !projectRef) {
      toast.error('Missing organization or project reference')
      return
    }
    if (!limitConfig || !defaults) {
      toast.error('Limits not loaded yet')
      return
    }

    const values = form.getValues()
    const changed = SLIDER_KEYS.filter(
      (k) =>
        values.perBranch[k] !== defaults.perBranch[k] ||
        values.project[k] !== defaults.project[k]
    )

    if (changed.length === 0) {
      toast.info('No changes to save')
      return
    }

    try {
      for (const k of changed) {
        const cfg = limitConfig[k]
        const divider = cfg.divider || 1
        const usage = usageByKey[k] ?? 0
        const slider = SLIDERS.find((s) => s.key === k)
        if (!slider) continue

        const label = slider.label
        const resourceType = slider.resourceType

        if (values.perBranch[k] < usage || values.project[k] < usage) {
          toast.error(`Cannot set ${label} below current usage (${usage} ${cfg.unit})`)
          continue
        }

        await updateLimit({
          orgRef,
          projectRef,
          limit: {
            resource: resourceType,
            max_per_branch: values.perBranch[k] * divider,
            max_total: values.project[k] * divider,
          },
        })
      }

      toast.success('Limits updated')
      form.reset(values)
    } catch (e) {
      console.error(e)
      toast.error('Failed to update limits')
    }
  }

  return (
    <Form_Shadcn_ {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (isReadOnly) return 
          handleSave()
        }}
        className="flex flex-col gap-8 p-16 w-full justify-center "
      >
        <header>
          <h1 className="text-xl font-semibold">Resource limits</h1>
          <p className="text-sm text-foreground-muted">
            Adjust per-branch and project ceilings. We only raise the lower side to maintain consistency while you drag.
          </p>
        </header>

        <div
          className={cn(
            'grid gap-12 xl:grid-cols-2',
            (isSaving || isReadOnly) && 'opacity-50 pointer-events-none' 
          )}
        >
                    {/* Project limits */}
          <Card className="p-5 space-y-4">
            <p className="font-medium text-sm text-foreground">Project limits</p>

            {limitsLoading ? (
              <p className="text-sm text-foreground-muted">Loading limits…</p>
            ) : (
              SLIDERS.map((slider) => {
                const cfg = limitConfig[slider.key]
                const usage = usageByKey[slider.key] ?? 0
                const systemMax = systemMaxByKey[slider.key]
                const projectMax = systemMax != null ? systemMax : cfg.max

                return (
                  <FormField_Shadcn_
                    key={`proj-${slider.key}`}
                    control={form.control}
                    name={`project.${slider.key}`}
                    render={() => (
                      <SliderField
                        name={`project.${slider.key}`}
                        label={cfg.label}
                        unit={cfg.unit}
                        min={cfg.min}
                        max={projectMax}
                        step={cfg.step}
                        usage={usage}
                        current={defaults!.project[slider.key]}
                        onCommit={commitProject(slider.key)}
                        showUsage={true}
                        readOnly={isReadOnly}
                      />
                    )}
                  />
                )
              })
            )}

            <p className="text-[11px] leading-snug text-foreground-muted">
              Global ceilings across all branches in this project.
            </p>
          </Card>
          {/* Per-branch */}
          <Card className="p-5 space-y-4">
            <p className="font-medium text-sm text-foreground">Sizing (per branch)</p>

            {limitsLoading ? (
              <p className="text-sm text-foreground-muted">Loading limits…</p>
            ) : (
              SLIDERS.map((slider) => {
                const cfg = limitConfig[slider.key]
                const usage = 0
                const systemMax = systemMaxByKey[slider.key]
                const branchMax = systemMax != null ? systemMax : cfg.max

                return (
                  <FormField_Shadcn_
                    key={`per-${slider.key}`}
                    control={form.control}
                    name={`perBranch.${slider.key}`}
                    render={() => (
                      <SliderField
                        name={`perBranch.${slider.key}`}
                        label={cfg.label}
                        unit={cfg.unit}
                        min={cfg.min}
                        max={branchMax}
                        step={cfg.step}
                        usage={usage}
                        current={defaults!.perBranch[slider.key]}
                        onCommit={commitPerBranch(slider.key)}
                        showUsage={false}
                        readOnly={isReadOnly}
                      />
                    )}
                  />
                )
              })
            )}

            <p className="text-[11px] leading-snug text-foreground-muted">
              Resource allocation per branch.
            </p>
          </Card>


        </div>

        {!isReadOnly && (
          <div className="flex justify-end">
          <Button
            type="primary"
            htmlType="submit"
            loading={isSaving}
            disabled={isSaving || limitsLoading}
          >
            Save changes
          </Button>
        </div>)}
      </form>
    </Form_Shadcn_>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Layout wrappers
------------------------------------------------------------------- */

ResourceLimit.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth>{page}</ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ResourceLimit
