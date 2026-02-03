export const organizationMembersKeys = {
  roles: (slug: string | undefined) => ['organization-members', slug, 'roles'] as const,
  role_assignments: (slug: string | undefined) => ['organization-members', slug, 'role-assignments'] as const,
  invitations: (slug: string | undefined) => ['organization-members', slug, 'invitations'] as const,
  invitation: (slug: string | undefined, token: string | undefined) =>
    ['organization-members', slug, 'invitations', token] as const,
  token: (slug: string | undefined, token: string | undefined) =>
    ['organization-members', slug, 'token', token] as const,
}
