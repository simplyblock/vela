export const resourcesKeys = {
  organizationUsage: (orgSlug?: string, start?: string, end?: string) =>
    ['organizations', orgSlug, 'resources', 'usage', start, end] as const,
  organizationMetering: (orgSlug?: string, start?: string, end?: string) =>
    ['organizations', orgSlug, 'resources', 'metering', start, end] as const,
  projectUsage: (orgSlug?: string, projectRef?: string, start?: string, end?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'usage', start, end] as const,
}
