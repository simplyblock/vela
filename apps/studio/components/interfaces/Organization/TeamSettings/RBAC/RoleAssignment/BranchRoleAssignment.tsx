import { useMemo, useState, useEffect } from 'react'
import { UserPlus, X } from 'lucide-react'
import { useParams } from 'common'

import {
  ScaffoldFilterAndContent,
  ScaffoldSectionContent,
} from 'components/layouts/Scaffold'
import { RolesTable } from '../Role/RolesTable'

import { useOrganizationRolesQuery } from 'data/organizations/organization-roles-query'
import { useOrganizationRoleAssignmentsQuery } from 'data/organization-members/organization-role-assignments-query'
import {
  type Member,
  useOrganizationMembersQuery,
} from 'data/organizations/organization-members-query'

import { useOrganizationMemberAssignRoleMutation } from 'data/organization-members/organization-member-role-assign-mutation'
import { useOrganizationMemberUnassignRoleMutation } from 'data/organization-members/organization-member-role-unassign-mutation'

import { useProjectsQuery } from 'data/projects/projects-query'
import { useBranchesQuery } from 'data/branches/branches-query'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'

import {
  Button,
  Checkbox_Shadcn_,
  ScrollArea,
  Select_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectContent_Shadcn_,
  SelectGroup_Shadcn_,
  SelectItem_Shadcn_,
} from 'ui'
import { AssignMembersDialog } from './AssignMembersDialog'

type RoleAssignmentsMap = Record<string, string[]> // roleId -> userIds[]

