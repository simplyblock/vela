import { HouseHeart, Check, Plus, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'

import { useParams } from 'common'
import ShimmeringLoader from 'components/ui/ShimmeringLoader'
import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import {
  Button,
  CommandEmpty_Shadcn_,
  CommandGroup_Shadcn_,
  CommandInput_Shadcn_,
  CommandItem_Shadcn_,
  CommandList_Shadcn_,
  CommandSeparator_Shadcn_,
  Command_Shadcn_,
  PopoverContent_Shadcn_,
  PopoverTrigger_Shadcn_,
  Popover_Shadcn_,
  ScrollArea,
  cn,
} from 'ui'
import { useOrganizationsCreatable } from 'data/organizations/organizations-creatable'

export const OrganizationDropdown = () => {
  const router = useRouter()
  const { slug: routeSlug } = useParams()
  const { data: selectedOrganization } = useSelectedOrganizationQuery()
  const { data: organizations, isLoading: isLoadingOrganizations } = useOrganizationsQuery()

  const organizationCreationEnabled = useIsFeatureEnabled('organizations:create')
  const { data: canCreateOrganization, isLoading: isLoadingCanCreateOrganization } =
    useOrganizationsCreatable()

  const slug = selectedOrganization?.id
  const orgName = selectedOrganization?.name

  const [open, setOpen] = useState(false)

  if (isLoadingOrganizations) {
    return <ShimmeringLoader className="w-[90px]" />
  }

  return (
    <>
      <Link
        href={slug ? `/org/${slug}` : '/organizations'}
        className="flex items-center gap-2 flex-shrink-0 text-sm"
      >
        <HouseHeart size={14} strokeWidth={1.5} className="text-foreground-lighter" />
        <span
          className={cn(
            'max-w-32 lg:max-w-none truncate hidden md:block',
            !!selectedOrganization ? 'text-foreground' : 'text-foreground-lighter'
          )}
        >
          {orgName ?? 'Select an organization'}
        </span>
      </Link>

      <Popover_Shadcn_ open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger_Shadcn_ asChild>
          <Button
            type="text"
            className={cn('px-1.5 py-4 [&_svg]:w-5 [&_svg]:h-5 ml-1')}
            iconRight={<ChevronDown strokeWidth={1.5} />}
          />
        </PopoverTrigger_Shadcn_>
        <PopoverContent_Shadcn_ className="p-0" side="bottom" align="start">
          <Command_Shadcn_>
            <CommandInput_Shadcn_ placeholder="Find organization..." />
            <CommandList_Shadcn_>
              <CommandEmpty_Shadcn_>No organizations found</CommandEmpty_Shadcn_>

              {/* 1) LIST */}
              <CommandGroup_Shadcn_>
                <ScrollArea className={(organizations || []).length > 7 ? 'h-[210px]' : ''}>
                  {organizations?.map((org) => {
                    const pathname = router.pathname
                    const isWizard = pathname.includes('/new')
                    const hasProjectSegment = pathname.includes('[ref]')
                    const href =
                      !!routeSlug && !isWizard && !hasProjectSegment
                        ? router.pathname.replace('[slug]', org.id!)
                        : `/org/${org.id}`

                    return (
                      <CommandItem_Shadcn_
                        key={org.id}
                        value={`${org.name.replaceAll('"', '')} - ${org.id}`}
                        className="cursor-pointer w-full"
                        onSelect={() => {
                          setOpen(false)
                          router.push(href)
                        }}
                        onClick={() => setOpen(false)}
                      >
                        <Link href={href} className="w-full flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{org.name}</span>
                          </div>
                          {org.id === slug && <Check size={16} />}
                        </Link>
                      </CommandItem_Shadcn_>
                    )
                  })}
                </ScrollArea>
              </CommandGroup_Shadcn_>

              {/* 2) NEW (if enabled) */}
              {organizationCreationEnabled &&
                !isLoadingCanCreateOrganization &&
                canCreateOrganization && (
                  <>
                    <CommandSeparator_Shadcn_ />
                    <CommandGroup_Shadcn_>
                      <CommandItem_Shadcn_
                        className="cursor-pointer w-full"
                        onSelect={() => {
                          setOpen(false)
                          router.push(`/new`)
                        }}
                        onClick={() => setOpen(false)}
                      >
                        <Link href="/new" className="flex items-center gap-2 w-full">
                          <Plus size={14} strokeWidth={1.5} />
                          <p>New organization</p>
                        </Link>
                      </CommandItem_Shadcn_>
                    </CommandGroup_Shadcn_>
                  </>
                )}

              {/* 3) ALL */}
              <CommandSeparator_Shadcn_ />
              <CommandGroup_Shadcn_>
                <CommandItem_Shadcn_
                  className="cursor-pointer w-full"
                  onSelect={() => {
                    setOpen(false)
                    router.push(`/organizations`)
                  }}
                  onClick={() => setOpen(false)}
                >
                  <Link href="/organizations" className="flex items-center gap-2 w-full">
                    <p>All Organizations</p>
                  </Link>
                </CommandItem_Shadcn_>
              </CommandGroup_Shadcn_>
            </CommandList_Shadcn_>
          </Command_Shadcn_>
        </PopoverContent_Shadcn_>
      </Popover_Shadcn_>
    </>
  )
}
