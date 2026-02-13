import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { del, handleError } from 'data/fetchers'
import type { ResponseError } from 'types'
import { BranchesData } from './branches-query'
import { branchKeys } from './keys'

export type BranchDeleteVariables = {
  orgRef: string
  projectRef: string
  branchRef: string
}

export async function deleteBranch({ orgRef, projectRef, branchRef }: BranchDeleteVariables) {
  const { data, error } = await del(
    '/platform/organizations/{slug}/projects/{ref}/branches/{branch}',
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

type BranchDeleteData = Awaited<ReturnType<typeof deleteBranch>>

export const useBranchDeleteMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<BranchDeleteData, ResponseError, BranchDeleteVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<BranchDeleteData, ResponseError, BranchDeleteVariables>(
    (vars) => deleteBranch(vars),
    {
      async onSuccess(data, variables, context) {
        const { orgRef, projectRef, branchRef } = variables

        queryClient.invalidateQueries(branchKeys.list(orgRef, projectRef))

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
