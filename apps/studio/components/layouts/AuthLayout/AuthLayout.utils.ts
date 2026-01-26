import type { ProductMenuGroup } from 'components/ui/ProductMenu/ProductMenu.types'

export const generateAuthMenu = (
  orgRef: string,
  projectRef: string,
  branchRef: string,
  { showPolicies }: { showPolicies: boolean }
): ProductMenuGroup[] => {
  return [
    {
      title: 'Manage',
      items: [
        {
          name: 'Users',
          key: 'users',
          url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/users`,
          items: [],
        },
      ],
    },
    {
      title: 'Configuration',
      items: [
        ...(showPolicies
          ? [
              {
                name: 'Policies',
                key: 'policies',
                url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/policies`,
                items: [],
              },
            ]
          : []),
        {
          name: 'Sign Up / Providers',
          key: 'signup',
          pages: ['signup', 'providers', 'third-party'],
          url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/signup`,
          items: [],
        },
        {
          name: 'Sessions',
          key: 'sessions',
          url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/sessions`,
          items: [],
        },
        // {
        //   name: 'Rate Limits',
        //   key: 'rate-limits',
        //   url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/rate-limits`,
        //   items: [],
        // },
        {
           name: 'SMTP',
           key: 'emails',
           url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/smtp`,
           items: [],
         },
        {
          name: 'Multi-Factor',
          key: 'mfa',
          url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/mfa`,
          items: [],
        },
        {
          name: 'URL Configuration',
          key: 'url-configuration',
          url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/url-configuration`,
          items: [],
        },
        // {
        //   name: 'Attack Protection',
        //   key: 'protection',
        //   url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/protection`,
        //   items: [],
        // },
        // {
        //   name: 'Auth Hooks',
        //   key: 'hooks',
        //   url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/hooks`,
        //   items: [],
        //   label: 'BETA',
        // },
        // {
        //   name: 'Advanced',
        //   key: 'advanced',
        //   url: `/org/${orgRef}/project/${projectRef}/branch/${branchRef}/auth/advanced`,
        //   items: [],
        // },
      ],
    },
  ]
}
