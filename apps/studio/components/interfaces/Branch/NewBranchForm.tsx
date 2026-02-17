import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { useParams } from 'common'
import Panel from 'components/ui/Panel'
import {
  Button,
  Checkbox_Shadcn_,
  FormField_Shadcn_,
  Input_Shadcn_,
  Label_Shadcn_,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
  Slider_Shadcn_,
} from 'ui'
import { useAvailablePostgresVersionsQuery } from 'data/platform/available-postgresql-versions-query'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { SPECIAL_CHARS_REGEX } from '../ProjectCreation/ProjectCreation.constants'
import { Eye, EyeOff } from 'lucide-react'
import { SpecialSymbolsCallout } from '../ProjectCreation/SpecialSymbolsCallout'
import PasswordStrengthBar from '../../ui/PasswordStrengthBar'
import { debounce } from 'lodash'
import passwordStrength from 'lib/password-strength'
import { generateStrongPassword } from 'lib/project'
import { useBranchCreateMutation } from 'data/branches/branch-create-mutation'
import { useBranchQuery } from 'data/branches/branch-query'
import {
  ResourceType,
  useBranchSliderResourceLimits,
} from 'data/resource-limits/branch-slider-resource-limits'
import { useBranchesQuery } from 'data/branches/branches-query'
import { useSendEventMutation } from 'data/telemetry/send-event-mutation'

type EnvironmentType = {
  label: string
  value: string
}

interface NewBranchFormProps {}

const FormSchema = z.object({
  name: z.string().min(1,"Branch name is required"),
  sourceBranchId: z.string().optional(),
  postgresVersion: z.string(),
  environmentType: z.string(),
  databasePassword: z.string().min(1, "Password is required"),
  databasePasswordStrength: z.number().min(3, "Password is too weak. Please use a stronger password"),
  enableStorageService: z.boolean(),
  enableHighAvailability: z.boolean(),
  readReplicas: z.number(),
  withConfig: z.boolean().optional(),
  withData: z.boolean().optional(),
  resources: z.object({
    milli_vcpu: z.number(),
    ram: z.number(),
    database_size: z.number(),
    iops: z.number(),
    storage_size: z.number(),
  }),
})

type FormState = z.infer<typeof FormSchema>

