import { useEffect, useState } from 'react'
import { formatBytes } from 'lib/helpers'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input_Shadcn_,
  Label_Shadcn_,
  RadioGroupStacked,
  RadioGroupStackedItem,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
} from 'ui'

import { formatBackupDate } from './utils'
import type { BackupRow, BranchBackup } from './types'

type RestoreMode = 'same-branch' | 'new-branch'

type RestoreBackupDialogProps = {
  row: BackupRow | null
  backup: BranchBackup | null
  open: boolean
  projectOptions: { label: string; value: string }[]
  onCancel: () => void
  onConfirm: (payload: { mode: RestoreMode; project?: string; branchName?: string }) => void
}

export const RestoreBackupDialog = ({
  row,
  backup,
  open,
  projectOptions,
  onCancel,
  onConfirm,
}: RestoreBackupDialogProps) => {
  const [mode, setMode] = useState<RestoreMode>('new-branch')
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined)
  const [branchName, setBranchName] = useState<string>('')
  const [isRestoring, setIsRestoring] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('new-branch')
    setSelectedProject(undefined)
    setBranchName(`Restored ${row?.branchName ?? ''}`)
  }, [open, row])

  const canConfirm =
    mode === 'same-branch' ||
    (mode === 'new-branch' && !!selectedProject && branchName.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent size={'xlarge'}>
        <DialogHeader>
          <DialogTitle>Restore backup</DialogTitle>
          <DialogDescription>
            {row && backup
              ? `Restore ${backup.id} (${formatBytes(backup.sizeBytes, 'decimal', 2)})`
              : 'Select a backup to restore.'}
          </DialogDescription>
        </DialogHeader>

        {row && backup && (
          <div className="space-y-5 py-2">
            <div className="rounded-md border border-dashed border-border p-3 text-sm text-foreground-light">
              <p>
                Backup captured on{' '}
                <span className="font-medium text-foreground">
                  {formatBackupDate(backup.createdAt)}
                </span>
              </p>
              <p>
                Source branch:{' '}
                <span className="font-medium text-foreground">
                  {row.projectName} / {row.branchName}
                </span>
              </p>
            </div>

            <div className="space-y-3 p-3">
              <Label_Shadcn_ className="text-xs text-foreground-light uppercase tracking-wide">
                Restore target
              </Label_Shadcn_>
              <RadioGroupStacked
                value={mode}
                onValueChange={(value) => setMode(value as RestoreMode)}
              >
                {/** FIXME: @Ebrahim @Chris Disabled for now, as the backend cannot do it **/}
                <RadioGroupStackedItem
                  value="same-branch"
                  label="Restore to current branch (coming soon)"
                  disabled={true}
                >
                  <p className="text-sm text-foreground-light">
                    Apply the backup to <strong>{row.branchName}</strong> within{' '}
                    <strong>{row.projectName}</strong>.
                  </p>
                </RadioGroupStackedItem>
                <RadioGroupStackedItem value="new-branch" label="Restore to a new branch">
                  <p className="text-sm text-foreground-light">
                    Choose another project and branch name to create a new environment from this
                    backup.
                  </p>
                </RadioGroupStackedItem>
              </RadioGroupStacked>
            </div>

            {mode === 'new-branch' && (
              <div className="grid grid-cols-1 gap-4 p-2">
                <div>
                  <Label_Shadcn_ className="text-xs text-foreground-light">
                    Target project
                  </Label_Shadcn_>
                  <Select_Shadcn_
                    value={selectedProject}
                    onValueChange={(value) => setSelectedProject(value)}
                  >
                    <SelectTrigger_Shadcn_>
                      <SelectValue_Shadcn_ placeholder="Select project" />
                    </SelectTrigger_Shadcn_>
                    <SelectContent_Shadcn_>
                      {projectOptions.map((option) => (
                        <SelectItem_Shadcn_ key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem_Shadcn_>
                      ))}
                    </SelectContent_Shadcn_>
                  </Select_Shadcn_>
                </div>

                <div>
                  <Label_Shadcn_ className="text-xs text-foreground-light">
                    New branch name
                  </Label_Shadcn_>
                  <Input_Shadcn_
                    value={branchName}
                    placeholder="Enter branch name"
                    onChange={(event) => setBranchName(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="primary"
            disabled={!canConfirm || !row || !backup || isRestoring}
            onClick={() => {
              setIsRestoring(true)
              onConfirm({
                mode,
                project: mode === 'new-branch' ? selectedProject : undefined,
                branchName: mode === 'new-branch' ? branchName.trim() : undefined,
              })
            }}
          >
            Restore backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
