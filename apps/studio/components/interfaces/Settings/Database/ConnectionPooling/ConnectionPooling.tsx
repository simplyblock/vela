import { zodResolver } from '@hookform/resolvers/zod'
import { Fragment, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import AlertError from 'components/ui/AlertError'
import { setValueAsNullableNumber } from 'components/ui/Forms/Form.constants'
import { FormActions } from 'components/ui/Forms/FormActions'
import Panel from 'components/ui/Panel'
import ShimmeringLoader from 'ui-patterns/ShimmeringLoader'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import {
  Alert_Shadcn_,
  AlertDescription_Shadcn_,
  AlertTitle_Shadcn_,
  Form_Shadcn_,
  FormControl_Shadcn_,
  FormField_Shadcn_,
  Input_Shadcn_,
  Separator,
} from 'ui'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'
// import { useMaxConnectionsQuery } from 'data/database/max-connections-query'
import {
  usePgbouncerConfigQuery,
  PgbouncerConfigData,
} from 'data/database/pgbouncer-config-query'
import { usePgbouncerConfigurationUpdateMutation } from 'data/database/pgbouncer-config-update-mutation'
// import { useSelectedBranchQuery } from 'data/branches/selected-branch-query'
import { getPathReferences } from 'data/vela/path-references'

/* ------------------------------------------------ */
/* Local payload type (fix mutation typing issue)   */
/* ------------------------------------------------ */

type PgBouncerPayload = Omit<
  PgbouncerConfigData,
  'pgbouncer_enabled' | 'pool_mode'
> & { ref: string; slug: string; branchId: string }

/* ------------------------------------------------ */
/* Schema                                           */
/* ------------------------------------------------ */

const fields : {
    key: string;
    label: string;
    description: string;
    docs?: string;
}[] = [
  {
    key: 'default_pool_size',
    label: 'Default Pool Size',
    description: 'Number of server connections kept in each pool.',
    docs: 'https://vela.run/docs/guides/database/connection-management#configuring-supavisors-pool-size"',
  },
  {
    key: 'max_client_conn',
    label: 'Max Client Connections',
    description: 'Maximum number of client connections allowed.',
  },
  {
    key: 'reserve_pool_size',
    label: 'Reserve Pool Size',
    description: 'Additional connections allowed when the pool is full.',
  },
  {
    key: 'server_idle_timeout',
    label: 'Server Idle Timeout',
    description: 'Time in seconds before closing idle server connections.',
  },
  {
    key: 'server_lifetime',
    label: 'Server Lifetime',
    description: 'Maximum lifetime of a server connection in seconds.',
  },
  {
    key: 'query_wait_timeout',
    label: 'Query Wait Timeout',
    description: 'Maximum time a query can wait for a connection.',
  },
]


const schema = z.object({
  default_pool_size: z.number().int().min(1),
  max_client_conn: z.number().int().min(0).nullable().optional(),
  reserve_pool_size: z.number().int().min(0).nullable().optional(),
  server_idle_timeout: z.number().int().min(0).nullable().optional(),
  server_lifetime: z.number().int().min(0).nullable().optional(),
  query_wait_timeout: z.number().int().min(0).nullable().optional(),
})

type FormValues = z.infer<typeof schema>

const formId = 'pgbouncer-configuration-form'

/* ------------------------------------------------ */



export const ConnectionPooling  = () => {

  const { slug, ref, branch } = getPathReferences()
  const { can: canUpdate } = useCheckPermissions('branch:settings:admin')

  const {
    data,
    error,
    isLoading,
    isError,
    isSuccess,
  } = usePgbouncerConfigQuery({
    orgRef: slug,
    projectRef: ref,
    branchId: branch,
  })
  //FIXME: do we need this? 
  // const { data: maxConnData } = useMaxConnectionsQuery({
  //   branch,
  // })

  const { mutate: updateConfig, isPending: isUpdating } =
    usePgbouncerConfigurationUpdateMutation()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      default_pool_size: 20,
      max_client_conn: null,
      reserve_pool_size: null,
      server_idle_timeout: null,
      server_lifetime: null,
      query_wait_timeout: null,
    },
  })


  const resetForm = () => {
    form.reset({
      default_pool_size: data?.default_pool_size ?? 20,
      max_client_conn: data?.max_client_conn ?? null,
      reserve_pool_size: data?.reserve_pool_size ?? null,
      server_idle_timeout: data?.server_idle_timeout ?? null,
      server_lifetime: data?.server_lifetime ?? null,
      query_wait_timeout: data?.query_wait_timeout ?? null,
    })
  }

  useEffect(() => {
    if (isSuccess) resetForm()
  }, [isSuccess])

  const onSubmit = (values: FormValues) => {
    if (!slug || !ref || !branch) return
    // FIXME: using a locally typed version because the current PgbouncerConfigurationUpdateVariables is not typed correctly ideally we would want to use that one 
    const payload: PgBouncerPayload = {
      slug: slug,
      ref: ref,
      branchId: branch,
      ...values,
    }

    updateConfig(payload as any, {
      onSuccess: () => {
        toast.success('PgBouncer configuration updated')
        resetForm()
      },
    })
  }

  const connectionPoolingUnavailable = data?.pool_mode === null

  return (
    <section id="pgbouncer-config">
      <Panel
        title="PgBouncer Configuration"
        footer={
          <FormActions
            form={formId}
            isSubmitting={isUpdating}
            hasChanges={form.formState.isDirty}
            handleReset={resetForm}
            helper={
              !canUpdate
                ? 'You need additional permissions to update pooling settings'
                : undefined
            }
          />
        }
      >
        <Panel.Content>

          {/* Loading */}

          {isLoading && (
            <div className="flex flex-col gap-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Fragment key={i}>
                  <div className="grid md:grid-cols-12 gap-x-4">
                    <ShimmeringLoader className="h-4 w-1/3 col-span-4" />
                    <ShimmeringLoader className="h-8 w-full col-span-8" />
                  </div>
                  <Separator />
                </Fragment>
              ))}
            </div>
          )}

          {/* Error */}

          {isError && (
            <AlertError
              error={error}
              subject="Failed to retrieve PgBouncer configuration"
            />
          )}

          {/* Feature unavailable */}

          {connectionPoolingUnavailable && (
            <Alert_Shadcn_ variant="warning">
              <AlertTitle_Shadcn_>
                Connection pooling unavailable
              </AlertTitle_Shadcn_>
              <AlertDescription_Shadcn_>
                Please Create a new branch to enable this feature.
              </AlertDescription_Shadcn_>
            </Alert_Shadcn_>
          )}

          {/* Form */}

          {isSuccess && (
            <Form_Shadcn_ {...form}>
              <form
                id={formId}
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-y-6"
              >
                {fields.map((field) => (
                  <FormField_Shadcn_
                    key={field.key}
                    control={form.control}
                    name={field.key as keyof FormValues}
                    render={({ field: rhfField }) => (
                      <FormItemLayout layout="horizontal" label={field.label}>
                        <div className="flex flex-col gap-1 w-full">
                          <FormControl_Shadcn_>
                            <Input_Shadcn_
                              {...rhfField}
                              type="number"
                              className="w-full"
                              value={rhfField.value ?? ''}
                              {...form.register(field.key as keyof FormValues, {
                                setValueAs: setValueAsNullableNumber,
                              })}
                            />
                          </FormControl_Shadcn_>

                          {field.docs &&                          
                          <p className="text-sm text-muted-foreground">
                            {field.description}
                            <a
                              href={field.docs}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Learn more
                            </a>
                          </p>}
                        </div>
                      </FormItemLayout>
                    )}
                  />
                ))}
              </form>
            </Form_Shadcn_>
          )}
        </Panel.Content>
      </Panel>
    </section>
  )
}
