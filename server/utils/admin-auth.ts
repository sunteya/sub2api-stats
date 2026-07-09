import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

const adminSessionCookieName = 'sub2api_admin_session'
const sessionMaxAge = 60 * 60 * 24 * 7

function readAdminPassword(event: H3Event): string {
  const config = useRuntimeConfig(event)
  const password = String(config.adminPassword || '').trim()

  if (!password) {
    throw createError({
      statusCode: 500,
      statusMessage: 'ADMIN_PASSWORD is not configured',
    })
  }

  return password
}

function createAdminSessionToken(password: string): string {
  return createHash('sha256')
    .update(`sub2api-stats-admin-session:${password}`)
    .digest('hex')
}

function safelyEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function hasAdminSession(event: H3Event): boolean {
  const password = readAdminPassword(event)
  const expectedToken = createAdminSessionToken(password)
  const currentToken = getCookie(event, adminSessionCookieName) || ''

  return safelyEqual(currentToken, expectedToken)
}

export function requireAdmin(event: H3Event): void {
  if (!hasAdminSession(event)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Admin password required',
    })
  }
}

export function verifyAdminPassword(event: H3Event, password: unknown): boolean {
  const expectedPassword = readAdminPassword(event)
  const submittedPassword = String(password || '').trim()

  return safelyEqual(submittedPassword, expectedPassword)
}

export function setAdminSession(event: H3Event): void {
  const password = readAdminPassword(event)

  setCookie(event, adminSessionCookieName, createAdminSessionToken(password), {
    httpOnly: true,
    maxAge: sessionMaxAge,
    path: '/',
    sameSite: 'lax',
  })
}

export function clearAdminSession(event: H3Event): void {
  deleteCookie(event, adminSessionCookieName, {
    path: '/',
  })
}
