import { logout } from '../server/auth.js'

export const config = { runtime: 'edge' }

export default function handler(request: Request) {
  return logout(request, true)
}
