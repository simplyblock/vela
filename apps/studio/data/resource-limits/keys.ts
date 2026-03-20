export const resourceLimitsKeys = {
  system_resource_limits: () => ['system_resource_limits'] as const,
  systemLimits: () => ['resources', 'limits'] as const,
  systemAllocations: () => ['resources', 'allocations'] as const,
  systemAvailable: () => ['resources', 'available'] as const,
  organizationLimits: (orgSlug?: string) =>
    ['organizations', orgSlug, 'resources', 'limits'] as const,
  organizationAllocations: (orgSlug?: string) =>
    ['organizations', orgSlug, 'resources', 'allocations'] as const,
  organizationEffectiveLimits: (orgSlug?: string) =>
    ['organizations', orgSlug, 'resources', 'effective-limits'] as const,
  projectLimits: (orgSlug?: string, projectRef?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'limits'] as const,
  projectAllocations: (orgSlug?: string, projectRef?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'allocations'] as const,
  projectEffectiveLimits: (orgSlug?: string, projectRef?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'effective-limits'] as const,
  projectBranchMaxima: (orgSlug?: string, projectRef?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'branch-maxima'] as const,
}
