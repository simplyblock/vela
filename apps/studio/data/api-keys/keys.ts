export const apiKeysKeys = {
  list: (orgId?: string, projectId?: string, branchId?: string, reveal?: boolean) =>
    ['branches', orgId, projectId, branchId, 'api-keys', reveal].filter(Boolean),
  single: (orgId?: string, projectRef?: string, branchId?: string, id?: string) => ['projects', orgId, projectRef, branchId, 'api-keys', id] as const,
  status: (projectRef?: string) => ['projects', projectRef, 'api-keys', 'legacy'] as const,
}
