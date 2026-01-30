import { get, handleError } from '../fetchers'
import { ResponseError } from '../../types'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { resourceLimitsKeys } from './keys'

async function getResourceLimitDefinitions(
  signal?: AbortSignal
) {
  const { data, error } = await get('/platform/resource-limits', { signal })
  if (error) handleError(error)
  return data
}

export type ResourceLimitDefinitionsData = Awaited<ReturnType<typeof getResourceLimitDefinitions>>
export type ResourceLimitDefinitionsError = ResponseError

export const useResourceLimitDefinitionsQuery = <TData = ResourceLimitDefinitionsData>(
  options: UseQueryOptions<ResourceLimitDefinitionsData, ResourceLimitDefinitionsError, TData> = {}
) =>
  useQuery<ResourceLimitDefinitionsData, ResourceLimitDefinitionsError, TData>(
    resourceLimitsKeys.system_resource_limits(),
    ({ signal }) => getResourceLimitDefinitions(signal),
    {
      ...options,
      staleTime: Infinity,
    }
  )
