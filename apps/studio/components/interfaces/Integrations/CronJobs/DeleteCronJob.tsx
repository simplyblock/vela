import { parseAsString, useQueryState } from 'nuqs'
import { toast } from 'sonner'

import { useDatabaseCronJobDeleteMutation } from 'data/database-cron-jobs/database-cron-jobs-delete-mutation'
import { CronJob } from 'data/database-cron-jobs/database-cron-jobs-infinite-query'
import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'
import TextConfirmModal from 'ui-patterns/Dialogs/TextConfirmModal'
import { useSelectedBranchQuery } from 'data/branches/selected-branch-query'

interface DeleteCronJobProps {
  cronJob: CronJob
  visible: boolean
  onClose: () => void
}

export const DeleteCronJob = ({ cronJob, visible, onClose }: DeleteCronJobProps) => {
  const { data: org } = useSelectedOrganizationQuery()
  const { data: project } = useSelectedProjectQuery()
  const { data: branch } = useSelectedBranchQuery()
  const [searchQuery] = useQueryState('search', parseAsString.withDefault(''))

  const { mutate: sendEvent } = useSendEventMutation()
  const { mutate: deleteDatabaseCronJob, isLoading } = useDatabaseCronJobDeleteMutation({
    onSuccess: () => {
      sendEvent({
        action: 'cron_job_deleted',
        groups: { project: project?.id ?? 'Unknown', organization: org?.id ?? 'Unknown', branch: branch?.id ?? 'Unknown' },
      })
      toast.success(`Successfully removed cron job ${cronJob.jobname}`)
      onClose()
    },
  })

  async function handleDelete() {
    if (!branch) return console.error('Branch is required')

    deleteDatabaseCronJob({
      branch,
      jobId: cronJob.jobid,
      searchTerm: searchQuery,
    })
  }

  if (!cronJob) {
    return null
  }

  // Cron job name is optional. If the cron job has no name, show a simplified modal which doesn't require the user to input the name.
  if (!cronJob.jobname) {
    return (
      <ConfirmationModal
        variant="destructive"
        visible={visible}
        onCancel={() => onClose()}
        onConfirm={handleDelete}
        title={`Delete the cron job`}
        loading={isLoading}
        confirmLabel={`Delete`}
        alert={{ title: 'You cannot recover this cron job once deleted.' }}
      />
    )
  }

  return (
    <TextConfirmModal
      variant="destructive"
      visible={visible}
      onCancel={() => onClose()}
      onConfirm={handleDelete}
      title="Delete this cron job"
      loading={isLoading}
      confirmLabel={`Delete cron job ${cronJob.jobname}`}
      confirmPlaceholder="Type in name of cron job"
      confirmString={cronJob.jobname ?? 'Unknown'}
      text={
        <>
          <span>This will delete the cron job</span>{' '}
          <span className="text-bold text-foreground">{cronJob.jobname}</span>
        </>
      }
      alert={{ title: 'You cannot recover this cron job once deleted.' }}
    />
  )
}
