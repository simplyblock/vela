import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout/ProjectLayout'
import { NextPageWithLayout } from 'types'
import { ScaffoldContainer } from 'components/layouts/Scaffold'
import { Button, Card, Input_Shadcn_, cn } from 'ui'
import { getPathReferences } from 'data/vela/path-references'
import { useProjectUpdateMutation } from 'data/projects/project-update-mutation'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { DeleteProjectPanel } from 'components/interfaces/Settings/General/DeleteProjectPanel/DeleteProjectPanel'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'

const ProjectBackupsPage: NextPageWithLayout = () => {
  const {can: canUpdateBackupsCount,isSuccess: isProjectPermissionSuccess} = useCheckPermissions("project:settings:write")
  const {can: canDeleteProject, isSuccess: isDeletePermissionSuccess} = useCheckPermissions("env:projects:delete")

  const isAbleToEditSettings = isProjectPermissionSuccess && canUpdateBackupsCount
  const isAbleToDeleteProject = isDeletePermissionSuccess && canDeleteProject
  const { slug, ref } = getPathReferences()

  const { data: project } = useSelectedProjectQuery()

  const currentVal = project?.max_backups ?? null // null/undefined => unlimited
  const currentName = project?.name ?? ''

  const [input, setInput] = useState<string>(currentVal == null ? '' : String(currentVal))
  const [projectNameInput, setProjectNameInput] = useState<string>(currentName)

  const parsed = useMemo(() => {
    const trimmed = input.trim()
    if (trimmed === '') return { ok: true, value: null } // empty means unlimited
    const asNum = Number(trimmed)
    if (!Number.isFinite(asNum) || !Number.isInteger(asNum) || asNum < 0) {
      return { ok: false, error: 'Must be a non-negative integer' }
    }
    return { ok: true, value: asNum }
  }, [input])

  useEffect(() => {
    setInput(currentVal == null ? '' : String(currentVal))
    setProjectNameInput(currentName)
  }, [currentVal, currentName])

  const parsedProjectName = useMemo(() => {
    const trimmed = projectNameInput.trim()
    if (trimmed.length < 1) return { ok: false, error: 'Project name is required' }
    if (trimmed.length < 3) return { ok: false, error: 'Project name must be at least 3 characters long' }
    if (trimmed.length > 64) return { ok: false, error: 'Project name must be no longer than 64 characters' }
    return { ok: true, value: trimmed }
  }, [projectNameInput])

  const updateMutation = useProjectUpdateMutation({
    onSuccess: () => {
      toast.success('Project settings updated')
    },
  })

  const onSave = () => {
    if (!slug || !ref) return
    if (!parsed.ok) {
      toast.error((parsed as any).error || 'Invalid value')
      return
    }
    if (!parsedProjectName.ok) {
      toast.error((parsedProjectName as any).error || 'Invalid project name')
      return
    }
    if (!parsedProjectName.value) {
      toast.error('Project name is required')
      return
    }

    updateMutation.mutate({
      orgRef: slug,
      ref,
      name: parsedProjectName.value,
      max_backups: parsed.value as any,
    })
  }

  const onCancel = () => {
    setInput(currentVal == null ? '' : String(currentVal))
    setProjectNameInput(currentName)
  }

  const isDirty = projectNameInput !== currentName || input !== (currentVal == null ? '' : String(currentVal))
  const loading = updateMutation.isLoading

  return (
    <ScaffoldContainer className='space-y-10 p-4'>
      <div className="space-y-6 p-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Project settings</h1>
          <p className="text-sm text-foreground-light">Manage project name and backup retention for this project.</p>
        </div>

        <Card className="p-0">
          <div className="flex flex-col gap-2 border-b border-border px-6 py-4">
            <div>
              <h2 className="text-base font-medium text-foreground">Project name</h2>
              <p className="text-sm text-foreground-light">
                Rename this project.
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6 border-b border-border">
            <div className="space-y-1">
              <label className="text-xs text-foreground-muted">Project name</label>
              <Input_Shadcn_
                value={projectNameInput}
                onChange={(e) => {
                  setProjectNameInput(e.target.value)
                }}
                className={cn(
                  'h-10 text-sm w-full sm:w-[320px]',
                  !parsedProjectName.ok ? 'border-red-600 ring-1 ring-red-600' : ''
                )}
                autoComplete="off"
                disabled={!isAbleToEditSettings || loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSave()
                  }
                }}
              />
              {!parsedProjectName.ok ? <p className="text-[11px] text-red-600">{(parsedProjectName as any).error}</p> : null}

              <p className="text-[12px] text-foreground-muted mt-1">
                Current: {currentName || '-'}
              </p>
            </div>

          </div>

          <div className="flex flex-col gap-2 border-b border-border px-6 py-4">
            <div>
              <h2 className="text-base font-medium text-foreground">Max backups</h2>
              <p className="text-sm text-foreground-light">
                Enter a non-negative integer
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6">
            <div className="space-y-1">
              <label className="text-xs text-foreground-muted">Max backups</label>
              <Input_Shadcn_
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                }}
                placeholder="Leave empty for unlimited"
                className={cn('h-10 text-sm w-full sm:w-[320px]', !parsed.ok ? 'border-red-600 ring-1 ring-red-600' : '')}
                type="number"
                inputMode="numeric"
                autoComplete="off"
                disabled={!isAbleToEditSettings || loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSave()
                  }
                }}
              />
              {!parsed.ok ? <p className="text-[11px] text-red-600">{(parsed as any).error}</p> : null}

              <p className="text-[12px] text-foreground-muted mt-1">
                Current: {currentVal == null ? 'Unlimited' : currentVal}
              </p>
            </div>

            {isAbleToEditSettings && (
              <div className="flex items-center gap-2 pt-2">
              <Button type="default" onClick={onCancel} disabled={!isDirty || loading}>
                Cancel
              </Button>
              <Button
                type="primary"
                onClick={onSave}
                loading={loading}
                disabled={!isDirty || !parsed.ok || !parsedProjectName.ok || loading}
              >
                Save project settings
              </Button>
            </div>
            )}
          </div>
        </Card>
      </div>
      <div>
         {isAbleToDeleteProject && <DeleteProjectPanel /> }
      </div>
     
    </ScaffoldContainer>
  )
}

/* Layout wrappers to keep consistency across the app */
ProjectBackupsPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth>{page}</ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectBackupsPage
