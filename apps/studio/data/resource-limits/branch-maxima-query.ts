import { get, handleError } from '../fetchers'
import { OmitKeyof, QueryFunctionContext, useQuery, UseQueryOptions } from '@tanstack/react-query'
import { ResponseError } from '../../types'
import { resourceLimitsKeys } from './keys'

interface ProjectBranchMaximaVariables {
  orgRef?: string
  projectRef?: string
}

async function getProjectBranchMaxima(
  { orgRef, projectRef }: ProjectBranchMaximaVariables,
  signal?: AbortSignal
) {
  if (!orgRef) throw new Error('Organization slug is required')
  if (!projectRef) throw new Error('Project ref is required')
  const { data, error } = await get(
    '/platform/organizations/{slug}/projects/{ref}/resources/branch-maxima',
    {
      params: { path: { slug: orgRef, ref: projectRef } },
      signal,
    }
  )
  if (error) handleError(error)
  return data
}

export type ProjectBranchMaximaData = Awaited<ReturnType<typeof getProjectBranchMaxima>>
export type ProjectBranchMaximaError = ResponseError

export const useProjectBranchMaximaQuery = <TData = ProjectBranchMaximaData>(
  { orgRef, projectRef }: ProjectBranchMaximaVariables,
  {
    enabled = true,
    ...options
  }: OmitKeyof<
    UseQueryOptions<ProjectBranchMaximaData, ProjectBranchMaximaError, TData>,
    'initialData'
  > = {}
) => {
  return useQuery<ProjectBranchMaximaData, ProjectBranchMaximaError, TData>({
    ...options,
    staleTime: 60_000,
    queryKey: resourceLimitsKeys.projectBranchMaxima(orgRef, projectRef),
    queryFn: async (context: QueryFunctionContext) =>
      getProjectBranchMaxima({ orgRef, projectRef }, context.signal),
    enabled: enabled && typeof orgRef !== 'undefined' && typeof projectRef !== 'undefined',
  })
}
