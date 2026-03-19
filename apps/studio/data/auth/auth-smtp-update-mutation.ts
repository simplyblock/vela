import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { components } from 'data/api'
import { handleError, put } from 'data/fetchers'
import type { ResponseError } from 'types'
import { authKeys } from './keys'

export type AuthSmtpUpdateVariables = {
  orgId: string
  projectId: string
  branchId: string
  config: components['schemas']['BranchAuthSmtpConfig']
}

export async function updateAuthSmtp({
  orgId,
  projectId,
  branchId,
  config,
}: AuthSmtpUpdateVariables) {
  const { data, error } = await put(
    '/platform/organizations/{slug}/projects/{ref}/branches/{branch}/auth/config/smtp/',
    {
      params: {
        path: {
          slug: orgId,
          ref: projectId,
          branch: branchId,
        },
      },
      body: config,
    }
  )

  if (error) handleError(error)
  return data
}

type AuthSmtpUpdateData = Awaited<ReturnType<typeof updateAuthSmtp>>

export const useAuthSmtpUpdateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<AuthSmtpUpdateData, ResponseError, AuthSmtpUpdateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<AuthSmtpUpdateData, ResponseError, AuthSmtpUpdateVariables>(
    (vars) => updateAuthSmtp(vars),
    {
      async onSuccess(data, variables, context) {
        const { orgId, projectId, branchId } = variables
        await queryClient.invalidateQueries(authKeys.authSmtp(orgId, projectId, branchId))
        await onSuccess?.(data, variables, context)
      },
      async onError(data, variables, context) {
        if (onError === undefined) {
          toast.error(`Failed to update SMTP configuration: ${data.message}`)
        } else {
          onError(data, variables, context)
        }
      },
      ...options,
    }
  )
}
