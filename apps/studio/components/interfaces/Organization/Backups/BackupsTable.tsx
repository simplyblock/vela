import { PauseCircle, PlayCircle, Server } from 'lucide-react'

import { formatBytes } from 'lib/helpers'
import {
  Badge,
  Button,
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

import { getEnvironmentBadgeClass } from './constants'
import { formatBackupDate } from './utils'
import type { BackupRow } from './types'

type BackupsTableProps = {
  rows: BackupRow[]
  onDisable: (row: BackupRow) => void
  onEnable: (row: BackupRow) => void
  onViewBackups: (row: BackupRow) => void
}

export const BackupsTable = ({ rows, onDisable, onEnable, onViewBackups }: BackupsTableProps) => (
  <div className="overflow-x-auto px-6 pb-6">
    <Table>
      <TableHeader>
  <TableRow>
    <TableHead className="min-w-[200px]">Branch</TableHead>
    <TableHead className="min-w-[120px]">Environment</TableHead>
    <TableHead className="min-w-[160px]">Last Backup</TableHead>
    <TableHead className="min-w-[160px]">Next Backup</TableHead>
    <TableHead className="min-w-[120px] text-right">Total Backups</TableHead>
    <TableHead className="min-w-[140px] text-right">Storage Used</TableHead>
    <TableHead className="min-w-[140px] text-right">Actions</TableHead>
  </TableRow>
</TableHeader>

<TableBody>
  {rows.map((row) => (
    <TableRow key={row.id}>
        <TableCell>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{row.branchName}</span>
            <span className="text-xs text-foreground-light">Project: {row.projectName}</span>
          </div>
        </TableCell>

        <TableCell>
          <Badge
            className={`border ${getEnvironmentBadgeClass(row.environment)} px-2 py-0.5 text-xs font-medium`}
          >
            {row.environment}
          </Badge>
        </TableCell>

        <TableCell className="text-sm text-foreground-light">
          {formatBackupDate(row.lastBackupAt)}
        </TableCell>

        <TableCell className="text-sm text-foreground-light">
          {formatBackupDate(row.nextBackupAt)}
        </TableCell>

        <TableCell className="text-right text-sm font-medium text-foreground">
          {row.backups.length}
        </TableCell>

        <TableCell className="text-right text-sm text-foreground-light">
          {typeof row.storageUsedBytes === 'number'
            ? formatBytes(row.storageUsedBytes, 'decimal', 2)
            : '—'}
        </TableCell>

        <TableCell>
          <div className="flex justify-end gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="text"
                  className="px-1.5"
                  icon={<Server size={16} />}
                  onClick={() => onViewBackups(row)}
                />
              </TooltipTrigger>
              <TooltipContent side="top">View backups</TooltipContent>
            </Tooltip>
          </div>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>

    </Table>
  </div>
)
