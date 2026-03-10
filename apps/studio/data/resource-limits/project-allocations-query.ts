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

interface ProjectAllocationsVariables {
  orgRef?: string
  projectRef?: string
}

async function getProjectAllocations(
  { orgRef, projectRef }: ProjectAllocationsVariables,
  signal?: AbortSignal
) {
  if (!orgRef) throw new Error('Organization slug is required')
  if (!projectRef) throw new Error('Project ref is required')

  const { data, error } = await get(
    '/platform/organizations/{slug}/projects/{ref}/resources/allocations',
    {
      params: {
        path: {
          slug: orgRef,
          ref: projectRef,
        },
      },
      signal,
    }
  )

  if (error) handleError(error)
  return data as ProjectAllocationsData
}

export type ProjectAllocationsData = VelaComponents['schemas']['ResourceLimitsPublic']
export type ProjectAllocationsError = ResponseError

export const useProjectAllocationsQuery = <TData = ProjectAllocationsData>(
  { orgRef, projectRef }: ProjectAllocationsVariables,
  {
    enabled = true,
    ...options
  }: OmitKeyof<
    UseQueryOptions<ProjectAllocationsData, ProjectAllocationsError, TData>,
    'initialData'
  > = {}
) => {
  return useQuery<ProjectAllocationsData, ProjectAllocationsError, TData>({
    ...options,
    staleTime: 60_000,
    queryKey: resourceLimitsKeys.projectAllocations(orgRef, projectRef),
    queryFn: async (context: QueryFunctionContext) =>
      getProjectAllocations({ orgRef, projectRef }, context.signal),
    enabled: enabled && typeof orgRef !== 'undefined' && typeof projectRef !== 'undefined',
  })
}
