import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { handleError, post } from 'data/fetchers'
import { organizationKeys as organizationKeysV1 } from 'data/organizations/keys'
import type { ResponseError } from 'types'
import { organizationMembersKeys } from './keys'

export type OrganizationCreateInvitationVariables = {
  slug: string
  email: string
  firstName: string
  lastName: string
}

export async function createOrganizationInvitation({
  slug,
  email,
  firstName,
  lastName,
}: OrganizationCreateInvitationVariables) {
  const { data, error } = await post('/platform/organizations/{slug}/members/invitations', {
    params: {
      path: {
        slug,
      },
    },
    body: {
      email,
      first_name: firstName,
      last_name: lastName,
    },
  })

  if (error) handleError(error)
  return data
}

type OrganizationMemberUpdateData = Awaited<ReturnType<typeof createOrganizationInvitation>>

export const useOrganizationCreateInvitationMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<
    OrganizationMemberUpdateData,
    ResponseError,
    OrganizationCreateInvitationVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<
    OrganizationMemberUpdateData,
    ResponseError,
    OrganizationCreateInvitationVariables
  >((vars) => createOrganizationInvitation(vars), {
    async onSuccess(data, variables, context) {
      const { slug } = variables

      await Promise.all([
        queryClient.invalidateQueries(organizationMembersKeys.roles(slug)),
        queryClient.invalidateQueries(organizationKeysV1.members(slug)),
      ])

      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to update member role: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
