import { NextApiRequest, NextApiResponse } from 'next'
import { apiBuilder } from 'lib/api/apiBuilder'
import { getPlatformQueryParams } from 'lib/api/platformQueryParams'
import { getVelaClient } from 'data/vela/vela'

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug, ref } = getPlatformQueryParams(req, 'slug', 'ref')
  const client = getVelaClient(req)
  return client.proxyGet(res, '/organizations/{organization_id}/projects/{project_id}/resources/limits/', {
    params: {
      path: {
        organization_id: slug,
        project_id: ref,
      },
    },
  })
}

const handlePut = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug, ref } = getPlatformQueryParams(req, 'slug', 'ref')
  const client = getVelaClient(req)
  return client.proxyPut(res, '/organizations/{organization_id}/projects/{project_id}/resources/limits/', {
    params: {
      path: {
        organization_id: slug,
        project_id: ref,
      },
    },
    body: req.body,
  })
}

const apiHandler = apiBuilder((builder) => builder.useAuth().get(handleGet).put(handlePut))

export default apiHandler
