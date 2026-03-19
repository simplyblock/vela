import { NextApiRequest, NextApiResponse } from 'next'
import { apiBuilder } from 'lib/api/apiBuilder'
import { getPlatformQueryParams } from 'lib/api/platformQueryParams'
import { getVelaClient } from 'data/vela/vela'
import type { components as platformComponents } from 'data/api'

type SmtpConfig = platformComponents['schemas']['BranchAuthSmtpConfig']

// Trailing slash is required by the Vela API; cast to suppress TS schema mismatch
const AUTH_PATH =
  '/organizations/{organization_id}/projects/{project_id}/branches/{branch_id}/auth/' as any

function smtpServerToConfig(smtpServer: Record<string, string> | undefined): SmtpConfig {
  if (!smtpServer || Object.keys(smtpServer).length === 0) {
    return {
      host: null,
      port: null,
      user: null,
      password: null,
      from: null,
      fromDisplayName: null,
      maxFrequency: null,
      encryption: null,
    }
  }
  return {
    host: smtpServer.host ?? null,
    port: smtpServer.port ?? null,
    user: smtpServer.user ?? null,
    password: smtpServer.password ? '****' : null,
    from: smtpServer.from ?? null,
    fromDisplayName: smtpServer.fromDisplayName ?? null,
    maxFrequency: smtpServer.maxFrequency ? Number(smtpServer.maxFrequency) : null,
    encryption: smtpServer.ssl === 'true' ? 'tls' : smtpServer.starttls === 'true' ? 'starttls' : null,
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug, ref, branch } = getPlatformQueryParams(req, 'slug', 'ref', 'branch')
  const client = getVelaClient(req)

  const hasAuth = !!req.headers.authorization
  const response = await client.getOrFail(res, AUTH_PATH, {
    params: {
      path: {
        organization_id: slug,
        project_id: ref,
        branch_id: branch,
      },
    },
  })
  const { success, data } = response

  if (!success) {
    console.error('[smtp] GET realm failed', { hasAuth, slug, ref, branch })
    return
  }

  return res.json(smtpServerToConfig(data.smtpServer))
}

const handlePut = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug, ref, branch } = getPlatformQueryParams(req, 'slug', 'ref', 'branch')
  const client = getVelaClient(req)

  const body = req.body as SmtpConfig

  const { success, data: realmData } = await client.getOrFail(res, AUTH_PATH, {
    params: {
      path: {
        organization_id: slug,
        project_id: ref,
        branch_id: branch,
      },
    },
  })

  if (!success) return

  // Determine if SMTP should be disabled (all fields null)
  const allNull = Object.values(body).every((v) => v === null || v === undefined)

  let updatedSmtpServer: Record<string, string>

  if (allNull) {
    updatedSmtpServer = {}
  } else {
    const existing = realmData.smtpServer ?? {}
    updatedSmtpServer = { ...existing }

    if (body.host !== undefined) {
      if (body.host === null) delete updatedSmtpServer.host
      else updatedSmtpServer.host = body.host
    }
    if (body.port !== undefined) {
      if (body.port === null) delete updatedSmtpServer.port
      else updatedSmtpServer.port = body.port
    }
    if (body.user !== undefined) {
      if (body.user === null) {
        delete updatedSmtpServer.user
        delete updatedSmtpServer.auth
      } else {
        updatedSmtpServer.user = body.user
        updatedSmtpServer.auth = 'true'
      }
    }
    if (body.password !== undefined && body.password !== null && body.password !== '') {
      updatedSmtpServer.password = body.password
    }
    if (body.from !== undefined) {
      if (body.from === null) delete updatedSmtpServer.from
      else updatedSmtpServer.from = body.from
    }
    if (body.fromDisplayName !== undefined) {
      if (body.fromDisplayName === null) delete updatedSmtpServer.fromDisplayName
      else updatedSmtpServer.fromDisplayName = body.fromDisplayName
    }
    if (body.maxFrequency !== undefined) {
      if (body.maxFrequency === null) delete updatedSmtpServer.maxFrequency
      else updatedSmtpServer.maxFrequency = String(body.maxFrequency)
    }
    if (body.encryption !== undefined) {
      delete updatedSmtpServer.ssl
      delete updatedSmtpServer.starttls
      if (body.encryption === 'tls') updatedSmtpServer.ssl = 'true'
      else if (body.encryption === 'starttls') updatedSmtpServer.starttls = 'true'
    }
  }

  const { success: putSuccess } = await client.putOrFail(res, AUTH_PATH, {
    params: {
      path: {
        organization_id: slug,
        project_id: ref,
        branch_id: branch,
      },
    },
    body: {
      ...realmData,
      smtpServer: updatedSmtpServer,
    },
  })

  if (!putSuccess) return

  return res.json(smtpServerToConfig(updatedSmtpServer))
}

const apiHandler = apiBuilder((builder) => builder.useAuth().get(handleGet).put(handlePut))

export default apiHandler
