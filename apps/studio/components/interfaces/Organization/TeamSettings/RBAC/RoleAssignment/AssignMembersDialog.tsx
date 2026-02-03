import { type ReactNode } from 'react'
import { type Member } from 'data/organizations/organization-members-query'
import {
  Button,
  Checkbox_Shadcn_,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogTitle,
  ScrollArea,
} from 'ui'

type AssignMembersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  members: Member[]
  selectedIds: string[]
  onToggleMember: (userId: string) => void
  onSave: () => void
  isSaveDisabled?: boolean
  isSaving?: boolean 
  scopeSlot?: ReactNode
}

export const AssignMembersDialog = ({
  open,
  onOpenChange,
  title,
  members,
  selectedIds,
  onToggleMember,
  onSave,
  isSaveDisabled,
  isSaving = false, 
  scopeSlot,
}: AssignMembersDialogProps) => {
  const hasMembers = members.length > 0
  const saveDisabled = Boolean(isSaveDisabled || isSaving)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="medium">
        <DialogHeader className="border-b">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <DialogSection className="pt-4 flex flex-col gap-6">
          <div>
            <p className="mb-2 text-xs uppercase font-medium text-foreground-muted">Members</p>

            {hasMembers ? (
              <ScrollArea className="max-h-[220px] pr-1">
                <div className="flex flex-col gap-1">
                  {members.map((m) => {
                    const id = m.user_id
                    if (!id) return null
                    const isSelected = selectedIds.includes(id)

                    return (
                      <label
                        key={id}
                        htmlFor={`member-${id}`}
                        className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-200 cursor-pointer"
                      >
                        <Checkbox_Shadcn_
                          id={`member-${id}`}
                          checked={isSelected}
                          onCheckedChange={() => onToggleMember(id)}
                          disabled={isSaving} 
                          onClick={(e) => e.stopPropagation()} // Prevent double toggle
                        />
                        <div className="flex-1">
                          <p className="text-sm">{m.username || m.primary_email || id}</p>
                          {m.primary_email && (
                            <p className="text-xs text-foreground-light">{m.primary_email}</p>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-[120px] items-center justify-center rounded border border-dashed border-default px-3 text-xs text-foreground-light text-center">
                No members available to assign.
              </div>
            )}
          </div>

          {scopeSlot}
        </DialogSection>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="default" disabled={isSaving}>
              Cancel
            </Button>
          </DialogClose>

          <Button
            type="primary"
            disabled={saveDisabled}
            onClick={onSave}
            loading={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}