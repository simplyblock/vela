import { useParams } from 'common'
import { useState } from 'react'

import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { Header } from './Header'
import MessagesTable from './MessagesTable'
import { SendMessageModal } from './SendMessageModal'
import { RealtimeConfig, useRealtimeMessages } from './useRealtimeMessages'

/**
 * Acts as a container component for the entire log display
 */
export const RealtimeInspector = () => {
  const { slug: orgRef, ref: projectRef, branch: branchRef } = useParams()
  const { data: org } = useSelectedOrganizationQuery()

  const [sendMessageShown, setSendMessageShown] = useState(false)
  const [realtimeConfig, setRealtimeConfig] = useState<RealtimeConfig>({
    enabled: false,
    orgRef: orgRef!,
    projectRef: projectRef!,
    channelName: '',
    logLevel: 'info',
    token: '', // will be filled out by RealtimeTokensPopover
    schema: 'public',
    table: '*',
    isChannelPrivate: false,
    filter: undefined,
    bearer: null,
    enablePresence: true,
    enableDbChanges: true,
    enableBroadcast: true,
  })

  const { mutate: sendEvent } = useSendEventMutation()
  const { logData, sendMessage } = useRealtimeMessages(realtimeConfig, setRealtimeConfig)

  return (
    <div className="flex flex-col grow h-full">
      <Header config={realtimeConfig} onChangeConfig={setRealtimeConfig} />
      <div className="relative flex flex-col grow">
        <div className="flex grow">
          <MessagesTable
            hasChannelSet={realtimeConfig.channelName.length > 0}
            enabled={realtimeConfig.enabled}
            data={logData}
            showSendMessage={() => setSendMessageShown(true)}
          />
        </div>
      </div>
      <SendMessageModal
        visible={sendMessageShown}
        onSelectCancel={() => setSendMessageShown(false)}
        onSelectConfirm={(v) => {
          sendEvent({
            action: 'realtime_inspector_broadcast_sent',
            groups: { project: projectRef ?? 'Unknown', organization: org?.id ?? 'Unknown', branch: branchRef ?? 'Unknown' },
          })
          sendMessage(v.message, v.payload, () => setSendMessageShown(false))
        }}
      />
    </div>
  )
}
