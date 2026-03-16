import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError, post } from 'data/fetchers'
import type { ResponseError } from 'types'
import { BranchesData } from './branches-query'
import { branchKeys } from './keys'

export type BranchPauseVariables = {
  orgRef: string
  projectRef: string
  branchRef: string
}

export async function pauseBranch({ orgRef, projectRef, branchRef }: BranchPauseVariables) {
  const { data, error } = await post(
    '/platform/organizations/{slug}/projects/{ref}/branches/{branch}/pause',
    {
      params: {
        path: {
          slug: orgRef,
          ref: projectRef,
          branch: branchRef,
        },
      },
    }
  )

  if (error) handleError(error)
  return data
}

type BranchPauseData = Awaited<ReturnType<typeof pauseBranch>>

export const useBranchPauseMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<BranchPauseData, ResponseError, BranchPauseVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<BranchPauseData, ResponseError, BranchPauseVariables>(
    (vars) => pauseBranch(vars),
    {
      async onSuccess(data, variables, context) {
        const { orgRef, projectRef, branchRef } = variables
        await queryClient.invalidateQueries(branchKeys.list(orgRef, projectRef))

        const branches: BranchesData | undefined = queryClient.getQueryData(
          branchKeys.list(orgRef, projectRef)
        )
        if (branches) {
          const updatedBranches = branches.filter((branch) => branch.name !== variables.branchRef)
          queryClient.setQueryData(branchKeys.list(orgRef, projectRef), updatedBranches)
        }

        await onSuccess?.(data, variables, context)
      },
      async onError(data, variables, context) {
        if (onError === undefined) {
          toast.error(`Failed to pause branch: ${data.message}`)
        } else {
          onError(data, variables, context)
        }
      },
      ...options,
    }
  )
}
