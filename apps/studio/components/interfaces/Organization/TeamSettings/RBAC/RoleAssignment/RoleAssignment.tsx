import { useMemo, useState } from 'react'
import { UserPlus, X } from 'lucide-react'

import {
  ScaffoldContainer,
  ScaffoldFilterAndContent,
  ScaffoldSectionContent,
  ScaffoldTitle,
} from 'components/layouts/Scaffold'
import { RolesTable } from '../Role/RolesTable'
import { useOrganizationRolesQuery } from 'data/organizations/organization-roles-query'
import { getPathReferences } from 'data/vela/path-references'
import {
  Button,
  Checkbox_Shadcn_,
  ScrollArea,
} from 'ui'
import { useOrganizationRoleAssignmentsQuery } from 'data/organization-members/organization-role-assignments-query'
import { useOrganizationMemberAssignRoleMutation } from 'data/organization-members/organization-member-role-assign-mutation'
import { useOrganizationMemberUnassignRoleMutation } from 'data/organization-members/organization-member-role-unassign-mutation'
import { Member, useOrganizationMembersQuery } from 'data/organizations/organization-members-query'
import { AssignMembersDialog } from './AssignMembersDialog'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { toast } from 'sonner'

type RoleAssignmentsMap = Record<string, {
  userId: string;
  envTypes: string[];
}[]>

