// components/interfaces/Branch/BranchActionsMenu.tsx

import Link from 'next/link'
import { MoreVertical, Trash2, Copy, Settings, Maximize } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'ui'

import ResizeBranchModal from './ResizeBranchModal'
import type { Branch } from 'data/branches/branch-query'
import { useState } from 'react'

type Props = {
  branch: Branch
  orgSlug: string
  projectRef: string
  openAllowed: boolean

  cloneHref: string
  settingsHref: string

  onRequestDelete: (id: string, name: string) => void

  isAbleToResizeBranches?: boolean
  isAbleToDeleteBranches?: boolean
}

export const BranchActionsMenu = ({
  branch,
  orgSlug,
  projectRef,
  openAllowed,
  cloneHref,
  settingsHref,
  onRequestDelete,
  isAbleToResizeBranches = true,
  isAbleToDeleteBranches = true,
}: Props) => {
    const [resizeOpen, setResizeOpen] = useState(false)
  return (
    <>   
        <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button type="text" size="tiny" icon={<MoreVertical size={16} />} />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-44">

            {isAbleToResizeBranches && (
            <DropdownMenuItem
                disabled={!openAllowed}
                onSelect={(e) => {
                e.preventDefault()
                setResizeOpen(true)
                }}
                className='cursor-pointer'
            >
                <Maximize size={14} className="mr-2" />
                Resize
            </DropdownMenuItem>
            )}

            <DropdownMenuItem asChild className='cursor-pointer'>
            <Link href={cloneHref} className="flex items-center gap-2">
                <Copy size={14} />
                Clone
            </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className='cursor-pointer'>
            <Link href={settingsHref} className="flex items-center gap-2">
                <Settings size={14} />
                Settings
            </Link>
            </DropdownMenuItem>

            {isAbleToDeleteBranches && (
            <DropdownMenuItem
                className="text-redA-1100 cursor-pointer"
                onClick={() =>
                onRequestDelete(branch.id, branch.name ?? branch.id)
                }
            >
                <Trash2 size={14} className="mr-2" />
                Delete
            </DropdownMenuItem>
            )}
        </DropdownMenuContent>
        </DropdownMenu>
        <ResizeBranchModal
        open={resizeOpen}
        onOpenChange={setResizeOpen}
        hideTrigger
        orgSlug={orgSlug}
        projectRef={projectRef}
        branchId={branch.id}
        branchMax={branch.max_resources}
        ramUsageBytes={branch?.used_resources?.ram_bytes ?? 0}
        />
    </>
    
  )
}