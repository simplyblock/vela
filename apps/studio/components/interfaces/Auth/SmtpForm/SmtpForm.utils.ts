import type { components } from 'data/api'

type SmtpConfig = components['schemas']['BranchAuthSmtpConfig']
// Also accept GoTrueConfigResponse (project-level) for backwards compatibility with callers like RateLimits
type GoTrueSmtpConfig = {
  SMTP_HOST?: string | null
  SMTP_PORT?: string | null
  SMTP_USER?: string | null
  SMTP_ADMIN_EMAIL?: string | null
  SMTP_SENDER_NAME?: string | null
  SMTP_MAX_FREQUENCY?: number | null
}

interface SmtpConfigForm {
  ENABLE_SMTP: boolean
  SMTP_ADMIN_EMAIL: string
  SMTP_SENDER_NAME: string
  SMTP_USER: string
  SMTP_HOST: string
  SMTP_PASS: string
  SMTP_PORT: string
  SMTP_MAX_FREQUENCY: number
  SMTP_ENCRYPTION: 'tls' | 'starttls' | 'none'
}

export const isSmtpEnabled = (config?: Partial<SmtpConfig> | Partial<GoTrueSmtpConfig>): boolean => {
  if (!config) return false
  // Keycloak-style fields (branch auth config)
  if ('host' in config || 'from' in config) {
    const c = config as Partial<SmtpConfig>
    return !!(c.from && c.fromDisplayName && c.user && c.host && c.port && (c.maxFrequency ?? 0) >= 0)
  }
  // GoTrue-style fields (project auth config)
  const c = config as Partial<GoTrueSmtpConfig>
  return !!(
    c.SMTP_ADMIN_EMAIL &&
    c.SMTP_SENDER_NAME &&
    c.SMTP_USER &&
    c.SMTP_HOST &&
    c.SMTP_PORT &&
    (c.SMTP_MAX_FREQUENCY ?? 0) >= 0
  )
}

export const generateFormValues = (config?: Partial<SmtpConfig>): Partial<SmtpConfigForm> => {
  return {
    ENABLE_SMTP: isSmtpEnabled(config),
    SMTP_ADMIN_EMAIL: config?.from ?? '',
    SMTP_SENDER_NAME: config?.fromDisplayName ?? '',
    SMTP_USER: config?.user ?? '',
    SMTP_HOST: config?.host ?? '',
    SMTP_PASS: '',
    SMTP_PORT: config?.port ?? '465',
    SMTP_MAX_FREQUENCY: config?.maxFrequency ?? 60,
    SMTP_ENCRYPTION: (config?.encryption as 'tls' | 'starttls') ?? 'none',
  }
}
