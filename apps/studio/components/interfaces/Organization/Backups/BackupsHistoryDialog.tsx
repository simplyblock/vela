import { RefreshCcw, Trash2 } from 'lucide-react'

import { formatBytes } from 'lib/helpers'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from 'ui'

import { formatBackupDate } from './utils'
import type { BackupRow, BranchBackup } from './types'

type BackupsHistoryDialogProps = {
  target: BackupRow | null
  open: boolean
  isAbleToDeleteBackup?:boolean
  isAbleToCreateBranch?:boolean
  onClose: () => void
  onRestore: (backup: BranchBackup) => void
  onDeleteRequest: (backup: BranchBackup) => void
}

export const BackupsHistoryDialog = ({
  target,
  open,
  isAbleToDeleteBackup,
  isAbleToCreateBranch,
  onClose,
  onRestore,
  onDeleteRequest,
}: BackupsHistoryDialogProps) => (
  <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
    <DialogContent size="xxlarge">
      <DialogHeader>
        <DialogTitle>Backups for {target?.projectName ?? 'branch'}</DialogTitle>
        <DialogDescription>
          {target
            ? `Branch ${target.branchName} · ${target.backups.length} backup${
                target.backups.length === 1 ? '' : 's'
              } available`
            : ''}
        </DialogDescription>
      </DialogHeader>

      {target && target.backups.length > 0 ? (
        <div className="overflow-x-auto py-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Backup ID</TableHead>
                <TableHead className="min-w-[140px]">Created</TableHead>
                <TableHead className="min-w-[120px]">Size</TableHead>
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="min-w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {target.backups.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell>
                    <p className="font-mono text-xs text-foreground" title={backup.id}>
                      {backup.id}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-foreground-light">
                    {formatBackupDate(backup.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-foreground-light">
                    {typeof backup.sizeBytes === 'number'
                      ? formatBytes(backup.sizeBytes, 'decimal', 2)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {backup.status ? (
                      (() => {
                        const normalized = backup.status.toLowerCase()
                        const isCompleted = normalized === 'completed'
                        return (
                          <Badge
                            variant={isCompleted ? 'default' : 'outline'}
                            className={`capitalize ${
                              isCompleted ? '' : 'text-warning-700 border-warning-500/60'
                            }`}
                          >
                            {normalized}
                          </Badge>
                        )
                      })()
                    ) : (
                      <span className="text-sm text-foreground-light">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      {isAbleToCreateBranch && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="text"
                            className="px-1.5"
                            icon={<RefreshCcw size={16} />}
                            onClick={() => onRestore(backup)}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">Restore</TooltipContent>
                      </Tooltip>
                    )}
                      {isAbleToDeleteBackup && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="text"
                            className="px-1.5 text-destructive hover:text-destructive"
                            icon={<Trash2 size={16} />}
                            onClick={() => onDeleteRequest(backup)}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">Delete backup</TooltipContent>
                      </Tooltip>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-foreground-light">
          No backups available for this branch.
        </div>
      )}
    </DialogContent>
  </Dialog>
)
