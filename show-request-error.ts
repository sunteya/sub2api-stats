import 'dotenv/config'
import Table from 'cli-table3'
import { Client } from 'pg'

type RequestLookupRow = {
  request_id: string
  account_id: string | null
  account_name: string | null
  account_error_message: string | null
  model: string | null
  usage_created_at: Date | string | null
  error_created_at: Date | string | null
  first_token_ms: number | null
  usage_duration_ms: number | null
  error_phase: string | null
  error_type: string | null
  severity: string | null
  status_code: number | null
  upstream_status_code: number | null
  error_source: string | null
  error_owner: string | null
  account_status: string | null
  provider_error_code: string | null
  provider_error_type: string | null
  network_error_type: string | null
  error_message: string | null
  error_body: string | null
  upstream_error_message: string | null
  upstream_error_detail: string | null
  upstream_errors: string | null
  has_usage_row: boolean
  has_error_row: boolean
}

type ErrorSummary = {
  summary: string
  source: string
  excerpt: string
}

const query = `
WITH matched_usage AS (
  SELECT
    id,
    request_id,
    account_id,
    model,
    first_token_ms,
    duration_ms,
    created_at
  FROM usage_logs
  WHERE request_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 1
),
matched_error AS (
  SELECT
    id,
    request_id,
    account_id,
    model,
    error_phase,
    error_type,
    severity,
    status_code,
    upstream_status_code,
    error_source,
    error_owner,
    account_status,
    provider_error_code,
    provider_error_type,
    network_error_type,
    error_message,
    error_body,
    upstream_error_message,
    upstream_error_detail,
    upstream_errors::text AS upstream_errors,
    created_at
  FROM ops_error_logs
  WHERE request_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 1
)
SELECT
  COALESCE(u.request_id, e.request_id) AS request_id,
  COALESCE(u.account_id, e.account_id) AS account_id,
  a.name AS account_name,
  a.error_message AS account_error_message,
  COALESCE(u.model, e.model) AS model,
  u.created_at AS usage_created_at,
  e.created_at AS error_created_at,
  u.first_token_ms,
  u.duration_ms AS usage_duration_ms,
  e.error_phase,
  e.error_type,
  e.severity,
  e.status_code,
  e.upstream_status_code,
  e.error_source,
  e.error_owner,
  e.account_status,
  e.provider_error_code,
  e.provider_error_type,
  e.network_error_type,
  e.error_message,
  e.error_body,
  e.upstream_error_message,
  e.upstream_error_detail,
  e.upstream_errors,
  (u.request_id IS NOT NULL) AS has_usage_row,
  (e.request_id IS NOT NULL) AS has_error_row
FROM matched_usage u
FULL OUTER JOIN matched_error e ON true
LEFT JOIN accounts a ON a.id = COALESCE(u.account_id, e.account_id)
`

const asciiTableChars = {
  top: '-',
  'top-mid': '+',
  'top-left': '+',
  'top-right': '+',
  bottom: '-',
  'bottom-mid': '+',
  'bottom-left': '+',
  'bottom-right': '+',
  left: '|',
  'left-mid': '|',
  mid: '-',
  'mid-mid': '+',
  right: '|',
  'right-mid': '|',
  middle: '|',
} as const

function parseRequestId(): string {
  const requestId = process.argv
    .slice(2)
    .filter((value) => value !== '--')[0]
    ?.trim()

  if (!requestId) {
    throw new Error('Usage: pnpm tsx show-request-error.ts <request_id>')
  }

  return requestId
}

function formatTimestamp(value: Date | string | null): string {
  if (!value) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return value
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h\d>/gi, '\n')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function normalizeMultiline(value: string): string {
  return value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function findFirstString(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = collapseWhitespace(value)
    return normalized || null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findFirstString(item)
      if (nested) {
        return nested
      }
    }

    return null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>

  for (const key of ['message', 'error', 'detail', 'reason', 'title']) {
    const nested = findFirstString(record[key])
    if (nested) {
      return nested
    }
  }

  for (const nestedValue of Object.values(record)) {
    const nested = findFirstString(nestedValue)
    if (nested) {
      return nested
    }
  }

  return null
}

function extractJsonError(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    return findFirstString(parsed)
  } catch {
    return null
  }
}

