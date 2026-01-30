import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { PropsWithChildren, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { LOCAL_STORAGE_KEYS, useParams } from 'common'
import { NotOrganizationOwnerWarning } from 'components/interfaces/Organization/NewProject'
import { OrgNotFound } from 'components/interfaces/Organization/OrgNotFound'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { WizardLayoutWithoutAuth } from 'components/layouts/WizardLayout'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'
import { useAuthorizedAppsQuery } from 'data/oauth/authorized-apps-query'
import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { DesiredInstanceSize } from 'data/projects/new-project.constants'
import {
  ProjectCreateVariables,
  useProjectCreateMutation,
} from 'data/projects/project-create-mutation'
import { useProjectsQuery } from 'data/projects/projects-query'
import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { useLocalStorageQuery } from 'hooks/misc/useLocalStorage'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { withAuth } from 'hooks/misc/withAuth'
import { useResourceLimitDefinitionsQuery } from 'data/resource-limits/resource-limit-definitions-query'
import type { NextPageWithLayout } from 'types'
import {
  Button,
  Checkbox_Shadcn_,
  Form_Shadcn_,
  FormField_Shadcn_,
  Input_Shadcn_,
  Label_Shadcn_,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectGroup_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
  Slider_Shadcn_,
} from 'ui'
import { getPathReferences } from 'data/vela/path-references'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'
import WideWizardLayout from 'components/layouts/WideWizardLayout'
import { components } from 'data/vela/vela-schema'

/* ------------------------------------------------------------------ */
/* Types / labels                                                     */
/* ------------------------------------------------------------------ */

type SliderKey = 'vcpu' | 'ram' | 'nvme' | 'iops' | 'storage'

const LABELS: Record<SliderKey, string> = {
  vcpu: 'vCPU',
  ram: 'RAM',
  nvme: 'Database storage',
  iops: 'IOPS',
  storage: 'Storage',
}

type LimitCfg = {
  label: string
  min: number
  max: number
  step: number
  unit: string
  divider: number
}
type LimitMap = Partial<Record<SliderKey, LimitCfg>>

// API mapping for submit payload
const FORM_TO_API: Record<SliderKey, 'milli_vcpu' | 'ram' | 'iops' | 'database_size' | 'storage_size'> = {
  vcpu: 'milli_vcpu',
  ram: 'ram',
  iops: 'iops',
  nvme: 'database_size',
  storage: 'storage_size',
}

const API_TO_FORM: Record<string, SliderKey | undefined> = Object.entries(FORM_TO_API).reduce(
  (acc, [formKey, apiKey]) => {
    acc[apiKey] = formKey as SliderKey
    return acc
  },
  {} as Record<string, SliderKey | undefined>
)

/* ------------------------------------------------------------------ */
/* Schema                                                             */
/* ------------------------------------------------------------------ */

const FormSchema = z.object({
  organization: z.string({ required_error: 'Please select an organization' }),
  projectName: z
    .string()
    .trim()
    .min(1, 'Please enter a project name.')
    .min(3, 'Project name must be at least 3 characters long.')
    .max(64, 'Project name must be no longer than 64 characters.'),
  instanceSize: z.string(),
  dataApi: z.boolean(),
  useApiSchema: z.boolean(),
  postgresVersionSelection: z.string(),
  includeFileStorage: z.boolean(),
  enableHa: z.boolean(),
  readReplicas: z.number(),
  perBranchLimits: z.record(z.number()),
  projectLimits: z.record(z.number()),
})

export type CreateProjectForm = z.infer<typeof FormSchema>

/* ------------------------------------------------------------------ */
/* Reusable slider row                                                */
/* ------------------------------------------------------------------ */

// Reusable slider row (label + current value on right + slider)
const SliderRow = ({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
  helper,
  error,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled?: boolean
  onChange: (v: number[]) => void
  helper?: React.ReactNode
  error?: string | null
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-[12px] leading-none">
      <Label_Shadcn_ htmlFor={id} className="text-foreground whitespace-nowrap pr-2">
        {label}
      </Label_Shadcn_>
      <span className="text-foreground-muted whitespace-nowrap">
        {value} {unit}
      </span>
    </div>
    <Slider_Shadcn_
      id={id}
      min={min}
      max={max}
      step={step}
      value={[value]}
      onValueChange={onChange}
      disabled={disabled}
    />
    {helper}
    {error && <div className="text-xs text-destructive mt-1">{error}</div>}
  </div>
)


/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

const sizes: DesiredInstanceSize[] = ['micro', 'small', 'medium']
const sizesWithNoCostConfirmationRequired: DesiredInstanceSize[] = ['micro', 'small']
const GIB = 1024 * 1024 * 1024

const CreateProjectPage: NextPageWithLayout = () => {
  const router = useRouter()
  const { projectName } = useParams()
  const { slug } = getPathReferences()

  const { data: currentOrg } = useSelectedOrganizationQuery()
  const [lastVisitedOrganization] = useLocalStorageQuery(LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION, '')

  useEffect(() => {
    if (slug === 'last-visited-org') {
      if (lastVisitedOrganization) router.replace(`/new/${lastVisitedOrganization}`, undefined, { shallow: true })
      else router.replace(`/new/_`, undefined, { shallow: true })
    }
  }, [slug, lastVisitedOrganization, router])

  const { mutate: sendEvent } = useSendEventMutation()
  const { data: approvedOAuthApps } = useAuthorizedAppsQuery({ slug }, { enabled: slug !== '_' })
  const hasOAuthApps = !!approvedOAuthApps?.length

  const [isComputeCostsConfirmationModalVisible, setIsComputeCostsConfirmationModalVisible] = useState(false)

  const { data: organizations, isSuccess: isOrganizationsSuccess } = useOrganizationsQuery()
  const isAdmin = useCheckPermissions('env:projects:create')
  const isInvalidSlug = isOrganizationsSuccess && currentOrg === undefined
  const orgNotFound = isOrganizationsSuccess && (organizations?.length ?? 0) > 0 && isInvalidSlug
  const isEmptyOrganizations = (organizations?.length ?? 0) <= 0 && isOrganizationsSuccess
  const canCreateProject = isAdmin

  // Dynamic limit definitions
  const { data: limitDefinitions } = useResourceLimitDefinitionsQuery({
    orgId: slug,
  })

  // Build dynamic limitConfig from API
  const limitConfig: LimitMap | null = useMemo(() => {
    if (!limitDefinitions) return null

    const map: LimitMap = {}

    for (const def of limitDefinitions) {
      switch (def.resource_type) {
        case 'milli_vcpu': {
          const k: SliderKey = 'vcpu'
          const divider = 1000
          map[k] = {
            label: LABELS[k],
            min: (def.min ?? 0) / divider,
            max: (def.max ?? 0) / divider,
            step: 0.1,
            unit: 'vCPU',
            divider,
          }
          break
        }
        case 'ram': {
          const k: SliderKey = 'ram'
          const divider = GIB
          map[k] = {
            label: LABELS[k],
            min: (def.min ?? 0) / divider,
            max: (def.max ?? 0) / divider,
            step: 0.125, // 128MiB
            unit: 'GiB',
            divider,
          }
          break
        }
        case 'iops': {
          const k: SliderKey = 'iops'
          map[k] = {
            label: LABELS[k],
            min: def.min ?? 0,
            max: def.max ?? 0,
            step: Math.max(1, def.step ?? 100),
            unit: 'IOPS',
            divider: 1,
          }
          break
        }
        case 'database_size': {
          const k: SliderKey = 'nvme'
          const divider = 10_000_000_000 // 10 GB
          map[k] = {
            label: LABELS[k],
            min: (def.min ?? 0) / divider,
            max: (def.max ?? 0) / divider,
            step: 1,
            unit: 'GB',
            divider,
          }
          break
        }
        case 'storage_size': {
          const k: SliderKey = 'storage'
          const divider = 10_000_000_000 // 10 GB
          map[k] = {
            label: LABELS[k],
            min: (def.min ?? 0) / divider,
            max: (def.max ?? 0) / divider,
            step: 1,
            unit: 'GB',
            divider,
          }
          break
        }
      }
    }

    return map
  }, [limitDefinitions])

  // Slider keys derived from API
  const sliderKeys = useMemo(
    () => (limitConfig ? (Object.keys(limitConfig) as SliderKey[]) : []),
    [limitConfig]
  )

  // React Hook Form
  const form = useForm<CreateProjectForm>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      organization: slug,
      projectName: projectName || '',
      instanceSize: sizes[0],
      dataApi: true,
      useApiSchema: false,
      postgresVersionSelection: '',
      includeFileStorage: true,
      enableHa: false,
      readReplicas: 0,
      perBranchLimits: {}, // set after limits load
      projectLimits: {},   // set after limits load
    },
  })
  const {
  mutate: createProject,
  isLoading: isCreatingNewProject,
  isSuccess: isSuccessNewProject,
} = useProjectCreateMutation({
  onSuccess: (res) => {
    sendEvent({
      action: 'project_creation_simple_version_submitted',
      properties: { instanceSize: form.getValues('instanceSize') },
      groups: { project: res.id, organization: res.organization_id },
    })
    router.push(`/org/${slug}/project/${res.id}/building`)
  },

  onError(error, variables, context) {

    const details = (error as any)?.detail

    // If server returns validation details array => map them into form errors
    if (Array.isArray(details) && details.length > 0) {
      // Clear any prior server errors that we might have set (optional)
      // We'll set each server error below.
      let firstFieldToFocus: string | null = null

      details.forEach((d: any) => {
        try {
          const loc = Array.isArray(d.loc) ? d.loc : []
          // expected loc example: ["body","project_limits","iops"]
          const area = loc[1] // 'project_limits' | 'per_branch_limits' | other
          const apiField = loc[2] // 'iops', 'ram', 'milli_vcpu', etc.
          const msg = d.msg || d.message || (error && (error as any).message) || 'Invalid value'

          const formKey = API_TO_FORM[apiField]
          if (!formKey) {
            // Unknown API field, skip mapping to field-level error
            console.warn('Unmapped API field in validation error:', apiField)
            return
          }

          let targetName: string | null = null
          if (area === 'project_limits' || area === 'project_limits') {
            // map to projectLimits.<key>
            targetName = `projectLimits.${formKey}`
          } else if (area === 'per_branch_limits' || area === 'per_branch_limits') {
            targetName = `perBranchLimits.${formKey}`
          } else if (area === 'body' || area === 'root' || area === undefined) {
            // fallback heuristics: prefer projectLimits first
            targetName = `projectLimits.${formKey}`
          }

          if (targetName) {
            // Set a field error that react-hook-form will render next to the slider
            form.setError(
              targetName as any,
              {
                type: 'server',
                message: msg,
              },
              { shouldFocus: false }
            )
            if (!firstFieldToFocus) firstFieldToFocus = targetName
          }
        } catch (err) {
          console.error('Failed to map server validation detail to form field', err, d)
        }
      })

      // focus the first affected control (if available)
      if (firstFieldToFocus) {
        try {
          form.setFocus(firstFieldToFocus as any)
        } catch (e) {
          // ignore if setFocus not available
        }
      }

      // Show a non-intrusive toast too (optional)
      toast.error('Please fix highlighted fields and try again.')
      return
    }

    // fallback: non-structured error -> show toast with message
    toast.error((error as any)?.message || 'Failed to create project')
  },
})

  // Initialize sliders once limits are available
  useEffect(() => {
    if (!limitConfig) return

    const perBranchDefaults: Record<string, number> = {}
    const projectDefaults: Record<string, number> = {}

    for (const key of sliderKeys) {
      const cfg = limitConfig[key]!
      perBranchDefaults[key] = cfg.min
      projectDefaults[key] = cfg.min
    }

    if (!form.getValues('includeFileStorage') && sliderKeys.includes('storage')) {
      perBranchDefaults['storage'] = 0
      projectDefaults['storage'] = 0
    }

    form.reset({
      ...form.getValues(),
      perBranchLimits: perBranchDefaults,
      projectLimits: projectDefaults,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitConfig, sliderKeys.join('|')])

  // Zero out storage if toggled off
  useEffect(() => {
    const sub = form.watch((v, { name }) => {
      if (name === 'includeFileStorage' && v?.includeFileStorage === false && sliderKeys.includes('storage')) {
        form.setValue('perBranchLimits.storage', 0, { shouldDirty: true, shouldValidate: false })
        form.setValue('projectLimits.storage', 0, { shouldDirty: true, shouldValidate: false })
      }
    })
    return () => sub.unsubscribe()
  }, [form, sliderKeys])


  const { data: allProjectsFromApi } = useProjectsQuery()
  const [allProjects, setAllProjects] = useState<components['schemas']['ProjectPublic'][] | undefined>(undefined)

  useEffect(() => {
    if (allProjectsFromApi && !allProjects) setAllProjects(allProjectsFromApi)
  }, [allProjectsFromApi, allProjects])

  useEffect(() => {
    if (isEmptyOrganizations) router.push(`/new`)
  }, [isEmptyOrganizations, router])

  useEffect(() => {
    if (slug && slug !== '_') form.setValue('organization', slug)
    if (projectName) form.setValue('projectName', projectName || '')
  }, [slug, projectName, form])

  // Submit handlers
  const additionalMonthlySpend = 0
  const onSubmitWithComputeCostsConfirmation = async (values: CreateProjectForm) => {
    const launchingLargerInstance =
      values.instanceSize &&
      !sizesWithNoCostConfirmationRequired.includes(values.instanceSize as DesiredInstanceSize)

    if (additionalMonthlySpend > 0 && (hasOAuthApps || launchingLargerInstance)) {
      sendEvent({
        action: 'project_creation_simple_version_confirm_modal_opened',
        properties: { instanceSize: values.instanceSize },
        groups: { organization: currentOrg?.id ?? 'Unknown' },
      })
      setIsComputeCostsConfirmationModalVisible(true)
    } else {
      await onSubmit(values)
    }
  }

  const onSubmit = async (values: CreateProjectForm) => {
    if (!currentOrg) {
      console.error('Unable to retrieve current organization')
      return
    }
    if (!limitConfig) {
      toast.error('Resource limits not loaded yet. Please try again in a moment.')
      return
    }

    const per_branch_limits: Record<string, number> = {}
    const project_limits: Record<string, number> = {}

    for (const key of sliderKeys) {
      const apiKey = FORM_TO_API[key]
      const divider = limitConfig[key]!.divider
      per_branch_limits[apiKey] = (values.perBranchLimits as any)[key] * divider
      project_limits[apiKey] = (values.projectLimits as any)[key] * divider
    }

    if (!values.includeFileStorage && sliderKeys.includes('storage')) {
      per_branch_limits['storage_size'] = 0
      project_limits['storage_size'] = 0
    }

    const data: ProjectCreateVariables = {
      organizationSlug: currentOrg.id!,
      parameters: {
        name: values.projectName,
        max_backups: 20,
        per_branch_limits,
        project_limits,
      },
    }

    createProject(data)
  }

  // Slider onChange creators (clamp + sync rules)
  const handlePerBranchChange = (key: SliderKey) => (v: number[]) => {
    if (!limitConfig) return
    const cfg = limitConfig[key]!
    const next = v[0] ?? cfg.min
    const safe = Math.max(cfg.min, Math.min(next, cfg.max))
    form.setValue(`perBranchLimits.${key}`, safe, { shouldDirty: true, shouldValidate: false })
    const projVal = form.getValues(`projectLimits.${key}`)
    if (safe > projVal) {
      form.setValue(`projectLimits.${key}`, safe, { shouldDirty: true, shouldValidate: false })
    }
  }

  const handleProjectChange = (key: SliderKey) => (v: number[]) => {
    if (!limitConfig) return
    const cfg = limitConfig[key]!
    const next = v[0] ?? cfg.min
    const branchVal = form.getValues(`perBranchLimits.${key}`)
    const clamped = Math.max(branchVal, Math.max(cfg.min, Math.min(next, cfg.max)))
    form.setValue(`projectLimits.${key}`, clamped, { shouldDirty: true, shouldValidate: false })
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <Form_Shadcn_ {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmitWithComputeCostsConfirmation)}
        className="flex flex-col w-full min-h-screen bg-surface text-sm "
      >
        {/* Header */}
        <header className="border-b px-12 py-6">
          <div className="max-w-[1600px] mx-auto w-full">
            <h1 className="text-lg font-semibold text-foreground">Create project</h1>
            <p className="text-sm text-foreground-muted">
              Spin up a dedicated Postgres instance, API, and storage.
            </p>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 px-12 py-8">
          <div className="max-w-[1600px] mx-auto w-full space-y-10">
            <section>
              {isOrganizationsSuccess && !isAdmin && !orgNotFound && <NotOrganizationOwnerWarning slug={slug} />}
              {orgNotFound && <OrgNotFound slug={slug} />}
            </section>

            {/* Top row: Organization / Project */}
            <section className="grid grid-cols-1 gap-10 xl:grid-cols-2 xl:items-start">
              <div className="space-y-6">
                {isAdmin && !isInvalidSlug && (
                  <FormField_Shadcn_
                    control={form.control}
                    name="organization"
                    render={({ field }) => (
                      <div className="space-y-2">
                        <Label_Shadcn_ htmlFor="organization" className="text-xs font-medium text-foreground whitespace-nowrap">
                          Organization
                        </Label_Shadcn_>
                        {(organizations?.length ?? 0) > 0 && (
                          <Select_Shadcn_
                            onValueChange={(orgSlug) => {
                              field.onChange(orgSlug)
                              router.push(`/new/${orgSlug}`)
                            }}
                            value={field.value}
                            defaultValue={field.value}
                          >
                            <SelectTrigger_Shadcn_ id="organization" className="w-full h-9 text-sm">
                              <SelectValue_Shadcn_ placeholder="Select an organization" />
                            </SelectTrigger_Shadcn_>
                            <SelectContent_Shadcn_>
                              <SelectGroup_Shadcn_>
                                {organizations?.map((x) => (
                                  <SelectItem_Shadcn_ key={x.id} value={x.id!} className="flex justify-between">
                                    <span className="mr-2">{x.name}</span>
                                  </SelectItem_Shadcn_>
                                ))}
                              </SelectGroup_Shadcn_>
                            </SelectContent_Shadcn_>
                          </Select_Shadcn_>
                        )}
                        <p className="text-[11px] leading-snug text-foreground-muted">
                          the organization this project will be created in
                        </p>
                      </div>
                    )}
                  />
                )}
              </div>

              <div className="space-y-6">
                <FormField_Shadcn_
                  control={form.control}
                  name="projectName"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label_Shadcn_ htmlFor="project-name" className="text-xs font-medium text-foreground whitespace-nowrap">
                        Project name
                      </Label_Shadcn_>
                      <Input_Shadcn_ id="project-name" placeholder="Your project's name" className="h-9 text-sm" {...field} />
                    </div>
                  )}
                />
              </div>
            </section>

            {/* Row 2: Per-branch / Project limits */}
            <section className="grid gap-10 xl:grid-cols-2">
              {/* Project */}
              <section className="rounded-lg border p-5 space-y-4">
                <p className="font-medium text-sm text-foreground">Project limits</p>
                {!limitConfig ? (
                  <p className="text-sm text-foreground-muted">Loading limits…</p>
                ) : (
                  <div className="grid grid-cols-1 gap-y-4">
                    {sliderKeys.map((key) => {
                      const cfg = limitConfig[key]!
                      const value = (form.watch(`projectLimits.${key}`) ?? cfg.min) as number
                      const storageDisabled = key === 'storage' && !form.watch('includeFileStorage')

                        // Fetch server/form validation error for this field (project)
                        const projectErrors = (form.formState.errors.projectLimits ?? {}) as Record<string, any>
                        const rawError = projectErrors?.[key]?.message as string | undefined
                        const errorMessage = rawError && cfg ? formatLimitError(rawError, cfg) : rawError

                      return (
                        <SliderRow
                          key={key}
                          id={`project-limits-${key}`}
                          label={cfg.label}
                          value={value}
                          min={cfg.min}
                          max={cfg.max}
                          step={cfg.step}
                          unit={cfg.unit}
                          disabled={storageDisabled}
                          onChange={handleProjectChange(key)}
                          error={errorMessage}
                          helper={
                            key === 'storage' && storageDisabled ? (
                              <div className="mt-2">
                                <Label_Shadcn_ className="text-xs text-muted-foreground">
                                  Check “Include file storage” to enable the slider
                                </Label_Shadcn_>
                              </div>
                            ) : null
                          }
                        />
                      )
                    })}
                  </div>
                )}
                <p className="text-[11px] leading-snug text-foreground-muted">
                  Global ceilings across all branches in this project.
                </p>
              </section>
              {/* Per-branch */}
              <section className="rounded-lg border p-5 space-y-4">
                <p className="font-medium text-sm text-foreground">Sizing (per branch)</p>
                {!limitConfig ? (
                  <p className="text-sm text-foreground-muted">Loading limits…</p>
                ) : (
                  <div className="grid grid-cols-1 gap-y-4">
                    {sliderKeys.map((key) => {
                      const cfg = limitConfig[key]!
                      const value = (form.watch(`perBranchLimits.${key}`) ?? cfg.min) as number
                      const storageDisabled = key === 'storage' && !form.watch('includeFileStorage')

                      // Fetch server/form validation error for this field (per-branch)
                      const perBranchErrors = (form.formState.errors.perBranchLimits ?? {}) as Record<string, any>
                      const rawError = perBranchErrors?.[key]?.message as string | undefined
                      const errorMessage =
                        rawError && cfg
                          ? formatLimitError(rawError, cfg)
                          : rawError
                      return (
                        <SliderRow
                          key={key}
                          id={`sizing-${key}`}
                          label={cfg.label}
                          value={value}
                          min={cfg.min}
                          max={cfg.max}
                          step={cfg.step}
                          unit={cfg.unit}
                          disabled={storageDisabled}
                          onChange={handlePerBranchChange(key)}
                          error={errorMessage}
                          helper={
                            key === 'storage' && storageDisabled ? (
                              <div className="mt-2">
                                <Label_Shadcn_ className="text-xs text-muted-foreground">
                                  Check “Include file storage” to enable the slider
                                </Label_Shadcn_>
                              </div>
                            ) : null
                          }
                        />
                      )
                    })}
                  </div>
                )}
                <p className="text-[11px] leading-snug text-foreground-muted">
                  Resource allocation for this branch. These values will eventually control cost and performance.
                </p>
              </section>

              
            </section>

            {/* Row 3: Availability & storage */}
            <section className="rounded-lg border p-5 space-y-6">
              <div className="space-y-4">
                <p className="font-medium text-sm text-foreground">Availability &amp; storage</p>

                <div className="flex items-start gap-3 text-sm">
                  <FormField_Shadcn_
                    control={form.control}
                    name="includeFileStorage"
                    render={({ field }) => (
                      <>
                        <Checkbox_Shadcn_
                          id="include-file-storage"
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                        <Label_Shadcn_
                          htmlFor="include-file-storage"
                          className="text-foreground text-xs font-medium leading-tight"
                        >
                          Include file storage
                        </Label_Shadcn_>
                      </>
                    )}
                  />
                </div>

                <div className="flex items-start gap-3 text-sm">
                  <FormField_Shadcn_
                    control={form.control}
                    name="enableHa"
                    render={({ field }) => (
                      <>
                        <Checkbox_Shadcn_
                          id="enable-ha"
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                        <Label_Shadcn_
                          htmlFor="enable-ha"
                          className="text-foreground text-xs font-medium leading-tight whitespace-nowrap"
                        >
                          Enable high availability
                        </Label_Shadcn_>
                      </>
                    )}
                  />
                </div>

                <FormField_Shadcn_
                  control={form.control}
                  name="readReplicas"
                  render={({ field }) => (
                    <div className="space-y-1 max-w-[200px]">
                      <Label_Shadcn_ htmlFor="read-replicas" className="text-xs font-medium text-foreground whitespace-nowrap">
                        Read replicas
                      </Label_Shadcn_>
                      <Input_Shadcn_ id="read-replicas" type="number" value={field.value} disabled readOnly className="h-9 text-sm" />
                      <p className="text-[11px] leading-snug text-foreground-muted">Coming soon</p>
                    </div>
                  )}
                />
              </div>

              <div className="rounded-md border p-3 text-[11px] leading-snug text-foreground-muted">
                <p>
                  This project may incur usage-based costs once created. Review your organization's billing plan and limits.{' '}
                  <Link href="https://vela.run/" target="_blank" className="underline">
                    Learn more
                  </Link>
                  .
                </p>
              </div>
            </section>
          </div>
        </main>

        {/* Footer */}
        <footer className="sticky bottom-0 border-t bg-surface/90 backdrop-blur px-12 py-4">
          <div className="max-w-[1600px] mx-auto w-full flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-2 sm:ml-auto">
              <Button
                type="default"
                disabled={isCreatingNewProject || isSuccessNewProject}
                onClick={() => {
                  if (!!lastVisitedOrganization) router.push(`/org/${lastVisitedOrganization}`)
                  else router.push('/organizations')
                }}
              >
                Cancel
              </Button>
              <Button
                htmlType="submit"
                loading={isCreatingNewProject || isSuccessNewProject}
                disabled={!canCreateProject || isCreatingNewProject || isSuccessNewProject}
                type="primary"
              >
                Create project
              </Button>
            </div>
          </div>
        </footer>

        {/* Confirmation modal */}
        <ConfirmationModal
          size="large"
          loading={false}
          visible={isComputeCostsConfirmationModalVisible}
          title="Confirm compute costs"
          confirmLabel="I understand"
          onCancel={() => setIsComputeCostsConfirmationModalVisible(false)}
          onConfirm={async () => {
            const values = form.getValues()
            await onSubmit(values)
            setIsComputeCostsConfirmationModalVisible(false)
          }}
          variant="warning"
        >
          <div className="text-sm text-foreground-light space-y-1">
            <p>
              Creating this project can increase your monthly costs by ${0}, independent of how actively you use it. By clicking
              "I understand", you agree to the additional costs.{' '}
              <Link href="https://vela.run/" target="_blank" className="underline">
                Learn more
              </Link>
              .
            </p>
          </div>
        </ConfirmationModal>
      </form>
    </Form_Shadcn_>
  )
}

function formatLimitError(
  message: string,
  cfg: { divider: number; unit: string }
): string {
  // grab all large integers in the message
  const numbers = message.match(/\d+/g)
  if (!numbers) return message

  let i = 0
  return message.replace(/\d+/g, (raw) => {
    const value = Number(raw) / cfg.divider

    // nice formatting: integers stay clean, decimals get trimmed
    const formatted =
      value % 1 === 0 ? value.toString() : value.toFixed(2)

    return `${formatted} ${cfg.unit}`
  })
}


/* ------------------------------------------------------------------ */
/* Layout wrappers                                                     */
/* ------------------------------------------------------------------ */

const PageLayout = withAuth(({ children }: PropsWithChildren) => {
  return <WizardLayoutWithoutAuth>{children}</WizardLayoutWithoutAuth>
})

CreateProjectPage.getLayout = (page) => (
  <DefaultLayout headerTitle="New project">
    <WideWizardLayout>{page}</WideWizardLayout>
  </DefaultLayout>
)

export default CreateProjectPage
