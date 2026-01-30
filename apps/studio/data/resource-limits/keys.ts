export const resourceLimitsKeys = {
  system_resource_limits: () => ['system_resource_limits'] as const,
  organizationLimits: (orgSlug?: string) =>
    ['organizations', orgSlug, 'resources', 'limits'] as const,
  organizationEffectiveLimits: (orgSlug?: string) =>
    ['organizations', orgSlug, 'resources', 'effective-limits'] as const,
  projectLimits: (orgSlug?: string, projectRef?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'limits'] as const,
  projectEffectiveLimits: (orgSlug?: string, projectRef?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'effective-limits'] as const,
  branchEffectiveLimits: (orgSlug?: string, projectRef?: string, branchId?: string) =>
    ['branches', orgSlug, projectRef, branchId, 'resources', 'effective-limits'] as const,
}
