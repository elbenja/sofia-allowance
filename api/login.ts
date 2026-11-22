import { login } from '../server/auth'

export const config = { runtime: 'edge' }

export default function handler(request: Request) {
  return login(request, process.env.password, true)
}
