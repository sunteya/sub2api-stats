import { setAdminSession, verifyAdminPassword } from '../utils/admin-auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: unknown }>(event)

  if (!verifyAdminPassword(event, body?.password)) {
    throw createError({
      statusCode: 401,
      statusMessage: '管理密钥不正确',
    })
  }

  setAdminSession(event)

  return {
    authenticated: true,
  }
})
