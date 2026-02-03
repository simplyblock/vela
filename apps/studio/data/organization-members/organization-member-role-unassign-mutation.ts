import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { del, handleError } from 'data/fetchers'
import { organizationKeys } from 'data/organizations/keys'
import type { ResponseError } from 'types'
import { organizationMembersKeys } from './keys'

export type OrganizationMemberUnassignRoleVariables = {
  slug: string
  userId: string
  roleId: string
  skipInvalidation?: boolean
}

export async function unassignOrganizationMemberRole({
  slug,
  userId,
  roleId,
}: OrganizationMemberUnassignRoleVariables) {
  const { data, error } = await del(
    '/platform/organizations/{slug}/members/{user_id}/roles/{role_id}',
    {
      params: {
        path: {
          slug,
          user_id: userId,
          role_id: roleId,
        },
      },
    }
  )

  if (error) handleError(error)
  return data
}

type OrganizationMemberUnassignRoleData = Awaited<ReturnType<typeof unassignOrganizationMemberRole>>

export const useOrganizationMemberUnassignRoleMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<
    OrganizationMemberUnassignRoleData,
    ResponseError,
    OrganizationMemberUnassignRoleVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<
    OrganizationMemberUnassignRoleData,
    ResponseError,
    OrganizationMemberUnassignRoleVariables
  >((vars) => unassignOrganizationMemberRole(vars), {
    async onSuccess(data, variables, context) {
      const { slug, skipInvalidation } = variables

      if (!skipInvalidation) {
        await Promise.all([
          queryClient.invalidateQueries(organizationMembersKeys.roles(slug)),
          queryClient.invalidateQueries(organizationKeys.roles(slug)),
          queryClient.invalidateQueries(organizationKeys.members(slug)),
          queryClient.invalidateQueries(organizationMembersKeys.role_assignments(slug)),
        ])
      }

      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to unassign member role: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