export const BranchRoleAssignment = () => {
  const { slug } = useParams()

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [pendingSelection, setPendingSelection] = useState<string[]>([])

  const [selectedProjectId, setSelectedProjectId] = useState<string | ''>('')
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])

  const { data: roles, isLoading: isLoadingRoles } = useOrganizationRolesQuery({ slug })
  const { data: roleAssignments, isLoading: isLoadingRoleAssignments } =
    useOrganizationRoleAssignmentsQuery({ slug })
  const { data: members, isLoading: isLoadingMembers } = useOrganizationMembersQuery({ slug })
  const { data: organization } = useSelectedOrganizationQuery()
  const { data: projects } = useProjectsQuery()

  const { data: branches } = useBranchesQuery(
    { orgRef: slug, projectRef: selectedProjectId },
    { enabled: Boolean(selectedProjectId) }
  )

  const { mutate: assignRole } = useOrganizationMemberAssignRoleMutation()
  const { mutate: unassignRole } = useOrganizationMemberUnassignRoleMutation()

  const isLoading = isLoadingRoles || isLoadingRoleAssignments || isLoadingMembers

  // Only branch roles (no org / project / env)
  const branchRoles = useMemo(
    () => (roles || []).filter((r) => r.role_type === 'branch'),
    [roles]
  )

  // Filter projects to current org
  const orgProjects = useMemo(
    () => (projects || []).filter((p) => p.organization_id === organization?.id),
    [projects, organization?.id]
  )

  // Default selected project to first org project when available
  useEffect(() => {
    if (!selectedProjectId && orgProjects.length > 0) {
      setSelectedProjectId(orgProjects[0].id)
    }
  }, [orgProjects, selectedProjectId])

  const roleAssignmentsMap: RoleAssignmentsMap = useMemo(() => {
    const map: RoleAssignmentsMap = {}
    ;(roleAssignments ?? []).forEach((link) => {
      if (!map[link.role_id]) map[link.role_id] = []
      if (!map[link.role_id].includes(link.user_id)) {
        map[link.role_id].push(link.user_id)
      }
    })
    return map
  }, [roleAssignments])

  const membersById = useMemo(() => {
    const map: Record<string, Member> = {}
    ;(members || []).forEach((m) => {
      if (m.user_id) map[m.user_id] = m
    })
    return map
  }, [members])

  const selectedRole = useMemo(
    () => branchRoles.find((r) => r.id === selectedRoleId) ?? null,
    [branchRoles, selectedRoleId]
  )

  const assignedMembers = useMemo(() => {
    if (!selectedRoleId) return []
    const userIds = roleAssignmentsMap[selectedRoleId] ?? []
    return userIds.map((id) => membersById[id]).filter((m): m is Member => !!m)
  }, [selectedRoleId, roleAssignmentsMap, membersById])

  const allMembers = members || []

  const handleRemoveMember = (userId: string) => {
    if (!selectedRoleId || !slug) return
    unassignRole({ slug, userId, roleId: selectedRoleId })
  }

  const handleTogglePendingUser = (userId: string) => {
    setPendingSelection((p) =>
      p.includes(userId) ? p.filter((id) => id !== userId) : p.concat(userId)
    )
  }

  const handleToggleBranch = (branchId: string) => {
    setSelectedBranchIds((p) =>
      p.includes(branchId) ? p.filter((id) => id !== branchId) : p.concat(branchId)
    )
  }

  const resetScope = () => {
    setSelectedBranchIds([])
  }

  const handleSaveAssignments = () => {
    if (!selectedRoleId || !slug || !selectedRole) return
    if (!selectedProjectId || selectedBranchIds.length === 0) return

    const current = roleAssignmentsMap[selectedRoleId] ?? []
    const next = pendingSelection

    const toAdd = next.filter((id) => !current.includes(id))
    const toRemove = current.filter((id) => !next.includes(id))

    toAdd.forEach((userId) => {
      assignRole({
        slug,
        userId,
        roleId: selectedRoleId,
        branches: selectedBranchIds,
      })
    })

    toRemove.forEach((userId) => {
      unassignRole({ slug, userId, roleId: selectedRoleId })
    })

    setIsAssignModalOpen(false)
  }

  const handleOpenAssignModal = () => {
    if (!selectedRoleId || !selectedRole) return

    const assigned = roleAssignmentsMap[selectedRoleId] ?? []
    setPendingSelection([...assigned])
    resetScope()
    setIsAssignModalOpen(true)
  }

  const canSave =
    !!selectedRole &&
    !!selectedProjectId &&
    selectedBranchIds.length > 0 &&
    pendingSelection.length > 0

  return (
    <>
      <ScaffoldFilterAndContent>
        <ScaffoldSectionContent className="w-full">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] h-[520px]">
            {/* Left: branch roles list */}
            <div className="h-full rounded-md border border-default bg-surface-100">
              <ScrollArea className="h-full">
                <RolesTable
                  isRolesLoading={isLoading}
                  roles={branchRoles}
                  selectedRoleId={selectedRoleId}
                  onSelectRole={setSelectedRoleId}
                />
              </ScrollArea>
            </div>

            {/* Right: assigned members */}
            <div className="flex h-full flex-col rounded-md border border-default bg-surface-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedRole ? `Members with ${selectedRole.name}` : 'Select a branch role'}
                  </p>
                  <p className="text-xs text-foreground-light">
                    Assign branch-scoped roles to team members across projects and branches.
                  </p>
                </div>

                <Button
                  type="default"
                  size="small"
                  icon={<UserPlus size={14} />}
                  disabled={!selectedRole}
                  onClick={handleOpenAssignModal}
                >
                  Assign role
                </Button>
              </div>

              <ScrollArea className="mt-4 flex-1">
                {selectedRole ? (
                  assignedMembers.length > 0 ? (
                    <div className="flex flex-col gap-2 pb-2">
                      {assignedMembers.map((m) => (
                        <div
                          key={m.user_id}
                          className="flex items-center justify-between rounded border border-default bg-surface-200 px-3 py-2"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {m.username || m.primary_email || m.user_id}
                            </span>
                            {m.primary_email && (
                              <span className="text-xs text-foreground-light">
                                {m.primary_email}
                              </span>
                            )}
                          </div>

                          <Button
                            type="text"
                            size="tiny"
                            className="px-1"
                            icon={<X size={14} />}
                            onClick={() => handleRemoveMember(m.user_id)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center border border-dashed border-default rounded py-10 text-sm text-foreground-light">
                      No members assigned yet.
                    </div>
                  )
                ) : (
                  <div className="flex h-full items-center justify-center border border-dashed border-default rounded py-10 text-sm text-foreground-light">
                    Select a branch role to view assignments.
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </ScaffoldSectionContent>
      </ScaffoldFilterAndContent>

      {/* Assignment modal */}
      <AssignMembersDialog
      open={isAssignModalOpen}
      onOpenChange={setIsAssignModalOpen}
      title={selectedRole ? `Assign ${selectedRole.name}` : 'Assign branch role'}
      members={allMembers}
      selectedIds={pendingSelection}
      onToggleMember={handleTogglePendingUser}
      isSaveDisabled={!canSave}
      onSave={handleSaveAssignments}
      scopeSlot={
        selectedRole && (
          <div className="flex flex-col gap-4">
            {/* Project selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-foreground-muted">Project</span>
              <Select_Shadcn_
                value={selectedProjectId}
                onValueChange={(value) => {
                  setSelectedProjectId(value)
                  setSelectedBranchIds([])
                }}
              >
                <SelectTrigger_Shadcn_ className="text-sm">
                  {orgProjects.find((p) => p.id === selectedProjectId)?.name || 'Select a project'}
                </SelectTrigger_Shadcn_>
                <SelectContent_Shadcn_>
                  <SelectGroup_Shadcn_>
                    {orgProjects.map((project) => (
                      <SelectItem_Shadcn_ key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem_Shadcn_>
                    ))}
                  </SelectGroup_Shadcn_>
                </SelectContent_Shadcn_>
              </Select_Shadcn_>
            </div>

            {/* Branches list */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-foreground-muted">Branches</span>
              <ScrollArea className="max-h-[160px] pr-1">
                <div className="flex flex-col gap-1">
                  {(branches || []).map((branch) => {
                    const isChecked = selectedBranchIds.includes(branch.id)
                    return (
                      <div
                        key={branch.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-200"
                      >
                        <Checkbox_Shadcn_
                          checked={isChecked}
                          onCheckedChange={() => handleToggleBranch(branch.id)}
                        />
                        <span className="text-sm">{branch.name}</span>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        )
      }
    />
    </>
  )
}
