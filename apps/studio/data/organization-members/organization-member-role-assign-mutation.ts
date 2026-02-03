import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { handleError, post } from 'data/fetchers'
import { organizationKeys } from 'data/organizations/keys'
import type { ResponseError } from 'types'
import { organizationMembersKeys } from './keys'

export type OrganizationMemberAssignRoleVariables = {
  slug: string
  userId: string
  roleId: string
  projects?: string[]
  branches?: string[]
  env_types?: string[]
  skipInvalidation?: boolean
}

export async function assignOrganizationMemberRole({
  slug,
  userId,
  roleId,
  projects,
  branches,
  env_types,
}: OrganizationMemberAssignRoleVariables) {
  const { data, error } = await post(
    '/platform/organizations/{slug}/members/{user_id}/roles/{role_id}',
    {
      params: {
        path: {
          slug,
          user_id: userId,
          role_id: roleId,
        },
      },
      body: {
        project_ids: projects,
        branch_ids: branches,
        env_types: env_types
      }
    }
  )

  if (error) handleError(error)
  return data
}

type OrganizationMemberAssignData = Awaited<ReturnType<typeof assignOrganizationMemberRole>>

export const useOrganizationMemberAssignRoleMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<
    OrganizationMemberAssignData,
    ResponseError,
    OrganizationMemberAssignRoleVariables
  >,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<
    OrganizationMemberAssignData,
    ResponseError,
    OrganizationMemberAssignRoleVariables
  >((vars) => assignOrganizationMemberRole(vars), {
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
        toast.error(`Failed to update member role: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
