import { get, handleError } from '../fetchers'
import {
  type OmitKeyof,
  QueryFunctionContext,
  useQuery,
  UseQueryOptions,
} from '@tanstack/react-query'
import { ResponseError } from '../../types'
import { resourceLimitsKeys } from './keys'

interface ProjectLimitsVariables {
  orgRef?: string
  projectRef?: string
}

async function getProjectLimits(
  { orgRef, projectRef }: ProjectLimitsVariables,
  signal?: AbortSignal
) {
  if (!orgRef) throw new Error('Organization slug is required')
  if (!projectRef) throw new Error('Project ref is required')

  const { data, error } = await get(
    '/platform/organizations/{slug}/projects/{ref}/resources/limits',
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
  return data
}

export type ProjectLimitsData = Awaited<ReturnType<typeof getProjectLimits>>
export type ProjectLimitsError = ResponseError

export const useProjectLimitsQuery = <TData = ProjectLimitsData>(
  { orgRef, projectRef }: ProjectLimitsVariables,
  {
    enabled = true,
    ...options
  }: OmitKeyof<UseQueryOptions<ProjectLimitsData, ProjectLimitsError, TData>, 'initialData'> = {}
) => {
  return useQuery<ProjectLimitsData, ProjectLimitsError, TData>({
    ...options,
    staleTime: 60_000,
    queryKey: resourceLimitsKeys.projectLimits(orgRef, projectRef),
    queryFn: async (context: QueryFunctionContext) =>
      getProjectLimits({ orgRef, projectRef }, context.signal),
    enabled: enabled && typeof orgRef !== 'undefined' && typeof projectRef !== 'undefined',
  })
}