export const RoleAssignment = () => {
  const { slug } = getPathReferences()
  const { can: canAssignRoles, isSuccess: isPermissionsSuccess } = useCheckPermissions("org:role-assign:admin")
  const { data: organization } = useSelectedOrganizationQuery()

  const isReadOnly = isPermissionsSuccess && !canAssignRoles;

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [pendingSelection, setPendingSelection] = useState<string[]>([])

  // Scope state for environment roles
  const [selectedEnvTypes, setSelectedEnvTypes] = useState<string[]>([])

  const { data: roles, isLoading: isLoadingRoles } = useOrganizationRolesQuery({ slug })
  const { data: roleAssignments, isLoading: isLoadingRoleAssignments } =
    useOrganizationRoleAssignmentsQuery({ slug })
  const { data: members, isLoading: isLoadingMembers } = useOrganizationMembersQuery({ slug })

  const { mutate: assignRole } = useOrganizationMemberAssignRoleMutation()
  const { mutate: unassignRole } = useOrganizationMemberUnassignRoleMutation()

  const isLoading = isLoadingRoles || isLoadingRoleAssignments || isLoadingMembers
  
  // Include both organization and environment roles
  const orgAndEnvRoles = useMemo(
    () => (roles || []).filter((role) => 
      role.role_type === 'organization' || role.role_type === 'environment'
    ),
    [roles]
  )

// Update the roleAssignmentsMap creation
const roleAssignmentsMap: RoleAssignmentsMap = useMemo(() => {
  const map: RoleAssignmentsMap = {}

  ;(roleAssignments ?? []).forEach((link) => {
    if (!map[link.role_id]) map[link.role_id] = []
    
    // Find existing assignment for this user
    const existing = map[link.role_id].find(a => a.userId === link.user_id)
    
    if (existing) {
      // Add environment type if it exists
      if (link.env_type && !existing.envTypes.includes(link.env_type)) {
        existing.envTypes.push(link.env_type)
      }
    } else {
      // Create new assignment
      map[link.role_id].push({
        userId: link.user_id,
        envTypes: link.env_type ? [link.env_type] : []
      })
    }
  })

  return map
}, [roleAssignments])

  const membersById = useMemo(() => {
    const map: Record<string, Member> = {}
    ;(members || []).forEach((member) => {
      if (member.user_id) {
        map[member.user_id] = member
      }
    })
    return map
  }, [members])

  const selectedRole = useMemo(
    () => orgAndEnvRoles.find((role) => role.id === selectedRoleId) ?? null,
    [orgAndEnvRoles, selectedRoleId]
  )

const assignedMembers = useMemo(() => {
  if (!selectedRoleId) return []
  const assignments = roleAssignmentsMap[selectedRoleId] ?? []
  return assignments
    .map(({ userId, envTypes }) => {
      const member = membersById[userId]
      return member ? { ...member, envTypes } : null
    })
    .filter((m): m is Member & { envTypes: string[] } => Boolean(m))
}, [selectedRoleId, roleAssignmentsMap, membersById])


  const allMembers = members || []
  const orgEnvTypes = organization?.env_types ?? []

const handleRemoveMember = (userId: string) => {
  if (!selectedRoleId || !slug || !selectedRole) return

  // For environment roles, we need to remove all environment assignments
  const assignments = roleAssignmentsMap[selectedRoleId] ?? []
  const userAssignment = assignments.find(a => a.userId === userId)
  
  if (userAssignment) {
    // Remove all assignments for this user-role combination
    userAssignment.envTypes.forEach(envType => {
      unassignRole({ 
        slug, 
        userId, 
        roleId: selectedRoleId,
      })
    })
    toast.success('Role assignment removed successfully')
  }
}

  const handleTogglePendingUser = (userId: string) => {
    setPendingSelection((p) =>
      p.includes(userId) ? p.filter((id) => id !== userId) : p.concat(userId)
    )
  }

  const handleToggleEnvType = (envType: string) => {
    setSelectedEnvTypes((p) =>
      p.includes(envType) ? p.filter((v) => v !== envType) : p.concat(envType)
    )
  }

  const resetScope = () => {
    setSelectedEnvTypes([])
  }

const handleSaveAssignments = () => {
  if (!selectedRoleId || !slug || !selectedRole) return

  const assignments = roleAssignmentsMap[selectedRoleId] ?? []
  const currentUsers = assignments.map(a => a.userId)
  const nextUsers = pendingSelection

  const toAdd = nextUsers.filter(userId => !currentUsers.includes(userId))
  const toRemove = currentUsers.filter(userId => !nextUsers.includes(userId))

  // Handle new assignments
  toAdd.forEach((userId) => {
    assignRole({
      slug,
      userId,
      roleId: selectedRoleId,
      // For environment roles, assign to all selected environment types
      env_types: selectedRole.role_type === 'environment' ? selectedEnvTypes : undefined,
    })
  })

  // Handle removals - remove all assignments for users being removed
  toRemove.forEach((userId) => {
    const userAssignment = assignments.find(a => a.userId === userId)
    if (userAssignment) {
      userAssignment.envTypes.forEach(envType => {
        unassignRole({ 
          slug, 
          userId, 
          roleId: selectedRoleId,

        })
      })
    }
  })

  // For users who stay assigned, handle environment type changes for environment roles
  if (selectedRole.role_type === 'environment') {
    const stayingUsers = nextUsers.filter(userId => currentUsers.includes(userId))
    
    stayingUsers.forEach((userId) => {
      const existingAssignment = assignments.find(a => a.userId === userId)
      if (existingAssignment) {
        const existingEnvTypes = existingAssignment.envTypes
        
        // Find environment types to add
        const envTypesToAdd = selectedEnvTypes.filter(envType => 
          !existingEnvTypes.includes(envType)
        )
        
        // Find environment types to remove
        const envTypesToRemove = existingEnvTypes.filter(envType => 
          !selectedEnvTypes.includes(envType)
        )
        
        // Add new environment types
        envTypesToAdd.forEach(envType => {
          assignRole({
            slug,
            userId,
            roleId: selectedRoleId,
            env_types: [envType],
          })
        })
        
        // Remove old environment types
        envTypesToRemove.forEach(envType => {
          unassignRole({
            slug,
            userId,
            roleId: selectedRoleId,
          })
        })
      }
    })
  }
  toast.success('Role assignments updated successfully')
  setIsAssignModalOpen(false)
  resetScope()
}

const handleOpenAssignModal = () => {
  if (!selectedRoleId || !selectedRole) return
  if (isReadOnly) return
  
  const assignments = roleAssignmentsMap[selectedRoleId] ?? []
  // For organization roles, just select the users
  // For environment roles, we need to show all users who have any assignment
  const initialSelectedUsers = assignments.map(a => a.userId)
  
  // For environment roles, also need to set the selected environment types
  if (selectedRole.role_type === 'environment') {
    // Get all unique environment types from assignments
    const allEnvTypes = assignments.flatMap(a => a.envTypes)
    const uniqueEnvTypes = [...new Set(allEnvTypes)]
    setSelectedEnvTypes(uniqueEnvTypes)
  }
  
  setPendingSelection(initialSelectedUsers)
  setIsAssignModalOpen(true)
}

  return (
    <ScaffoldContainer>
      <ScaffoldTitle>Role Assignment</ScaffoldTitle>

      <ScaffoldFilterAndContent>
        <ScaffoldSectionContent className="w-full">
          {/* Fixed height grid */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] h-[520px]">
            {/* Left: roles table */}
            <div className="h-full rounded-md border border-default bg-surface-100">
              <ScrollArea className="h-full">
                <RolesTable
                  isRolesLoading={isLoading}
                  roles={orgAndEnvRoles}
                  selectedRoleId={selectedRoleId}
                  onSelectRole={setSelectedRoleId}
                />
              </ScrollArea>
            </div>

            {/* Right: assigned users */}
            <div className="flex h-full flex-col rounded-md border border-default bg-surface-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedRole ? `Members with ${selectedRole.name}` : 'Select a role'}
                  </p>
                  <p className="text-xs text-foreground-light">
                    {selectedRole
                      ? selectedRole.role_type === 'environment' 
                        ? 'Environment roles apply to specific environment types'
                        : 'Manage who inherits the permissions granted by this role.'
                      : 'Pick a role from the table to manage its assignments.'}
                  </p>
                </div>
                {!isReadOnly && (
                  <Button
                    type="default"
                    size="small"
                    icon={<UserPlus size={14} />}
                    disabled={!selectedRole || isLoading}
                    onClick={handleOpenAssignModal}
                  >
                    {selectedRole?.role_type === 'environment' ? 'Manage assignments' : 'Add members'}
                  </Button>
                )}
              </div>

              <ScrollArea className="mt-4 flex-1">
                {selectedRole ? (
                  assignedMembers.length > 0 ? (
                    <div className="flex flex-col gap-2 pb-2">
                      {assignedMembers.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex items-center justify-between rounded border border-default bg-surface-200 px-3 py-2"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {member.username || member.primary_email || member.user_id}
                            </span>
                            {member.primary_email && (
                              <span className="text-xs text-foreground-light">
                                {member.primary_email}
                              </span>
                            )}
                            {selectedRole && selectedRole.role_type === 'environment' && (
                              <div className="mt-1">
                                <span className="text-xs text-foreground-muted">
                                  Environment types: {assignedMembers
                                    .find(m => m.user_id === member.user_id)
                                    ?.envTypes?.join(', ') || 'None'}
                                </span>
                              </div>
                            )}
                          </div>
                          {!isReadOnly && (
                            <Button
                              type="text"
                              size="tiny"
                              className="px-1"
                              icon={<X size={14} />}
                              onClick={() => handleRemoveMember(member.user_id)}
                              aria-label={`Remove ${member.username || member.primary_email}`}
                            />
                          )}
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
                    Select a role to view assignments.
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </ScaffoldSectionContent>
      </ScaffoldFilterAndContent>

      <AssignMembersDialog
        open={isAssignModalOpen}
        onOpenChange={(open) => {
          setIsAssignModalOpen(open)
          if (!open) {
            resetScope()
          }
        }}
        title={selectedRole ? `Assign ${selectedRole.name}` : 'Assign role'}
        members={allMembers}
        selectedIds={pendingSelection}
        onToggleMember={handleTogglePendingUser}
        isSaveDisabled={
          !selectedRole || 
          pendingSelection.length === 0 || 
          (selectedRole?.role_type === 'environment' && selectedEnvTypes.length === 0)
        }
        onSave={handleSaveAssignments}
        scopeSlot={
          selectedRole && selectedRole.role_type === 'environment' ? (
            <div>
              <p className="mb-2 text-xs uppercase font-medium text-foreground-muted">Environment Types</p>
              <ScrollArea className="max-h-[160px] pr-1">
                <div className="flex flex-col gap-1">
                  {orgEnvTypes.map((env) => {
                    const isChecked = selectedEnvTypes.includes(env)
                    return (
                      <label
                        key={env}
                        htmlFor={`env-${env}`}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-surface-200 cursor-pointer rounded-md"
                      >
                        <Checkbox_Shadcn_
                          id={`env-${env}`}
                          checked={isChecked}
                          onCheckedChange={() => handleToggleEnvType(env)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-sm">{env}</span>
                      </label>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          ) : null
        }
      />
    </ScaffoldContainer>
  )
}