import { useQuery, UseQueryOptions } from '@tanstack/react-query'

import { get, handleError } from 'data/fetchers'
import type { ResponseError } from 'types'
import { organizationMembersKeys } from './keys'

export type OrganizationRolesVariables = { slug?: string }
export type OrganizationRolesResponse = OrganizationRolesData
export type OrganizationRole = OrganizationRolesData['org_scoped_roles'][0]

export async function getOrganizationRoles(
  { slug }: OrganizationRolesVariables,
  signal?: AbortSignal
) {
  if (!slug) throw new Error('slug is required')

  const { data, error } = await get('/platform/organizations/{slug}/roles', {
    params: { path: { slug } },
    signal,
  })

  if (error) handleError(error)
  return data
}

type OrganizationRoles = Awaited<ReturnType<typeof getOrganizationRoles>>

export type OrganizationRolesData = {
  org_scoped_roles: Awaited<ReturnType<typeof getOrganizationRoles>>
  env_scoped_roles: Awaited<ReturnType<typeof getOrganizationRoles>>
  project_scoped_roles: Awaited<ReturnType<typeof getOrganizationRoles>>
  branch_scoped_roles: Awaited<ReturnType<typeof getOrganizationRoles>>
}
export type OrganizationRolesError = ResponseError

export const useOrganizationRolesQuery = (
  { slug }: OrganizationRolesVariables,
  {
    enabled = true,
    ...options
  }: UseQueryOptions<OrganizationRoles, OrganizationRolesError, OrganizationRolesData> = {}
) =>
  useQuery<OrganizationRoles, OrganizationRolesError, OrganizationRolesData>(
    organizationMembersKeys.roles(slug),
    ({ signal }) => getOrganizationRoles({ slug }, signal),
    {
      select: (data) => {
        return {
          org_scoped_roles: data.filter((x) => x.role_type === 'organization'),
          project_scoped_roles: data.filter((x) => x.role_type === 'project'),
          env_scoped_roles: data.filter((x) => x.role_type === 'environment'),
          branch_scoped_roles: data.filter((x) => x.role_type === 'branch'),
        } as OrganizationRolesData
      },
      enabled: enabled && typeof slug !== 'undefined',
      ...options,
    }
  )
