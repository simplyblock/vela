import { NextApiRequest } from 'next'

export interface PlatformQueryParams {
  slug?: string
  ref?: string
  branch?: string
  user_id?: string
  role_id?: string
  id?: string
  name?: string
  backup?: string
  api_key_id?:string
}

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

export function getPlatformQueryParams<
  T extends Record<string, string | undefined> = {},
  K extends keyof (PlatformQueryParams & T) = never
>(
  req: NextApiRequest,
  ...required: K[]
): WithRequired<PlatformQueryParams & T, K> {
  const params = req.query as WithRequired<PlatformQueryParams & T, K>

  for (const key of required) {
    if (params[key] === undefined) {
      throw new Error(`Missing required query param: ${String(key)}`)
    }
  }
  return params
}
