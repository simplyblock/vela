import { NextApiRequest, NextApiResponse } from 'next'
import { apiBuilder } from 'lib/api/apiBuilder'
import { getPlatformQueryParams } from 'lib/api/platformQueryParams'
import { getVelaClient } from 'data/vela/vela'

const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug, ref, branch, api_key_id } = getPlatformQueryParams(req, 'slug', 'ref', 'branch','api_key_id')
  const client = getVelaClient(req)
  return await client.proxyDelete(
    res,
    '/organizations/{organization_id}/projects/{project_id}/branches/{branch_id}/apikeys/{api_key_id}',
    {
      params: {
        path: {
          organization_id: slug,
          project_id: ref,
          branch_id: branch,
          api_key_id: api_key_id
        },
      },
    }
  )
}


const apiHandler = apiBuilder((builder) => {
  builder.useAuth().delete(handleDelete)
})


export default apiHandler