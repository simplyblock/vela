import { get, handleError } from '../fetchers'
import { ResponseError } from '../../types'
import { OmitKeyof, QueryFunctionContext, useQuery, UseQueryOptions } from '@tanstack/react-query'
import { resourcesKeys } from '../resources/keys'

interface EffectiveBranchLimitsVariables {
  orgRef?: string
  projectRef?: string
  branchRef?: string
}

async function getEffectiveBranchLimits(
  { orgRef, projectRef, branchRef }: EffectiveBranchLimitsVariables,
  signal?: AbortSignal
) {
  if (!orgRef) throw new Error('Organization slug is required')
  if (!projectRef) throw new Error('Project ref is required')
  if (!branchRef) throw new Error('Branch ref is required')

  const { data, error } = await get(
    '/platform/organizations/{slug}/projects/{ref}/branches/{branch}/resources/limits',
    {
      params: {
        path: {
          slug: orgRef,
          ref: projectRef,
          branch: branchRef,
        },
      },
      signal,
    }
  )

  if (error) handleError(error)
  return data
}


export type EffectiveBranchLimitsData = Awaited<ReturnType<typeof getEffectiveBranchLimits>>
export type EffectiveBranchLimitsError = ResponseError

export const useEffectiveBranchLimitsQuery = <TData = EffectiveBranchLimitsData>(
  { orgRef, projectRef, branchRef }: EffectiveBranchLimitsVariables,
  {
    enabled = true,
    ...options
  }: OmitKeyof<
    UseQueryOptions<EffectiveBranchLimitsData, EffectiveBranchLimitsError, TData>,
    'initialData'
  > = {}
) => {
  return useQuery<EffectiveBranchLimitsData, EffectiveBranchLimitsError, TData>({
    ...options,
    staleTime: 60_000,
    queryKey: resourcesKeys.branchEffectiveLimits(orgRef, projectRef, branchRef),
    queryFn: async (context: QueryFunctionContext) =>
      getEffectiveBranchLimits({ orgRef, projectRef, branchRef }, context.signal),
    enabled:
      enabled &&
      typeof orgRef !== 'undefined' &&
      typeof projectRef !== 'undefined' &&
      typeof branchRef !== 'undefined',
  })
}
