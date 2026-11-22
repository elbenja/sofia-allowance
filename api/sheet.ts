import { sheet } from '../server/sheet.js'

export const config = { runtime: 'edge' }

export default function handler(request: Request) {
  return sheet(request, process.env)
}
