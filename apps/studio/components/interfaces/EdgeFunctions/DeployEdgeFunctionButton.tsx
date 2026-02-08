import { ChevronDown, Code, Terminal } from 'lucide-react'
import { useRouter } from 'next/router'

import { TerminalInstructions } from 'components/interfaces/Functions/TerminalInstructions'
import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import {
  Button,
  Dialog,
  DialogContent,
  DialogSection,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'ui'
import { getPathReferences } from 'data/vela/path-references'

export const DeployEdgeFunctionButton = () => {
  const router = useRouter()
  const { slug: orgRef, ref: projectRef, branch: branchRef } = getPathReferences()
  const { data: org } = useSelectedOrganizationQuery()

  const { mutate: sendEvent } = useSendEventMutation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="primary" iconRight={<ChevronDown className="w-4 h-4" strokeWidth={1.5} />}>
          Deploy a new function
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem
          onSelect={() => {
            router.push(`/org/${orgRef}/project/${projectRef}/branch/${branchRef}/functions/new`)
            sendEvent({
              action: 'edge_function_via_editor_button_clicked',
              properties: { origin: 'secondary_action' },
              groups: { project: projectRef ?? 'Unknown', organization: org?.id ?? 'Unknown', branch: branchRef ?? 'Unknown' },
            })
          }}
          className="gap-4"
        >
          <Code className="shrink-0" size={16} strokeWidth={1.5} />
          <div>
            <span className="text-foreground">Via Editor</span>
            <p>Write and deploy in the browser</p>
          </div>
        </DropdownMenuItem>
        {/* <Dialog>
          <DialogTrigger asChild>
            <DropdownMenuItem
              className="gap-4"
              onSelect={(e) => {
                e.preventDefault()
                sendEvent({
                  action: 'edge_function_via_cli_button_clicked',
                  properties: { origin: 'secondary_action' },
                  groups: { project: projectRef ?? 'Unknown', organization: org?.id ?? 'Unknown' },
                })
              }}
            >
              <Terminal className="shrink-0" size={16} strokeWidth={1.5} />
              <div>
                <span className="text-foreground">Via CLI</span>
                <p>Write locally, deploy with the CLI</p>
              </div>
            </DropdownMenuItem>
          </DialogTrigger>
          <DialogContent size="large">
            <DialogTitle className="sr-only">
              Create your first Edge Function via the CLI
            </DialogTitle>
            <DialogSection padding="small">
              <TerminalInstructions />
            </DialogSection>
          </DialogContent>
        </Dialog> */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
