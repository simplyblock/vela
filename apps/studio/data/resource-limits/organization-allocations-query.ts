import { get, handleError } from '../fetchers'
import {
  type OmitKeyof,
  QueryFunctionContext,
  useQuery,
  UseQueryOptions,
} from '@tanstack/react-query'
import { ResponseError } from '../../types'
import { resourceLimitsKeys } from './keys'
import type { components as VelaComponents } from '../vela/vela-schema'

interface OrganizationAllocationsVariables {
  orgRef?: string
}

async function getOrganizationAllocations(
  { orgRef }: OrganizationAllocationsVariables,
  signal?: AbortSignal
) {
  if (!orgRef) throw new Error('Organization slug is required')

  const { data, error } = await get('/platform/organizations/{slug}/resources/allocations', {
    params: {
      path: {
        slug: orgRef,
      },
    },
    signal,
  })

  if (error) handleError(error)
  return data as OrganizationAllocationsData
}

export type OrganizationAllocationsData = VelaComponents['schemas']['Resources']
export type OrganizationAllocationsError = ResponseError

export const useOrganizationAllocationsQuery = <TData = OrganizationAllocationsData>(
  { orgRef }: OrganizationAllocationsVariables,
  {
    enabled = true,
    ...options
  }: OmitKeyof<
    UseQueryOptions<OrganizationAllocationsData, OrganizationAllocationsError, TData>,
    'initialData'
  > = {}
) => {
  return useQuery<OrganizationAllocationsData, OrganizationAllocationsError, TData>({
    ...options,
    staleTime: 60_000,
    queryKey: resourceLimitsKeys.organizationAllocations(orgRef),
    queryFn: async (context: QueryFunctionContext) =>
      getOrganizationAllocations({ orgRef }, context.signal),
    enabled: enabled && typeof orgRef !== 'undefined',
  })
}
