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

export type RequestErrorResult = {
  requestId: string
  matchedFrom: 'usage_logs' | 'ops_error_logs' | 'usage_logs + ops_error_logs'
  account: {
    id: string | null
    name: string | null
    status: string | null
    errorMessage: string | null
  }
  request: {
    model: string | null
    usageCreatedAt: Date | string | null
    errorCreatedAt: Date | string | null
    firstTokenMs: number | null
    durationMs: number | null
  }
  error: {
    phase: string | null
    type: string | null
    severity: string | null
    statusCode: number | null
    upstreamStatusCode: number | null
    source: string | null
    owner: string | null
    providerCode: string | null
    providerType: string | null
    networkType: string | null
    summary: string | null
    summarySource: string | null
  }
  rawErrors: Record<string, string | null>
}

const query = `
WITH matched_usage AS (
  SELECT id, request_id, account_id, model, first_token_ms, duration_ms, created_at
  FROM usage_logs
  WHERE request_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 1
), matched_error AS (
  SELECT id, request_id, account_id, model, error_phase, error_type, severity, status_code,
    upstream_status_code, error_source, error_owner, account_status, provider_error_code,
    provider_error_type, network_error_type, error_message, error_body, upstream_error_message,
    upstream_error_detail, upstream_errors::text AS upstream_errors, created_at
  FROM ops_error_logs
  WHERE request_id = $1
  ORDER BY created_at DESC, id DESC
  LIMIT 1
)
SELECT COALESCE(u.request_id, e.request_id) AS request_id,
  COALESCE(u.account_id, e.account_id) AS account_id,
  a.name AS account_name, a.error_message AS account_error_message,
  COALESCE(u.model, e.model) AS model, u.created_at AS usage_created_at, e.created_at AS error_created_at,
  u.first_token_ms, u.duration_ms AS usage_duration_ms, e.error_phase, e.error_type, e.severity,
  e.status_code, e.upstream_status_code, e.error_source, e.error_owner, e.account_status,
  e.provider_error_code, e.provider_error_type, e.network_error_type, e.error_message, e.error_body,
  e.upstream_error_message, e.upstream_error_detail, e.upstream_errors,
  (u.request_id IS NOT NULL) AS has_usage_row, (e.request_id IS NOT NULL) AS has_error_row
FROM matched_usage u
FULL OUTER JOIN matched_error e ON true
LEFT JOIN accounts a ON a.id = COALESCE(u.account_id, e.account_id)
`

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeMultiline(value: string): string {
  return value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`
}

function findFirstString(value: unknown): string | null {
  if (typeof value === 'string') {
    return collapseWhitespace(value) || null
  }

  if (Array.isArray(value)) {
    return value.map(findFirstString).find(Boolean) || null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  for (const key of ['message', 'error', 'detail', 'reason', 'title']) {
    const result = findFirstString(record[key])
    if (result) return result
  }

  return Object.values(record).map(findFirstString).find(Boolean) || null
}

function extractSummary(value: string): string {
  const normalized = normalizeMultiline(value)
  if (!normalized) return ''

  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    try {
      const result = findFirstString(JSON.parse(normalized))
      if (result) return result
    } catch {
      // Fall through to plain text when a malformed JSON response is returned.
    }
  }

  const title = normalized.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const heading = normalized.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const htmlText = title || heading

  if (htmlText) {
    return collapseWhitespace(
      htmlText
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/<[^>]+>/g, ' '),
    )
  }

  return normalized.split('\n')[0] || collapseWhitespace(normalized)
}

function getErrorSummary(row: RequestLookupRow): { source: string; summary: string } | null {
  for (const [source, value] of [
    ['upstream_error_message', row.upstream_error_message],
    ['upstream_error_detail', row.upstream_error_detail],
    ['error_message', row.error_message],
    ['error_body', row.error_body],
    ['upstream_errors', row.upstream_errors],
  ]) {
    if (!value) continue
    const summary = extractSummary(value)
    if (summary) return { source, summary: truncate(summary, 240) }
  }

  return null
}

function getMatchedFrom(row: RequestLookupRow): RequestErrorResult['matchedFrom'] {
  if (row.has_usage_row && row.has_error_row) return 'usage_logs + ops_error_logs'
  return row.has_error_row ? 'ops_error_logs' : 'usage_logs'
}

export async function getRequestError(databaseUrl: string, requestId: string): Promise<RequestErrorResult | null> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 })

  try {
    await client.connect()
    const result = await client.query<RequestLookupRow>(query, [requestId])
    const row = result.rows[0]
    if (!row) return null

    const summary = getErrorSummary(row)
    return {
      requestId: row.request_id,
      matchedFrom: getMatchedFrom(row),
      account: { id: row.account_id, name: row.account_name, status: row.account_status, errorMessage: row.account_error_message },
      request: { model: row.model, usageCreatedAt: row.usage_created_at, errorCreatedAt: row.error_created_at, firstTokenMs: row.first_token_ms, durationMs: row.usage_duration_ms },
      error: {
        phase: row.error_phase, type: row.error_type, severity: row.severity, statusCode: row.status_code,
        upstreamStatusCode: row.upstream_status_code, source: row.error_source, owner: row.error_owner,
        providerCode: row.provider_error_code, providerType: row.provider_error_type, networkType: row.network_error_type,
        summary: summary?.summary || null, summarySource: summary?.source || null,
      },
      rawErrors: {
        error_message: row.error_message,
        error_body: row.error_body,
        upstream_error_message: row.upstream_error_message,
        upstream_error_detail: row.upstream_error_detail,
        upstream_errors: row.upstream_errors,
      },
    }
  } finally {
    await client.end()
  }
}
