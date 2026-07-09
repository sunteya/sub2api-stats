import { hasAdminSession } from '../utils/admin-auth'

export default defineEventHandler((event) => {
  return {
    authenticated: hasAdminSession(event),
  }
})
