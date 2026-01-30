import { get, handleError } from '../fetchers'
import {
  type OmitKeyof,
  QueryFunctionContext,
  useQuery,
  UseQueryOptions,
} from '@tanstack/react-query'
import { ResponseError } from '../../types'
import { resourceLimitsKeys } from './keys'

interface OrganizationLimitsVariables {
  orgRef?: string
}

async function getOrganizationLimits(
  { orgRef }: OrganizationLimitsVariables,
  signal?: AbortSignal
) {
  if (!orgRef) throw new Error('Organization slug is required')

  const { data, error } = await get('/platform/organizations/{slug}/resources/limits', {
    params: {
      path: {
        slug: orgRef,
      },
    },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type OrganizationLimitsData = Awaited<ReturnType<typeof getOrganizationLimits>>
export type OrganizationLimitsError = ResponseError

export const useOrganizationLimitsQuery = <TData = OrganizationLimitsData>(
  { orgRef }: OrganizationLimitsVariables,
  {
    enabled = true,
    ...options
  }: OmitKeyof<
    UseQueryOptions<OrganizationLimitsData, OrganizationLimitsError, TData>,
    'initialData'
  > = {}
) => {
  return useQuery<OrganizationLimitsData, OrganizationLimitsError, TData>({
    ...options,
    staleTime: 60_000,
    queryKey: resourceLimitsKeys.organizationLimits(orgRef),
    queryFn: async (context: QueryFunctionContext) =>
      getOrganizationLimits({ orgRef }, context.signal),
    enabled: enabled && typeof orgRef !== 'undefined',
  })
}
