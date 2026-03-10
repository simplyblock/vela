import { components } from '../vela/vela-schema'
import { handleError, put } from '../fetchers'
import { ResponseError } from '../../types'
import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { resourceLimitsKeys } from './keys'
import { toast } from 'sonner'

interface ProjectLimitUpdateVariables {
  orgRef: string
  projectRef: string
  limits: components['schemas']['Limits']
}

async function updateProjectLimit(
  { orgRef, projectRef, limits }: ProjectLimitUpdateVariables,
  signal?: AbortSignal
) {
  const { data, error } = await put(
    '/platform/organizations/{slug}/projects/{ref}/resources/limits',
    {
      params: {
        path: {
          slug: orgRef,
          ref: projectRef,
        },
      },
      body: limits,
      signal,
    }
  )

  if (error) handleError(error)
  return data
}

export type ProjectLimitUpdateData = Awaited<ReturnType<typeof updateProjectLimit>>

export const useProjectLimitUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<ProjectLimitUpdateData, ResponseError, ProjectLimitUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<ProjectLimitUpdateData, ResponseError, ProjectLimitUpdateVariables>(
    (vars) => updateProjectLimit(vars),
    {
      async onSuccess(data, variables, context) {
        await queryClient.invalidateQueries(
          resourceLimitsKeys.projectLimits(variables.orgRef, variables.projectRef)
        )
        await onSuccess?.(data, variables, context)
      },
      async onError(data, variables, context) {
        if (onError === undefined) {
          toast.error(`Failed to update project limit: ${data.message}`)
        } else {
          onError(data, variables, context)
        }
      },
      ...options,
    }
  )
}