const NewBranchForm = ({}: NewBranchFormProps) => {
  const { slug, ref, branch } = useParams()
  const [areResourcesInitialized, setAreResourcesInitialized] = useState(false)

  const router = useRouter()

  const [newBranchLoading, setNewBranchLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrengthMessage, setPasswordStrengthMessage] = useState('')
  const [adjustableResources, setAdjustableResources] = useState(true)

  const { mutate: sendEvent } = useSendEventMutation()
  const { data: availablePostgresVersions } = useAvailablePostgresVersionsQuery()
  const { data: organization } = useSelectedOrganizationQuery()
  const { data: project } = useSelectedProjectQuery()
  const { data: branches } = useBranchesQuery({ orgRef: slug, projectRef: ref })
  const { data: sourceBranch } = useBranchQuery(
    { orgRef: slug, projectRef: ref, branchRef: branch },
    { enabled: !!branch }
  )

  const { data: limits, isLoading: isLimitsLoading } = useBranchSliderResourceLimits(sourceBranch)

  const { mutate: createBranch } = useBranchCreateMutation({
    onSuccess: (data) => {
      // on success always redirecting to projcet overview and poll for status 
      // if (!data) router.push(`/org/${slug}/project/${ref}`)
      // else router.push(`/org/${slug}/project/${ref}/branch/${data.id}`)
      router.push(`/org/${slug}/project/${ref}`)
    },
  })

  const environments = useMemo<EnvironmentType[]>(() => {
    if (!organization) return []
    const envTypes = organization.env_types ?? []
    return envTypes.map((type) => ({
      label: type,
      value: type,
    }))
  }, [organization])

  const form = useForm<FormState>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      sourceBranchId: branch,
      postgresVersion: '',
      environmentType: '',
      databasePassword: '',
      databasePasswordStrength: 0,
      enableStorageService: false,
      enableHighAvailability: false,
      readReplicas: 0,
      withConfig: true,
      withData: true,
      resources: {
        milli_vcpu: 0,
        ram: 0,
        database_size: 0,
        iops: 0,
        storage_size: 0,
      },
    },
  })

  useEffect(() => {
    if (!sourceBranch) return
    form.setValue('postgresVersion', sourceBranch.database.version)
  }, [sourceBranch])

  const enableStorageService = form.watch('enableStorageService')
  useEffect(() => {
    if (!enableStorageService) form.setValue('resources.storage_size', 0)
  }, [enableStorageService])

  useEffect(() => {
    if (!availablePostgresVersions) return
    const defaultVersion = availablePostgresVersions.find((version) => version.default)?.value
    if (!defaultVersion) return
    form.setValue('postgresVersion', defaultVersion)
  }, [availablePostgresVersions])

  useEffect(() => {
    if (!router.isReady) return
    const { name } = router.query
    if (typeof name === 'string') form.setValue('name', name)
  }, [router.isReady])

  useEffect(() => {
    if (!branch) return
    setAdjustableResources(false)
  }, [branch])

  useEffect(() => {
    if (!limits) return
    if (areResourcesInitialized) return

    const values = form.getValues()
    const keys = Object.keys(limits) as ResourceType[]

    keys.forEach((key) => {
      if (key === 'storage_size' && !values.enableStorageService) return

      const current = values.resources[key]
      const fallback = Math.max(limits[key].min, limits[key].max * 0.5) // 40%

      form.setValue(`resources.${key}`, current === 0 ? fallback : current, {
        shouldDirty: false,
        shouldValidate: false,
      })
    })

    setAreResourcesInitialized(true)
  }, [limits, areResourcesInitialized, form])

  const handleBranchSliderChange = useCallback(
    (key: ResourceType) => (value: number[]) => {
      const [next] = value
      form.setValue(`resources.${key}`, next, {
        shouldDirty: true,
        shouldValidate: false,
      })
    },
    [form]
  )

  function validateBranchNameLength(name: any) {
    const value = name ? name.trim() : ''
    if (value.length === 0) return false
    return value.length < 255
  }

  function validateBranchName(name: any) {
    const existingBranch = (branches ?? []).find((b) => b.name === name)
    return existingBranch === undefined
  }

  const checkPasswordStrength = async (value: string) => {
    const { message, strength } = await passwordStrength(value)

    form.setValue('databasePasswordStrength', strength)
    form.trigger('databasePasswordStrength')
    form.trigger('databasePassword')

    setPasswordStrengthMessage(message)
  }

  const delayedCheckPasswordStrength = useRef(
    debounce((value) => checkPasswordStrength(value), 300)
  ).current

  async function onSubmit(values: FormState) {
    if (!limits) {
      return toast.error('Resource limits not available')
    }
    const isBranchNameValid = validateBranchNameLength(values.name)
    if (!isBranchNameValid) {
      return toast.error('Branch name is empty')
    }

    const isBranchNameUnique = validateBranchName(values.name)
    if (!isBranchNameUnique) {
      return toast.error('Branch name already exists')
    }

    if (!slug || !ref) return

    setNewBranchLoading(true)


    const resourceAllocations = adjustableResources
      ? {
          database_password: values.databasePassword,
          database_image_tag: values.postgresVersion as any,
          enable_file_storage: values.enableStorageService,
          database_size: values.resources.database_size * limits.database_size.divider,
          milli_vcpu: values.resources.milli_vcpu * limits.milli_vcpu.divider,
          memory_bytes: values.resources.ram * limits.ram.divider,
          iops: values.resources.iops * limits.iops.divider,

          // only include when enabled
          ...(values.enableStorageService
            ? { storage_size: values.resources.storage_size * limits.storage_size.divider }
            : {}),
        }
      : undefined

    createBranch(
      {
        orgRef: slug,
        projectRef: ref,
        branchRef: branch,
        branchName: values.name,
        withConfig: branch ? values.withConfig : undefined,
        withData: branch ? values.withData : undefined,
        envType: values.environmentType,
        deployment: resourceAllocations,
      },
      {
        onSuccess: (data) => {
          sendEvent({
            action: 'branch_creation_submitted',
            properties: { ...values },
            groups: { project: ref, organization: slug, branch: data?.id ?? 'Unknown' },
          })
          setNewBranchLoading(false)
          router.push(`/org/${slug}/project/${ref}`)
        },
       onError: (err) => {
        const details = (err as any)?.detail
        if (Array.isArray(details)) {
          const mapField = (field: string) => {
            switch (field) {
              case "milli_vcpu": return "resources.milli_vcpu"
              case "memory_bytes": return "resources.ram"
              case "iops": return "resources.iops"
              case "database_size": return "resources.database_size"
              case "storage_size": return "resources.storage_size"
              default: return null
            }
          }

          for (const d of details) {
            const loc = Array.isArray(d.loc) ? d.loc : []
            const field = loc[loc.length - 1] 
            const msg = d.msg ?? "Invalid value"
            const target = mapField(field)
            if (target) form.setError(target as any, { type: "server", message: msg })
          }

          setNewBranchLoading(false)
          return
        }

        setNewBranchLoading(false)
        toast.error((err as any)?.message ?? "Failed to create branch")
      },
      }
    )
  }

  function generatePassword() {
    const password = generateStrongPassword()
    form.setValue('databasePassword', password, { shouldValidate: true })
    delayedCheckPasswordStrength(password)
  }

  const renderSliders = useCallback(() => {
    
    if (!limits) return
    return (
      <div className="mt-4 grid grid-cols-1 w-full">
        <div className="rounded-lg border p-5 space-y-4">
          <p className="font-medium text-sm text-foreground">Configure your branch resources</p>

          <div className="grid grid-cols-1 gap-y-4">
            {(Object.keys(limits) as ResourceType[]).map((key) => {
              const fieldError = (form.formState.errors as any)?.resources?.[key]?.message as
              | string
              | undefined
              const { label, min, max, step, unit } = limits[key]
              const value = form.watch(`resources.${key}`)
              const enabled = key !== 'storage_size' || enableStorageService
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between text-[12px] leading-none">
                    <Label_Shadcn_
                      htmlFor={`sizing-${key}`}
                      className="text-foreground whitespace-nowrap pr-2"
                    >
                      {label}
                    </Label_Shadcn_>
                    <span className="font-bold whitespace-nowrap">
                      {new Intl.NumberFormat().format(value)} {unit}
                    </span>
                  </div>
                  <Slider_Shadcn_
                    id={`sizing-${key}`}
                    min={min}
                    max={max}
                    step={step}
                    value={[value]}
                    onValueChange={handleBranchSliderChange(key)}
                    disabled={!enabled}
                  />
                  {fieldError && (
                    <div className="mt-1">
                      <Label_Shadcn_ className="text-xs text-destructive">{fieldError}</Label_Shadcn_>
                    </div>
                  )}
                  {key === 'storage_size' && !enableStorageService && (
                    <div className="mt-2">
                      <Label_Shadcn_ className="text-xs text-muted-foreground">
                        Check “Include storage” to enable the slider
                      </Label_Shadcn_>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }, [limits, adjustableResources, enableStorageService])

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Panel
        title={
          <div key="panel-title">
            <h4>
              {sourceBranch ? `Create a clone of ${sourceBranch.name}` : 'Create a new branch'}
            </h4>
          </div>
        }
        footer={
          <div key="panel-footer" className="flex w-full items-center justify-between">
            <Button
              type="default"
              disabled={newBranchLoading}
              onClick={() => {
                router.push(`/org/${project?.organization_id}/project/${project?.id}`)
              }}
            >
              Cancel
            </Button>
            <div className="flex items-center space-x-3">
              <p className="text-xs text-foreground-lighter">You can rename your branch later</p>
              <Button
                htmlType="submit"
                type="primary"
                loading={newBranchLoading}
                disabled={newBranchLoading}
              >
                Create branch
              </Button>
            </div>
          </div>
        }
        className="overflow-visible"
      >
        <Panel.Content>
          <p className="text-sm">This will be your new branch in project {project?.name}.</p>
        </Panel.Content>
        <Panel.Content className="Form section-block--body has-inputs-centered">
          {/* Render source branch information when cloning a branch */}
          {typeof branch !== 'undefined' && !!sourceBranch && (
            <div className="grid grid-cols-2 w-full">
              <div className="pr-1">
                <Label_Shadcn_ className="text-xs font-medium text-foreground whitespace-nowrap">
                  By default the new branch will have the same
                  <br />
                  resource allocations as the source branch.
                </Label_Shadcn_>
              </div>
              <div className="pl-1">
                <div className="flex gap-3 pl-1 items-center">
                  <FormField_Shadcn_
                    control={form.control}
                    name="withConfig"
                    render={({ field }) => (
                      <>
                        <Checkbox_Shadcn_
                          id="copy-configuration"
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                        <Label_Shadcn_
                          htmlFor="copy-configuration"
                          className="text-foreground text-xs font-medium leading-tight"
                        >
                          Clone branch configuration
                        </Label_Shadcn_>
                      </>
                    )}
                  />
                </div>
                <div className="flex gap-3 pl-1 mt-2 items-center">
                  <FormField_Shadcn_
                    control={form.control}
                    name="withData"
                    render={({ field }) => (
                      <>
                        <Checkbox_Shadcn_
                          id="copy-data"
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                        <Label_Shadcn_
                          htmlFor="copy-data"
                          className="text-foreground text-xs font-medium leading-tight"
                        >
                          Clone branch data
                        </Label_Shadcn_>
                      </>
                    )}
                  />
                </div>
                <div className="flex gap-3 pl-1 mt-2 items-center">
                  <Checkbox_Shadcn_
                    id="adjustable-resources"
                    checked={adjustableResources}
                    onCheckedChange={(checked) => setAdjustableResources(checked === true)}
                  />
                  <Label_Shadcn_
                    htmlFor="adjustable-resources"
                    className="text-foreground text-xs font-medium leading-tight"
                  >
                    Adjust branch resource allocation
                  </Label_Shadcn_>
                </div>
              </div>
            </div>
          )}
          <div className={`grid grid-cols-2 w-full ${sourceBranch ? 'mt-6' : ''}`}>
            <div className="space-y-1 pr-1">
            <Label_Shadcn_
              htmlFor="branch-name"
              className="text-xs font-medium text-foreground whitespace-nowrap"
            >
              Branch name
            </Label_Shadcn_>
            <FormField_Shadcn_
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <>
                  <Input_Shadcn_
                    id="name"
                    placeholder="main"
                    className={`w-full h-9 text-sm ${fieldState.error ? 'border-destructive' : ''}`}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e)
                      setTimeout(() => form.trigger('name'), 100)
                    }}
                    onBlur={() => form.trigger('name')}
                  />
                  {fieldState.error && (
                    <p className="text-[11px] text-destructive font-medium mt-1">
                      {fieldState.error.message}
                    </p>
                  )}
                </>
              )}
            />

              <p className="text-[11px] leading-snug text-foreground-muted">
                This branch will be created with the settings below.
              </p>
            </div>
            <div className="space-y-1 pl-1">
              <FormField_Shadcn_
                control={form.control}
                name="environmentType"
                render={({ field }) => (
                  <>
                    <Label_Shadcn_
                      htmlFor="environment-type"
                      className="text-xs font-medium text-foreground whitespace-nowrap"
                    >
                      Environment type
                    </Label_Shadcn_>
                    <Select_Shadcn_
                      value={field.value}
                      onValueChange={(value) => field.onChange(value)}
                    >
                      <SelectTrigger_Shadcn_ id="environment-type" className="w-full h-9 text-sm">
                        <SelectValue_Shadcn_ placeholder="Select an environment" />
                      </SelectTrigger_Shadcn_>
                      <SelectContent_Shadcn_>
                        {environments.map((option) => (
                          <SelectItem_Shadcn_ key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem_Shadcn_>
                        ))}
                      </SelectContent_Shadcn_>
                    </Select_Shadcn_>
                  </>
                )}
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 w-full">
            <div className="space-y-1 pr-1">
              <FormField_Shadcn_
                control={form.control}
                name="postgresVersion"
                render={({ field }) => {
                  const availableVersions = availablePostgresVersions || []
                  const defaultVersion =
                    availableVersions.find((version) => version.default)?.value || ''
                  return (
                    <div className="space-y-1">
                      <Label_Shadcn_
                        htmlFor="custom-pg-version"
                        className="text-xs font-medium text-foreground whitespace-nowrap"
                      >
                        Custom Postgres version
                      </Label_Shadcn_>
                      <Select_Shadcn_
                        disabled={availableVersions.length < 2 || !!branch}
                        value={field.value}
                        onValueChange={(value) => form.setValue('postgresVersion', value)}
                      >
                        <SelectTrigger_Shadcn_>
                          <SelectValue_Shadcn_ placeholder="Select PostgreSQL version" />
                        </SelectTrigger_Shadcn_>
                        <SelectContent_Shadcn_>
                          {availableVersions.map((version) => {
                            return (
                              <SelectItem_Shadcn_ key={version.value} value={version.value}>
                                {version.label}
                              </SelectItem_Shadcn_>
                            )
                          })}
                        </SelectContent_Shadcn_>
                      </Select_Shadcn_>
                    </div>
                  )
                }}
              />
            </div>
            <div className="space-y-1 pl-1">
              <FormField_Shadcn_
                control={form.control}
                name="databasePassword"
                render={({ field, fieldState: passwordFieldState }) => {
                  const hasSpecialCharacters =
                    field.value.length > 0 && !field.value.match(SPECIAL_CHARS_REGEX)

                  // Get the most relevant error to show
                  const passwordStrengthError = form.formState.errors.databasePasswordStrength
                  const errorToShow = passwordFieldState.error?.message || passwordStrengthError?.message
                  const hasError = !!errorToShow

                  return (
                    <div className="space-y-1">
                      <Label_Shadcn_
                        htmlFor="branch-password"
                        className="text-xs font-medium text-foreground whitespace-nowrap"
                      >
                        Postgres password
                      </Label_Shadcn_>

                      <div className="relative">
                        <Input_Shadcn_
                          id="branch-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Give a strong password"
                          className={`h-9 pr-10 text-sm ${hasError ? 'border-destructive' : ''}`}
                          {...field}
                          onChange={ (event) => {
                            field.onChange(event)
                            const value = event.target.value
                            if (value === '') {
                              form.setValue('databasePasswordStrength', 0)
                              form.trigger('databasePassword')
                              form.trigger('databasePasswordStrength')
                            } else {
                              delayedCheckPasswordStrength(value)
                              setTimeout(() => {
                                form.trigger('databasePasswordStrength')
                              }, 350)
                            }
                          }}
                          onBlur={() => {
                            form.trigger('databasePassword')
                            form.trigger('databasePasswordStrength')
                          }}
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute inset-y-0 right-2 flex items-center text-foreground-muted"
                          onClick={() => setShowPassword((prev) => !prev)}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>

                      {/* Show error if exists */}
                      {errorToShow && (
                        <p className="text-[11px] text-destructive font-medium">
                          {errorToShow}
                        </p>
                      )}

                      <div className="space-y-2">
                        {hasSpecialCharacters && <SpecialSymbolsCallout />}

                        <div className="text-[11px] leading-snug text-foreground-muted">
                          <PasswordStrengthBar
                            generateStrongPassword={generatePassword}
                            passwordStrengthScore={form.getValues('databasePasswordStrength')}
                            password={field.value}
                            passwordStrengthMessage={passwordStrengthMessage}
                          />
                        </div>
                      </div>
                    </div>
                  )
                }}
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 w-full">
            <section className="rounded-lg border p-5 space-y-6">
              <div className="space-y-3">
                <p className="font-medium text-sm text-foreground">Availability &amp; storage</p>
                <div className="grid grid-cols-2">
                  <div className="space-y-6">
                    <div className="flex items-start gap-3 text-sm">
                      <FormField_Shadcn_
                        control={form.control}
                        name="enableStorageService"
                        render={({ field }) => (
                          <>
                            <Checkbox_Shadcn_
                              id="enable-storage-service"
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                            />
                            <Label_Shadcn_
                              htmlFor="enable-storage-service"
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
                        name="enableHighAvailability"
                        render={({ field }) => (
                          <>
                            <Checkbox_Shadcn_
                              id="enable-high-availability"
                              checked={field.value}
                              disabled={true}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                            />
                            <Label_Shadcn_
                              htmlFor="enable-high-availability"
                              className="text-foreground text-xs font-medium leading-tight whitespace-nowrap"
                            >
                              Enable high availability (coming soon)
                            </Label_Shadcn_>
                          </>
                        )}
                      />
                    </div>
                  </div>
                  <div className="flex items-start text-sm">
                    <FormField_Shadcn_
                      control={form.control}
                      name="readReplicas"
                      render={({ field }) => (
                        <div className="space-y-1 max-w-[200px]">
                          <Label_Shadcn_
                            htmlFor="read-replicas"
                            className="text-xs font-medium text-foreground whitespace-nowrap"
                          >
                            Read replicas
                          </Label_Shadcn_>
                          <Input_Shadcn_
                            id="read-replicas"
                            type="number"
                            value={field.value}
                            disabled
                            readOnly
                            className="h-9 text-sm"
                          />
                          <p className="text-[11px] leading-snug text-foreground-muted">
                            Coming soon
                          </p>
                        </div>
                      )}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
          {!isLimitsLoading && adjustableResources && areResourcesInitialized && renderSliders()}
        </Panel.Content>
      </Panel>
    </form>
  )
}

export default NewBranchForm
