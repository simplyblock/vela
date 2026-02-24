import { get, handleError } from '../fetchers'
import {
  type OmitKeyof,
  QueryFunctionContext,
  useQuery,
  UseQueryOptions,
} from '@tanstack/react-query'
import { ResponseError } from '../../types'
import { resourcesKeys } from './keys'

interface OrganizationUsageVariables {
  orgRef?: string
  start?: string
  end?: string
}

async function getOrganizationUsage(
  { orgRef, start, end }: OrganizationUsageVariables,
  signal?: AbortSignal
) {
  if (!orgRef) throw new Error('Organization slug is required')

  const { data, error } = await get('/platform/organizations/{slug}/metering', {
    params: {
      path: {
        slug: orgRef,
      },
      query: {
        start,
        end,
      },
    },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type OrganizationUsageData = Awaited<ReturnType<typeof getOrganizationUsage>>
export type OrganizationUsageError = ResponseError

export const useOrganizationMeteringQuery = <TData = OrganizationUsageData>(
  { orgRef, start, end }: OrganizationUsageVariables,
  {
    enabled = true,
    ...options
  }: OmitKeyof<
    UseQueryOptions<OrganizationUsageData, OrganizationUsageError, TData>,
    'initialData'
  > = {}
) => {
  return useQuery<OrganizationUsageData, OrganizationUsageError, TData>({
    ...options,
    queryKey: resourcesKeys.organizationMetering(orgRef, start, end),
    staleTime: 60000,
    queryFn: async (context: QueryFunctionContext) =>
      getOrganizationUsage({ orgRef, start, end }, context.signal),
    enabled: enabled && typeof orgRef !== 'undefined',
  })
}
