import { InlineLink } from 'components/ui/InlineLink'

export const SpecialSymbolsCallout = () => {
  return (
    <p className="mb-2">
      Note: If using the Postgres connection string, you will need to{' '}
      <InlineLink href="https://docs.vela.run/latest/operations/pg-roles-users/#special-symbols-in-passwords">
        url encode
      </InlineLink>{' '}
      the password
    </p>
  )
}
