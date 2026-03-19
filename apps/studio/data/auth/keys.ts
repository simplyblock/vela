export const authKeys = {
  users2: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
    params?: {
      page: number | undefined
      keywords: string | undefined
      filter: string | undefined
    }
  ) => ['branches', orgId, projectId, branchId, 'users', ...(params ? [params] : [])] as const,

  usersInfinite: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
    params?: {
      keywords: string | undefined
      filter: string | undefined
      providers: string[] | undefined
      sort: string | undefined
      order: string | undefined
    }
  ) =>
    [
      'branches',
      orgId,
      projectId,
      branchId,
      'users-infinite',
      ...(params ? [params].filter(Boolean) : []),
    ] as const,
  usersCount: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
    params?: {
      filter: string | undefined
      keywords: string | undefined
    }
  ) =>
    [
      'branches',
      orgId,
      projectId,
      branchId,
      'users-count',
      ...(params ? [params].filter(Boolean) : []),
    ] as const,

  authConfig: (projectRef: string | undefined) => ['projects', projectRef, 'auth-config'] as const,
  authMFA: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
  ) => ['branches', orgId, projectId, branchId, 'mfa-config'] as const,
  authSmtp: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
  ) => ['branches', orgId, projectId, branchId, 'smtp-config'] as const,
  accessToken: () => ['access-token'] as const,
  authProviders: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
    params?: {
      keywords: string | undefined
      filter: string | undefined
      providers: string[] | undefined
    }
  ) =>
    [
      'branches',
      orgId,
      projectId,
      branchId,
      'auth-providers',
      ...(params ? [params].filter(Boolean) : []),
    ] as const,
  userSessions: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
    userId: string | undefined
  ) => ['branches', orgId, projectId, branchId, 'users', userId, 'sessions'] as const,
  userProviders: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
    userId: string | undefined
  ) => ['branches', orgId, projectId, branchId, 'users', userId, 'providers'] as const,
  logs: (
    orgId: string | undefined,
    projectId: string | undefined,
    branchId: string | undefined,
  ) => ['branches', orgId, projectId, branchId, 'logs'] as const,
}
