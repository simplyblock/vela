import { get, handleError } from '../fetchers'
import { ResponseError } from '../../types'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { resourceLimitsKeys } from './keys'

export interface OrgAvailableCreationResourcesVariables {
  orgId?: string
}

async function getOrgAvailableCreationResources(
  { orgId }: OrgAvailableCreationResourcesVariables,
  signal?: AbortSignal
) {
  if (!orgId) throw new Error('orgId is required')
  const { data, error } = await get('/platform/organizations/{slug}/resources/available', {
    params: {
      path: {
        slug: orgId,
      },
    },
    signal,
  })
  if (error) handleError(error)
  return data
}

export type OrgAvailableCreationResourcesData = Awaited<ReturnType<typeof getOrgAvailableCreationResources>>
export type OrgAvailableCreationResourcesError = ResponseError

export const useOrgAvailableCreationResourcesQuery = <TData = OrgAvailableCreationResourcesData>(
  { orgId }: OrgAvailableCreationResourcesVariables,
  options: UseQueryOptions<
    OrgAvailableCreationResourcesData,
    OrgAvailableCreationResourcesError,
    TData
  > = {}
) =>
  useQuery<OrgAvailableCreationResourcesData, OrgAvailableCreationResourcesError, TData>(
    resourceLimitsKeys.organizationEffectiveLimits(orgId),
    ({ signal }) => getOrgAvailableCreationResources({ orgId }, signal),
    {
      ...options,
      staleTime: Infinity,
    }
  )
