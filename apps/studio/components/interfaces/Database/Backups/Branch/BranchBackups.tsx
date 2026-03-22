import { useMemo, useState } from 'react'
import { Loader2, RefreshCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import DatabaseBackupsNav from '../DatabaseBackupsNav'
import { BackupsEmpty } from '../BackupsEmpty'
import { BackupsStorageAlert } from '../BackupsStorageAlert'
import { FormHeader } from 'components/ui/Forms/FormHeader'
import { ScaffoldContainer, ScaffoldSection } from 'components/layouts/Scaffold'
import AlertError from 'components/ui/AlertError'
import { GenericSkeletonLoader } from 'components/ui/ShimmeringLoader'
import { useBranchBackupQuery } from 'data/backups/branch-backups-query'
import { useManualBranchBackupMutation } from 'data/backups/branch-manual-backup-mutation'
import { useDeleteBranchBackupMutation } from 'data/backups/branch-delete-backup-mutation'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { useParams } from 'common'
import { formatBytes } from 'lib/helpers'
import { RestoreBackupDialog } from 'components/interfaces/Organization/Backups/RestoreBackupDialog'
import type {
  BackupRow,
  BranchBackup as OrgBranchBackup,
} from 'components/interfaces/Organization/Backups/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'ui'
import { TimestampInfo } from 'ui-patterns'
import { useProjectsByPermissionsQuery } from 'data/permissions/projects-by-permissions-query'
import { useBranchCreateMutation } from 'data/branches/branch-create-mutation'
import { useRouter } from 'next/router'

type NormalizedBackup = {
  id: string
  createdAt: string | null
  sizeBytes?: number | null
  status?: string | null
  rowIndex?: number | null
}

const toArray = <T,>(value: T | T[] | undefined | null) =>
  Array.isArray(value) ? value : value ? [value] : []

const normalizeBackups = (data: any): NormalizedBackup[] => {
  const backups = toArray<any>(data)
  return backups
    .map((item) => {
      const createdAt =
        (item?.created_at as string | undefined) ?? (item?.createdAt as string | undefined) ?? null

      return {
        id: String(item?.id ?? ''),
        createdAt,
        sizeBytes:
          (item?.size_bytes as number | undefined) ??
          (item?.sizeBytes as number | undefined) ??
          null,
        status: (item?.status as string | undefined) ?? (item?.state as string | undefined) ?? null,
        rowIndex:
          (item?.row_index as number | undefined) ?? (item?.rowIndex as number | undefined) ?? null,
      }
    })
    .filter((item) => item.id.length > 0)
    .sort((a, b) => {
      const left = a.createdAt ? Date.parse(a.createdAt) : 0
      const right = b.createdAt ? Date.parse(b.createdAt) : 0
      return right - left
    })
}

const BranchBackups = () => {
  const router = useRouter()

  const { slug: orgId, ref: projectId, branch: branchId } = useParams()
  const { data: project } = useSelectedProjectQuery()

  const { data, error, isError, isLoading, isFetching } = useBranchBackupQuery(
    { orgId, projectId, branchId },
    { enabled: Boolean(orgId && projectId && branchId) }
  )

  // filter by projects available for creating branches
  const { data: targetProjects } = useProjectsByPermissionsQuery('project:branches:create')
  const projectOptions = useMemo(() => {
    return targetProjects
      .filter((project) => project.organization_id === orgId)
      .map((project) => ({
        label: project.name,
        value: project.id,
      }))
  }, [targetProjects])

  const backups = useMemo(() => normalizeBackups(data), [data])
  const [restoreTarget, setRestoreTarget] = useState<NormalizedBackup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NormalizedBackup | null>(null)

  const { mutate: triggerManual, isLoading: isCreating } = useManualBranchBackupMutation({
    onSuccess: () => {
      toast.success('Manual backup started')
    },
  })

  const { mutateAsync: deleteBackup, isLoading: isDeleting } = useDeleteBranchBackupMutation({
    onSuccess: () => {
      toast.success('Backup deleted')
      setDeleteTarget(null)
    },
  })

  const { mutateAsync: restoreBackup, isLoading: isRestoring } = useBranchCreateMutation({
    onSuccess: () => {
      toast.success('Restore request submitted')
      setRestoreTarget(null)
      router.push(`/org/${orgId}/project/${projectId}`)
    },
  })

  const handleCreateBackup = () => {
    if (!orgId || !projectId || !branchId) return
    triggerManual({ orgId, projectId, branchId })
  }

  const restoreRow: BackupRow | null = useMemo(() => {
    if (!restoreTarget) return null
    const projectRef = project?.id ?? projectId ?? ''
    return {
      id: branchId ?? '',
      projectId: projectRef,
      projectName: project?.name ?? projectRef,
      branchId: branchId ?? '',
      branchName: branchId ?? '',
      environment: 'all',
      lastBackupAt: restoreTarget.createdAt ?? null,
      nextBackupAt: null,
      storageUsedBytes: restoreTarget.sizeBytes ?? null,
      autoBackupEnabled: true,
      resources: null,
      schedule: [],
      backups: [],
    } as BackupRow
  }, [restoreTarget, branchId, project, projectId])

  const backupToRestore: OrgBranchBackup | null = useMemo(() => {
    if (!restoreTarget) return null
    return {
      id: restoreTarget.id,
      createdAt: restoreTarget.createdAt ?? null,
      sizeBytes: restoreTarget.sizeBytes ?? null,
      status: restoreTarget.status ?? 'completed',
    } as OrgBranchBackup
  }, [restoreTarget])

  const handleRestoreConfirm = (payload: {
    mode: 'same-branch' | 'new-branch'
    project?: string
    branchName?: string
  }) => {
    if (!restoreTarget) return
    if (!orgId || !projectId) return
    return restoreBackup({
      orgRef: orgId,
      projectRef: projectId,
      backupRef: restoreTarget.id,
      branchName: payload.branchName!,
      withConfig: true,
    })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !orgId || !projectId || !branchId || isDeleting) return
    try {
      await deleteBackup({ orgId, projectId, branchId, backupId: deleteTarget.id })
    } catch (error) {
      // errors handled in mutation
    }
  }

  return (
    <ScaffoldContainer>
      <ScaffoldSection>
        <div className="col-span-12">
          <div className="space-y-6">
            <FormHeader className="!mb-0" title="Database Backups" />
            <DatabaseBackupsNav active="pitr" />

            {isError ? (
              <AlertError subject="Failed to load backups" error={error} />
            ) : (
              <>
                <BackupsStorageAlert />
                <Card>
                  <CardHeader className="flex flex-row justify-between gap-3">
                    <div>
                      <CardTitle>Backup history</CardTitle>
                      <p className="text-sm text-foreground-light">
                        Review available snapshots and create manual backups for this branch.
                      </p>
                    </div>
                    <Button
                      type="outline"
                      onClick={handleCreateBackup}
                      disabled={isCreating || !orgId || !projectId || !branchId}
                    >
                      <div className="flex flex-row items-center gap-2">
                        {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                        <span>Start manual backup</span>
                      </div>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <GenericSkeletonLoader />
                    ) : backups.length === 0 ? (
                      <BackupsEmpty />
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[180px]">Created</TableHead>
                              <TableHead className="min-w-[140px]">Backup ID</TableHead>
                              <TableHead className="min-w-[120px]">Status</TableHead>
                              <TableHead className="min-w-[120px] text-right">Size</TableHead>
                              <TableHead className="min-w-[120px] text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {backups.map((backup) => {
                              const normalizedStatus = backup.status
                                ? backup.status.toLowerCase()
                                : undefined

                              return (
                                <TableRow key={backup.id}>
                                  <TableCell className="text-sm text-foreground-light">
                                    {backup.createdAt ? (
                                      <TimestampInfo utcTimestamp={backup.createdAt} />
                                    ) : (
                                      'Unknown'
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <span
                                      className="font-mono text-xs text-foreground"
                                      title={backup.id}
                                    >
                                      {backup.id}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    {normalizedStatus ? (
                                      <Badge
                                        variant={
                                          normalizedStatus === 'completed' ? 'default' : 'outline'
                                        }
                                      >
                                        {normalizedStatus}
                                      </Badge>
                                    ) : (
                                      <span className="text-sm text-foreground-light">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-foreground-light">
                                    {typeof backup.sizeBytes === 'number'
                                      ? formatBytes(backup.sizeBytes, 'decimal', 2)
                                      : '—'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1.5">
                                      <Button
                                        type="text"
                                        className="px-1.5"
                                        icon={<RefreshCcw size={16} />}
                                        onClick={() => setRestoreTarget(backup)}
                                      />
                                      <Button
                                        type="text"
                                        className="px-1.5 text-destructive hover:text-destructive"
                                        icon={<Trash2 size={16} />}
                                        onClick={() => setDeleteTarget(backup)}
                                      />
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {!isLoading && isFetching && (
                  <div className="flex items-center gap-2 text-sm text-foreground-light">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Refreshing backups…
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </ScaffoldSection>
      <RestoreBackupDialog
        row={restoreRow}
        backup={backupToRestore}
        open={restoreTarget !== null}
        projectOptions={projectOptions}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={handleRestoreConfirm}
      />
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => !nextOpen && !isDeleting && setDeleteTarget(null)}
      >
        <DialogContent size="xlarge">
          <DialogHeader>
            <DialogTitle>Delete backup</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Remove backup ${deleteTarget.id} from ${project?.name ?? projectId ?? 'project'}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-2 text-sm text-foreground-light">
            <p>This action permanently removes the selected snapshot and cannot be undone.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="default" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button type="danger" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete backup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScaffoldContainer>
  )
}

export default BranchBackups
