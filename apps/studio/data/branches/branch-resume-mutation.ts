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

export async function resumeBranch({ orgRef, projectRef, branchRef }: BranchPauseVariables) {
  const { data, error } = await post(
    '/platform/organizations/{slug}/projects/{ref}/branches/{branch}/resume',
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

type BranchResumeData = Awaited<ReturnType<typeof resumeBranch>>

export const useBranchResumeMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<BranchResumeData, ResponseError, BranchPauseVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<BranchResumeData, ResponseError, BranchPauseVariables>(
    (vars) => resumeBranch(vars),
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
          toast.error(`Failed to delete branch: ${data.message}`)
        } else {
          onError(data, variables, context)
        }
      },
      ...options,
    }
  )
}
