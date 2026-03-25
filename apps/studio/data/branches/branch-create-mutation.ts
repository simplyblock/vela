import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { handleError, post } from 'data/fetchers'
import type { ResponseError } from 'types'
import { branchKeys } from './keys'
import { components } from '../vela/vela-schema'

type BranchCreate = components['schemas']['BranchCreate']
type BranchCreateSource = BranchCreate['source']
type BranchCreateRestore = BranchCreate['restore']
type DeploymentParameters = components['schemas']['DeploymentParameters']
type SourceDeploymentParameters = components['schemas']['BranchSourceDeploymentParameters']

type BranchCloneVariables = {
  orgRef: string
  projectRef: string
  branchRef?: string
  branchName: string
  envType?: string
  withConfig?: boolean
  withData?: boolean
  deployment?: SourceDeploymentParameters
}

type BranchRestoreVariables = {
  orgRef: string
  projectRef: string
  backupRef?: string
  branchName: string
  envType?: string
  withConfig?: boolean
  deployment?: SourceDeploymentParameters
}

type BranchCreationVariables = {
  orgRef: string
  projectRef: string
  branchName: string
  envType?: string
  withConfig?: boolean
  deployment?: DeploymentParameters
}

export type BranchCreateVariables = BranchCreationVariables & BranchCloneVariables & BranchRestoreVariables

export async function createBranch({
  orgRef,
  projectRef,
  branchRef,
  backupRef,
  branchName,
  withData,
  withConfig,
  deployment,
  envType,
}: BranchCreateVariables) {
  const isClone = branchRef !== undefined
  const isRestore = backupRef !== undefined
  const providesDeployment = deployment !== undefined

  const source: BranchCreateSource | undefined = isClone ? {
    branch_id: branchRef,
    config_copy: withConfig,
    data_copy: withData,
    deployment_parameters: providesDeployment ? {
      database_password: deployment?.database_password,
      milli_vcpu: deployment?.milli_vcpu,
      memory_bytes: deployment?.memory_bytes,
      iops: deployment?.iops,
      database_size: deployment?.database_size,
      storage_size: deployment?.storage_size,
      enable_file_storage: deployment?.enable_file_storage,
    } : undefined
  } : undefined

  const restore: BranchCreateRestore | undefined = isRestore ? {
    backup_id: backupRef,
    config_copy: withConfig,
    deployment_parameters: providesDeployment ? {
      milli_vcpu: deployment?.milli_vcpu,
      memory_bytes: deployment?.memory_bytes,
      iops: deployment?.iops,
      database_size: deployment?.database_size,
      storage_size: deployment?.storage_size,
      enable_file_storage: deployment?.enable_file_storage,
    } : undefined
  } : undefined

  const { data, error } = await post('/platform/organizations/{slug}/projects/{ref}/branches', {
    params: {
      path: {
        slug: orgRef,
        ref: projectRef,
      },
    },
    body: {
      name: branchName,
      env_type: envType,
      source: source,
      restore: restore,
      deployment: !isClone && !isRestore ? deployment : undefined,
    },
  })

  if (error) handleError(error)
  return data
}

type BranchCreateData = Awaited<ReturnType<typeof createBranch>>

export const useBranchCreateMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<BranchCreateData, ResponseError, BranchCreateVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<BranchCreateData, ResponseError, BranchCreateVariables>(
    (vars) => createBranch(vars),
    {
      async onSuccess(data, variables, context) {
        const { orgRef, projectRef } = variables
        await queryClient.invalidateQueries(branchKeys.list(orgRef, projectRef))
        await onSuccess?.(data, variables, context)
      },
      async onError(data, variables, context) {
        if (onError === undefined) {
          toast.error(`Failed to create branch: ${data.message}`)
        } else {
          onError(data, variables, context)
        }
      },
      ...options,
    }
  )
}
