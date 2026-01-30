import { ProjectLimitsData, useProjectLimitsQuery } from 'data/resource-limits/project-limits-query'
import { ArrayElement } from 'types'
import { components } from '../vela/vela-schema'
import { Branch } from '../branches/branch-query'
import { useParams } from 'common'
import { useMemo } from 'react'
import { useOrganizationLimitsQuery } from 'data/resource-limits/organization-limits-query'
import { useResourceLimitDefinitionsQuery } from './resource-limit-definitions-query'

export interface SliderSpecification {
  label: string
  min: number
  max: number
  step: number
  unit: string
  divider: number
  initial: number
}

export type ResourceType = ArrayElement<ProjectLimitsData>['resource']
export type ProjectLimit = ArrayElement<ProjectLimitsData>
export type ResourceLimit = components['schemas']['ResourceLimitDefinitionPublic']

const sliderNames = {
  milli_vcpu: 'Assigned vCPU',
  ram: 'RAM',
  iops: 'IOPS',
  database_size: 'Database size',
  storage_size: 'Storage size',
}

const MAX_INTEGER = Number.MAX_SAFE_INTEGER
const GB = 1000000000
const TB = 1000 * GB
const MIB = 1024 * 1024
const GIB = 1024 * MIB

const selectSystemResourceType = (resourceType: ResourceType, limits?: ResourceLimit[]) =>
  !limits ? undefined : limits.find((limit) => limit.resource_type === resourceType)

const selectProjectResourceType = (resourceType: ResourceType, limits?: ProjectLimit[]) =>
  !limits ? undefined : limits.find((limit) => limit.resource === resourceType)

const iopsLimit = (
  projectLimits?: ProjectLimit[],
  systemLimits?: ResourceLimit[],
  source?: Branch
) => {
  const systemLimit = selectSystemResourceType('iops', systemLimits)
  const projectLimit = selectProjectResourceType('iops', projectLimits)

  const { max_per_branch } = projectLimit ? projectLimit : { max_per_branch: MAX_INTEGER }
  const { min, max, step } = systemLimit ? systemLimit : { min: 100, max: 100000000, step: 100 }

  const maxResources = source?.max_resources

  const maxIops = Math.min(max_per_branch, max)
  const minIops = min

  return {
    min: minIops,
    max: maxIops,
    step: step,
    unit: 'IOPS',
    divider: 1,
    initial: maxResources?.iops ?? minIops,
  }
}

const vcpuLimit = (
  projectLimits?: ProjectLimit[],
  systemLimits?: ResourceLimit[],
  source?: Branch
) => {
  const systemLimit = selectSystemResourceType('milli_vcpu', systemLimits)
  const projectLimit = selectProjectResourceType('milli_vcpu', projectLimits)

  const { max_per_branch } = projectLimit ? projectLimit : { max_per_branch: MAX_INTEGER }
  const { min, max, step } = systemLimit ? systemLimit : { min: 2000, max: 64000, step: 100 }

  const maxResources = source?.max_resources

  const maxMillis = Math.min(max_per_branch, max)
  const minMillis = min

  return {
    min: minMillis / step,
    max: maxMillis / step,
    step: 1,
    unit: 'x 0.1 vCPU',
    divider: step,
    initial: (maxResources?.iops ?? minMillis) / step,
  }
}

const memoryLimit = (
  projectLimits?: ProjectLimit[],
  systemLimits?: ResourceLimit[],
  source?: Branch
) => {
  const systemLimit = selectSystemResourceType('ram', systemLimits)
  const projectLimit = selectProjectResourceType('ram', projectLimits)

  const { max_per_branch } = projectLimit ? projectLimit : { max_per_branch: MAX_INTEGER }
  const { min, max, step, unit } = systemLimit
    ? systemLimit
    : { min: 2 * GIB, max: 256 * GIB, step: 128, unit: 'MiB' }

  const maxResources = source?.max_resources
  const maxMemory = Math.min(max_per_branch, max)
  const minMemory = min

  return {
    min: minMemory / GIB,
    max: maxMemory / GIB,
    step: 0.125,
    unit: 'GiB',
    divider: GIB,
    initial: (maxResources?.iops ?? minMemory) / GIB,
  }
}