function extractHtmlError(value: string): string | null {
  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return null
  }

  const titleMatch = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) {
    const title = collapseWhitespace(stripHtml(titleMatch[1]))
    if (title.includes('|')) {
      const parts = title
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
      const lastPart = parts.at(-1)
      if (lastPart) {
        return lastPart
      }
    }

    if (title) {
      return title
    }
  }

  const headingMatch = value.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (headingMatch?.[1]) {
    const heading = collapseWhitespace(stripHtml(headingMatch[1]))
    if (heading) {
      return heading
    }
  }

  const text = collapseWhitespace(stripHtml(value))
  return text || null
}

function extractPlainError(value: string): string | null {
  const normalized = normalizeMultiline(value)
  if (!normalized) {
    return null
  }

  const firstLine = normalized.split('\n')[0]?.trim()
  if (firstLine) {
    return firstLine
  }

  return collapseWhitespace(normalized) || null
}

function pickErrorSummary(row: RequestLookupRow): ErrorSummary | null {
  const candidates = [
    ['upstream_error_message', row.upstream_error_message],
    ['upstream_error_detail', row.upstream_error_detail],
    ['error_message', row.error_message],
    ['error_body', row.error_body],
    ['upstream_errors', row.upstream_errors],
  ] as const

  for (const [source, value] of candidates) {
    if (!value) {
      continue
    }

    const normalized = normalizeMultiline(value)
    if (!normalized) {
      continue
    }

    const summary =
      extractJsonError(normalized) ??
      extractHtmlError(normalized) ??
      extractPlainError(normalized)

    if (!summary) {
      continue
    }

    return {
      source,
      summary: truncate(summary, 240),
      excerpt: truncate(normalized, 320),
    }
  }

  return null
}

function getMatchedFromLabel(row: RequestLookupRow): string {
  if (row.has_usage_row && row.has_error_row) {
    return 'usage_logs + ops_error_logs'
  }

  if (row.has_error_row) {
    return 'ops_error_logs'
  }

  return 'usage_logs'
}

function getValueColumnWidth(): number {
  const terminalWidth = process.stdout.columns ?? 120
  return Math.max(40, Math.min(120, terminalWidth - 28))
}

function buildRows(row: RequestLookupRow): Array<[string, string]> {
  const errorSummary = pickErrorSummary(row)
  const rows: Array<[string, string | null | undefined]> = [
    ['request_id', row.request_id],
    ['matched_from', getMatchedFromLabel(row)],
    ['account_id', row.account_id],
    ['account_name', row.account_name],
    ['model', row.model],
    ['usage_created_at', formatTimestamp(row.usage_created_at)],
    ['error_created_at', formatTimestamp(row.error_created_at)],
    ['first_token_ms', row.first_token_ms == null ? null : String(row.first_token_ms)],
    ['usage_duration_ms', row.usage_duration_ms == null ? null : String(row.usage_duration_ms)],
    ['error_phase', row.error_phase],
    ['error_type', row.error_type],
    ['severity', row.severity],
    ['status_code', row.status_code == null ? null : String(row.status_code)],
    ['upstream_status_code', row.upstream_status_code == null ? null : String(row.upstream_status_code)],
    ['error_source', row.error_source],
    ['error_owner', row.error_owner],
    ['account_status', row.account_status],
    ['provider_error_code', row.provider_error_code],
    ['provider_error_type', row.provider_error_type],
    ['network_error_type', row.network_error_type],
    [
      'specific_error',
      errorSummary?.summary ??
        (row.has_error_row ? 'Found error log, but could not derive a concise error summary' : 'No ops_error_logs row found for this request_id'),
    ],
    ['specific_error_source', errorSummary?.source],
    [
      'error_excerpt',
      errorSummary && errorSummary.excerpt !== errorSummary.summary ? errorSummary.excerpt : null,
    ],
    ['account_error_message', row.account_error_message],
  ]

  return rows.filter(([, value]) => value != null && value !== '') as Array<[string, string]>
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
  }

  const requestId = parseRequestId()

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  })

  try {
    await client.connect()

    const result = await client.query<RequestLookupRow>(query, [requestId])
    const row = result.rows[0]

    if (!row) {
      throw new Error(`No usage_logs or ops_error_logs row found for request_id "${requestId}"`)
    }

    const table = new Table({
      head: ['field', 'value'],
      colWidths: [24, getValueColumnWidth()],
      wordWrap: true,
      chars: asciiTableChars,
      style: {
        head: [],
        border: [],
        compact: true,
      },
    })

    table.push(...buildRows(row))

    console.log(table.toString())
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
