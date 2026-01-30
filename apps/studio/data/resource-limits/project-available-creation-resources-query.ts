import { get, handleError } from '../fetchers'
import { ResponseError } from '../../types'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { resourceLimitsKeys } from './keys'

export interface ProjectAvailableCreationResourcesVariables {
  orgId?: string
  projectId?: string
}

async function getProjectAvailableCreationResources(
  { orgId, projectId }: ProjectAvailableCreationResourcesVariables,
  signal?: AbortSignal
) {
  if (!orgId) throw new Error('orgId is required')
  if (!projectId) throw new Error('projectId is required')
  const { data, error } = await get(
    '/platform/organizations/{slug}/projects/{ref}/resources/available',
    {
      params: {
        path: {
          slug: orgId,
          ref: projectId,
        },
      },
      signal,
    }
  )
  if (error) handleError(error)
  return data
}

export type ProjectAvailableCreationResourcesData = Awaited<ReturnType<typeof getProjectAvailableCreationResources>>
export type ProjectAvailableCreationResourcesError = ResponseError

export const useProjectAvailableCreationResourcesQuery = <TData = ProjectAvailableCreationResourcesData>(
  { orgId, projectId }: ProjectAvailableCreationResourcesVariables,
  options: UseQueryOptions<
    ProjectAvailableCreationResourcesData,
    ProjectAvailableCreationResourcesError,
    TData
  > = {}
) =>
  useQuery<ProjectAvailableCreationResourcesData, ProjectAvailableCreationResourcesError, TData>(
    resourceLimitsKeys.projectEffectiveLimits(orgId, projectId),
    ({ signal }) => getProjectAvailableCreationResources({ orgId, projectId }, signal),
    {
      ...options,
      staleTime: Infinity,
    }
  )