const databaseSizeLimit = (
  projectLimits?: ProjectLimit[],
  systemLimits?: ResourceLimit[],
  source?: Branch
) => {
  const systemLimit = selectSystemResourceType('database_size', systemLimits)
  const projectLimit = selectProjectResourceType('database_size', projectLimits)

  const { max_per_branch } = projectLimit ? projectLimit : { max_per_branch: MAX_INTEGER }
  const { min, max, step, unit } = systemLimit
    ? systemLimit
    : { min: GB, max: 100 * TB, step: GB, unit: 'GB' }

  const maxResources = source?.max_resources

  const maxSize = Math.min(max_per_branch, max)
  const minSize = Math.max(maxResources?.nvme_bytes ?? min, min)

  return {
    min: minSize / step,
    max: maxSize / step,
    step: 1,
    unit: unit ?? 'GB',
    divider: step,
    initial: (maxResources?.iops ?? minSize) / step,
  }
}

const storageSizeLimit = (
  projectLimits?: ProjectLimit[],
  systemLimits?: ResourceLimit[],
  source?: Branch
) => {
  const systemLimit = selectSystemResourceType('storage_size', systemLimits)
  const projectLimit = selectProjectResourceType('storage_size', projectLimits)

  const { max_per_branch } = projectLimit ? projectLimit : { max_per_branch: MAX_INTEGER }
  const { min, max, step, unit } = systemLimit
    ? systemLimit
    : { min: GB, max: TB, step: GB, unit: 'GB' }

  const maxResources = source?.max_resources

  const maxSize = Math.min(max_per_branch, max)
  const minSize = Math.max(maxResources?.storage_bytes ?? min, min)

  return {
    min: minSize / step,
    max: maxSize / step,
    step: 1,
    unit: unit ?? 'GB',
    divider: step,
    initial: (maxResources?.iops ?? minSize) / step,
  }
}

export function useBranchSliderResourceLimits(
  source?: Branch,
  orgSlug?: string,
  projectRef?: string
): { isLoading: boolean; data: Record<ResourceType, SliderSpecification> | undefined } {
  const { slug, ref } = useParams()

  const { data: systemDefinitions, isLoading: systemDefinitionsLoading } =
    useResourceLimitDefinitionsQuery()

  const { data: orgDefinitions, isLoading: orgDefinitionsLoading } = useOrganizationLimitsQuery({
    orgRef: orgSlug || slug,
  })

  const normalizedOrgDefinitions = useMemo(
    () =>
      orgDefinitions?.map((definition) => {
        const systemLimit = selectSystemResourceType(definition.resource, systemDefinitions)
        return {
          min: systemLimit?.min ?? 0,
          max: definition.max_per_branch,
          step: systemLimit?.step ?? 1,
          resource_type: definition.resource,
          unit: systemLimit?.unit ?? '',
        } as ResourceLimit
      }) ?? ([] as ResourceLimit[]),
    [orgDefinitions, systemDefinitions]
  )

  const { data: projectLimits, isLoading: projectLimitsLoading } = useProjectLimitsQuery({
    orgRef: orgSlug || slug,
    projectRef: projectRef || ref,
  })

  const limits = useMemo(() => {
    if (orgDefinitionsLoading || projectLimitsLoading || systemDefinitionsLoading) return undefined

    const vcpu = vcpuLimit(projectLimits, normalizedOrgDefinitions, source)
    const memory = memoryLimit(projectLimits, normalizedOrgDefinitions, source)
    const iops = iopsLimit(projectLimits, normalizedOrgDefinitions, source)
    const databaseSize = databaseSizeLimit(projectLimits, normalizedOrgDefinitions, source)
    const storageSize = storageSizeLimit(projectLimits, normalizedOrgDefinitions, source)

    return {
      milli_vcpu: {
        ...vcpu,
        label: sliderNames.milli_vcpu,
      },
      ram: {
        ...memory,
        label: sliderNames.ram,
      },
      iops: {
        ...iops,
        label: sliderNames.iops,
      },
      database_size: {
        ...databaseSize,
        label: sliderNames.database_size,
      },
      storage_size: {
        ...storageSize,
        label: sliderNames.storage_size,
      },
    }
  }, [
    systemDefinitionsLoading,
    projectLimitsLoading,
    systemDefinitions,
    projectLimits,
    slug,
    ref,
    source,
  ])

  return {
    isLoading: systemDefinitionsLoading || projectLimitsLoading || orgDefinitionsLoading,
    data: limits,
  }
}
