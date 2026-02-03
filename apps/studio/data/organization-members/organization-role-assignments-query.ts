import { useQuery, UseQueryOptions } from '@tanstack/react-query'

import { useIsLoggedIn } from 'common'
import { get, handleError } from 'data/fetchers'
import type { ResponseError } from 'types'
import { organizationMembersKeys } from './keys'

export type OrganizationRoleAssignmentsVariables = {
  slug?: string
}

export async function getRoleAssignments(
  { slug }: OrganizationRoleAssignmentsVariables,
  signal?: AbortSignal
) {
  if (!slug) throw new Error('slug is required')

  const { data, error } = await get('/platform/organizations/{slug}/roles/assignments', {
    params: {
      path: {
        slug: slug,
      },
    },
    signal,
  })
  if (error) handleError(error)
  return data
}

export type RoleAssignmentsData = Awaited<ReturnType<typeof getRoleAssignments>>
export type RoleAssignmentsError = ResponseError

export const useOrganizationRoleAssignmentsQuery = <TData = RoleAssignmentsData>(
  { slug }: OrganizationRoleAssignmentsVariables,
  {
    enabled = true,
    ...options
  }: UseQueryOptions<RoleAssignmentsData, RoleAssignmentsError, TData> = {}
) => {
  const isLoggedIn = useIsLoggedIn()

  return useQuery<RoleAssignmentsData, RoleAssignmentsError, TData>(
    organizationMembersKeys.role_assignments(slug),
    ({ signal }) => getRoleAssignments({ slug }, signal),
    {
      ...options,
      enabled: enabled && isLoggedIn && typeof slug !== 'undefined',
      staleTime: 5 * 60 * 1000,
    }
  )
}
