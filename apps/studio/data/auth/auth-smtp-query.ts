import { useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { get, handleError } from 'data/fetchers'
import { useCallback } from 'react'
import type { ResponseError } from 'types'
import { authKeys } from './keys'

export type AuthSmtpVariables = {
  orgId?: string
  projectId?: string
  branchId?: string
}

export async function getBranchAuthSmtp(
  { orgId, projectId, branchId }: AuthSmtpVariables,
  signal?: AbortSignal
) {
  const { data, error } = await get(
    '/platform/organizations/{slug}/projects/{ref}/branches/{branch}/auth/config/smtp/',
    {
      params: {
        path: {
          slug: orgId!,
          ref: projectId!,
          branch: branchId!,
        },
      },
      signal,
    }
  )
  if (error) handleError(error)
  return data
}

export type BranchAuthSmtpData = Awaited<ReturnType<typeof getBranchAuthSmtp>>
export type BranchAuthSmtpError = ResponseError

export const useAuthSmtpQuery = <TData = BranchAuthSmtpData>(
  { orgId, projectId, branchId }: AuthSmtpVariables,
  {
    enabled = true,
    ...options
  }: UseQueryOptions<BranchAuthSmtpData, BranchAuthSmtpError, TData> = {}
) =>
  useQuery<BranchAuthSmtpData, BranchAuthSmtpError, TData>(
    authKeys.authSmtp(orgId, projectId, branchId),
    ({ signal }) => getBranchAuthSmtp({ orgId, projectId, branchId }, signal),
    {
      enabled:
        enabled &&
        typeof orgId !== 'undefined' &&
        typeof projectId !== 'undefined' &&
        typeof branchId !== 'undefined',
      ...options,
    }
  )

export const useAuthSmtpPrefetch = ({ orgId, projectId, branchId }: AuthSmtpVariables) => {
  const client = useQueryClient()

  return useCallback(() => {
    if (projectId) {
      client.prefetchQuery(authKeys.authSmtp(orgId, projectId, branchId), ({ signal }) =>
        getBranchAuthSmtp({ orgId, projectId, branchId }, signal)
      )
    }
  }, [client, orgId, projectId, branchId])
}
