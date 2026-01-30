export const resourcesKeys = {
  organizationUsage: (orgSlug?: string) =>
    ['organizations', orgSlug, 'resources', 'usage'] as const,
  projectUsage: (orgSlug?: string, projectRef?: string) =>
    ['projects', orgSlug, projectRef, 'resources', 'usage'] as const,
}
