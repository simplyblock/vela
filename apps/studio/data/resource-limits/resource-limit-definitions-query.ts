import { get, handleError } from '../fetchers'
import { ResponseError } from '../../types'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { resourceLimitsKeys } from './keys'

export interface ResourceLimitDefinitionVariables {
  orgId?: string
}

async function getResourceLimitDefinitions(
  { orgId }: ResourceLimitDefinitionVariables,
  signal?: AbortSignal
) {
  const { data, error } = await get('/platform/resource-limits', { signal })
  if (error) handleError(error)
  return data
}

export type AvailableResourceLimitDefinitionsData = Awaited<
  ReturnType<typeof getResourceLimitDefinitions>
>
export type AvailableResourceLimitDefinitionsError = ResponseError

export const useResourceLimitDefinitionsQuery = <TData = AvailableResourceLimitDefinitionsData>(
  { orgId }: ResourceLimitDefinitionVariables,
  options: UseQueryOptions<
    AvailableResourceLimitDefinitionsData,
    AvailableResourceLimitDefinitionsError,
    TData
  > = {}
) =>
  useQuery<AvailableResourceLimitDefinitionsData, AvailableResourceLimitDefinitionsError, TData>(
    resourceLimitsKeys.resource_limits(orgId),
    ({ signal }) => getResourceLimitDefinitions({ orgId }, signal),
    {
      ...options,
      staleTime: Infinity,
    }
  )
