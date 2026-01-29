// components/interfaces/Branch/BranchCard.tsx
import Link from 'next/link'
import { Play, Pause, Trash2, AlertTriangle } from 'lucide-react'
import type { Branch } from 'data/branches/branch-query'
import { Button, cn } from 'ui'
import { TimestampInfo } from 'ui-patterns'
import BranchStatusBadge from 'components/interfaces/Branch/BranchStatusBadge'
import BranchEnvBadge from 'components/interfaces/Branch/BranchEnvBadge'
import { BranchResourceBadge } from 'components/interfaces/Branch/BranchResourceBadge'
import ResizeBranchModal from 'components/interfaces/Branch/ResizeBranchModal'

// You can keep these helpers local to this file – they’re only used for rendering
const ACTIVE_STATUSES = ['ACTIVE_HEALTHY', 'ACTIVE_UNHEALTHY', 'UNKNOWN']
const STOPPED_STATUS = ['STOPPED']
const TRANSITIONAL_STATUSES = [
  'STARTING',
  'CREATING',
  'DELETING',
  'UPDATING',
  'RESTARTING',
  'STOPPING',
]
const ERROR_STATUSES = ['ERROR']

const isStatusActive = (s?: string) => !!s && ACTIVE_STATUSES.includes(s)
const isStatusStopped = (s?: string) => !!s && STOPPED_STATUS.includes(s)
const isStatusTransitional = (s?: string) => !!s && TRANSITIONAL_STATUSES.includes(s)
const isStatusError = (s?: string) => !!s && ERROR_STATUSES.includes(s)

export type BranchCardProps = {
  branch: Branch
  orgSlug: string
  projectRef: string
  togglingId: string | null
  deletingId: string | null
  isAbleToDeleteBranches?: boolean;
  isAbleToResizeBranches?: boolean;
  isAbleToRestartBranches?: boolean;
  onToggleBranch: (branch: Branch) => void
  onRequestDelete: (id: string, name: string) => void
}

export const BranchCard = ({
  branch,
  orgSlug,
  projectRef,
  togglingId,
  deletingId,
  isAbleToDeleteBranches = true,
  isAbleToResizeBranches = true,
  isAbleToRestartBranches = true,
  onToggleBranch,
  onRequestDelete,
}: BranchCardProps) => {
  const status = branch.status
  const toggling = togglingId === branch.id
  const deleting = deletingId === branch.id

  // Action button variants
  let ActionButton: React.ReactNode = null

  if (isStatusTransitional(status)) {
    ActionButton = (
      <Button size="tiny" type="default" disabled>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-muted animate-spin" />
          <span className="text-xs">Working…</span>
        </span>
      </Button>
    )
  } else if (isStatusActive(status)) {
    ActionButton = (
      <Button
        size="tiny"
        type="default"
        onClick={() => onToggleBranch(branch)}
        disabled={toggling || deleting}
        loading={toggling}
        aria-label={`Stop branch ${branch.name ?? branch.id}`}
      >
        <span className="inline-flex items-center gap-1">
          <Pause size={14} /> Stop
        </span>
      </Button>
    )
  } else if (isStatusStopped(status)) {
    ActionButton = (
      <Button
        size="tiny"
        type="default"
        onClick={() => onToggleBranch(branch)}
        disabled={toggling || deleting}
        loading={toggling}
        aria-label={`Start branch ${branch.name ?? branch.id}`}
      >
        <span className="inline-flex items-center gap-1">
          <Play size={14} /> Start
        </span>
      </Button>
    )
  } else if (isStatusError(status)) {
    ActionButton = (
      <Button size="tiny" type="default" disabled className="text-yellow-600">
        <span className="inline-flex items-center gap-1">
          <AlertTriangle size={14} /> Issue
        </span>
      </Button>
    )
  } else {
    // fallback: disabled
    ActionButton = (
      <Button size="tiny" type="default" disabled>
        N/A
      </Button>
    )
  }

  const openAllowed = 
  isStatusActive(status) 
  && branch.status !== 'RESIZING' 

  return (
    <li
      className={cn(
        'rounded border border-default bg-surface-100 p-4 flex flex-col justify-between'
      )}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-foreground font-medium flex items-center gap-3">
              <span className="truncate">{branch.name}</span>
            </p>

            <p className="text-xs text-foreground-light font-mono break-all">{branch.id}</p>

            {branch.created_at && (
              <div className="text-xs text-foreground-lighter">
                Created{' '}
                <TimestampInfo
                  utcTimestamp={branch.created_at}
                  displayAs="local"
                  labelFormat="DD MMM HH:mm"
                  format="YYYY-MM-DD HH:mm:ss"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col items-end ml-3 shrink-0 space-y-2">
            <div>
              <BranchStatusBadge status={branch.status} />
            </div>

            <div>
              <BranchResourceBadge
                max_resources={branch.max_resources}
                used_resources={branch.used_resources}
                size={40}
              />
            </div>
          </div>
        </div>

        <div className="mt-1">
          <BranchEnvBadge env={(branch as any).env_type} size="sm" />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        {isAbleToRestartBranches && ActionButton}

        {isAbleToDeleteBranches && (
          <Button
          size="tiny"
          type="default"
          className="text-redA-1100 hover:bg-redA-400"
          onClick={() => onRequestDelete(branch.id, branch.name ?? branch.id)}
          disabled={toggling || deleting}
          aria-label={`Delete branch ${branch.name ?? branch.id}`}
        >
          <span className="inline-flex items-center gap-1">
            <Trash2 size={14} /> Delete
          </span>
        </Button>
        )}

        {isAbleToResizeBranches && (
          <ResizeBranchModal
          isDisabled={!openAllowed}
          orgSlug={orgSlug}
          projectRef={projectRef}
          branchId={branch.id}
          branchMax={branch.max_resources}
          triggerClassName="!ml-auto"
          ramUsageBytes={branch?.used_resources?.ram_bytes ?? 0}
        />
        )}
      </div>

      <div className="pt-3">
        <Button asChild size="tiny" type="default" block disabled={!openAllowed}>
          <Link href={`/org/${orgSlug}/project/${projectRef}/branch/${branch.id}`}>
            Open branch
          </Link>
        </Button>
      </div>
    </li>
  )
}
