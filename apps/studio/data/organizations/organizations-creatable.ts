import { useOrganizationsQuery } from './organizations-query'

export function useOrganizationsCreatable() {
  const { data: organizations, isLoading  } = useOrganizationsQuery()
  return {
    isLoading: isLoading,
    data: (organizations?.length ?? 0) < 1,
  }
}