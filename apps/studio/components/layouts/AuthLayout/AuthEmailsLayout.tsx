import { PropsWithChildren } from 'react'

import { useParams } from 'common'
import { PageLayout } from 'components/layouts/PageLayout/PageLayout'
import AuthLayout from './AuthLayout'

export const AuthEmailsLayout = ({ children }: PropsWithChildren<{}>) => {
  const { slug: orgRef, ref: projectRef, branch: branchRef } = useParams()

  const navItems = [
    {
      label: 'Templates',
      href: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/templates`,
    },
    {
      label: 'SMTP Settings',
      href: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/smtp`,
    },
  ]

  return (
    <AuthLayout>
      <PageLayout
        title="Emails"
        subtitle="Configure what emails your users receive and how they are sent"
        //navigationItems={navItems}
      >
        {children}
      </PageLayout>
    </AuthLayout>
  )
}
