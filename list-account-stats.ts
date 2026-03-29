import 'dotenv/config'
import Table from 'cli-table3'
import { Client } from 'pg'

type AccountStatsRow = {
  id: string
  account_name: string
  status: string | null
  request_count: string
  avg_first_token: string | null
  error_windows: string
  total_windows: string
  availability_10m: string | null
  latest_request_at: Date | string | null
}

const ANSI_GREEN = '\x1b[32m'
const ANSI_RESET = '\x1b[0m'

const query = `
WITH base_usage AS (
  SELECT
    account_id,
    first_token_ms,
    created_at,
    id
  FROM usage_logs
  WHERE account_id IS NOT NULL
),
ranked_first_token_samples AS (
  SELECT
    account_id,
    first_token_ms,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY first_token_ms ASC, created_at DESC, id DESC
    ) AS value_rn,
    COUNT(*) OVER (PARTITION BY account_id) AS total_count
  FROM base_usage
  WHERE first_token_ms IS NOT NULL
),
trimmed_first_token_samples AS (
  SELECT
    account_id,
    first_token_ms
  FROM ranked_first_token_samples
  WHERE value_rn > FLOOR(total_count * 0.1)::bigint
    AND value_rn <= total_count - FLOOR(total_count * 0.1)::bigint
),
first_token_stats AS (
  SELECT
    account_id,
    ROUND(AVG(first_token_ms)::numeric / 1000, 1) AS avg_first_token
  FROM trimmed_first_token_samples
  GROUP BY account_id
),
ranked_usage AS (
  SELECT
    CASE
      WHEN request_id IS NOT NULL THEN 'request:' || request_id
      ELSE 'usage-row:' || id::text
    END AS request_key,
    request_id,
    account_id,
    created_at,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY CASE
        WHEN request_id IS NOT NULL THEN 'request:' || request_id
        ELSE 'usage-row:' || id::text
      END
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM usage_logs
  WHERE account_id IS NOT NULL
),
latest_usage AS (
  SELECT
    request_key,
    request_id,
    account_id,
    created_at
  FROM ranked_usage
  WHERE rn = 1
),
ranked_errors AS (
  SELECT
    CASE
      WHEN request_id IS NOT NULL THEN 'request:' || request_id
      ELSE 'error-row:' || id::text
    END AS request_key,
    request_id,
    account_id,
    created_at,
    status_code,
    upstream_status_code,
    (
      concat_ws(
        ' ',
        provider_error_code,
        provider_error_type,
        error_message,
        error_body,
        upstream_error_message,
        upstream_error_detail,
        upstream_errors::text
      ) ILIKE '%model_not_found%'
    ) AS is_model_not_found,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY CASE
        WHEN request_id IS NOT NULL THEN 'request:' || request_id
        ELSE 'error-row:' || id::text
      END
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM ops_error_logs
  WHERE account_id IS NOT NULL
),
latest_errors AS (
  SELECT
    request_key,
    request_id,
    account_id,
    created_at,
    status_code,
    upstream_status_code,
    is_model_not_found
  FROM ranked_errors
  WHERE rn = 1
),
merged_requests AS (
  SELECT
    COALESCE(u.request_key, e.request_key) AS request_key,
    COALESCE(u.account_id, e.account_id) AS account_id,
    COALESCE(GREATEST(u.created_at, e.created_at), u.created_at, e.created_at) AS latest_request_at,
    (
      e.request_key IS NOT NULL
      AND e.status_code IS DISTINCT FROM 403
      AND e.upstream_status_code IS DISTINCT FROM 403
      AND NOT e.is_model_not_found
    ) AS has_error
  FROM latest_usage u
  FULL OUTER JOIN latest_errors e ON u.request_key = e.request_key
),
window_stats AS (
  SELECT
    account_id,
    to_timestamp(floor(extract(epoch from latest_request_at) / 600) * 600) AS window_start,
    COUNT(*) FILTER (WHERE has_error) AS error_request_count,
    COUNT(*) AS request_count,
    (
      COUNT(*) FILTER (WHERE has_error)::numeric / NULLIF(COUNT(*), 0) >= 0.1
    ) AS is_unavailable
  FROM merged_requests
  GROUP BY account_id, to_timestamp(floor(extract(epoch from latest_request_at) / 600) * 600)
),
request_totals AS (
  SELECT
    account_id,
    COUNT(*) AS request_count,
    MAX(latest_request_at) AS latest_request_at
  FROM merged_requests
  GROUP BY account_id
),
availability_stats AS (
  SELECT
    account_id,
    COUNT(*) FILTER (WHERE is_unavailable) AS error_windows,
    COUNT(*) AS total_windows,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE NOT is_unavailable)::numeric / NULLIF(COUNT(*), 0),
      1
    ) AS availability_10m
  FROM window_stats
  GROUP BY account_id
)
SELECT
  a.id AS id,
  a.name AS account_name,
  a.status AS status,
  r.request_count AS request_count,
  f.avg_first_token AS avg_first_token,
  s.error_windows AS error_windows,
  s.total_windows AS total_windows,
  s.availability_10m AS availability_10m,
  r.latest_request_at AS latest_request_at
FROM accounts a
JOIN request_totals r ON r.account_id = a.id
JOIN availability_stats s ON s.account_id = a.id
LEFT JOIN first_token_stats f ON f.account_id = a.id
WHERE a.deleted_at IS NULL
ORDER BY a.id
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

function formatTimestamp(value: Date | string | null): string {
  if (!value) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return value
}

function formatRate(value: string | null): string {
  if (!value) {
    return ''
  }

  return `${value}%`
}

function isEnabledStatus(value: string | null): boolean {
  return value === 'active'
}

function formatStatus(value: string | null): string {
  if (!value) {
    return ''
  }

  if (value === 'active') {
    return 'enabled'
  }

  if (value === 'inactive') {
    return 'disabled'
  }

  return value
}

function colorizeRow(values: string[], enabled: boolean): string[] {
  if (!enabled) {
    return values
  }

  return values.map((value) => `${ANSI_GREEN}${value}${ANSI_RESET}`)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  })

  try {
    await client.connect()

    const result = await client.query<AccountStatsRow>(query)
    const table = new Table({
      head: [
        'id',
        'account_name',
        'status',
        'request_count',
        'avg_first_token',
        'error_windows',
        'total_windows',
        'availability_10m',
        'latest_request_at',
      ],
      colAligns: ['right', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'left'],
      chars: asciiTableChars,
      style: {
        head: [],
        border: [],
        compact: true,
      },
    })

    table.push(
      ...result.rows.map((row) =>
        colorizeRow(
          [
            row.id,
            row.account_name,
            formatStatus(row.status),
            row.request_count,
            row.avg_first_token ?? '',
            row.error_windows,
            row.total_windows,
            formatRate(row.availability_10m),
            formatTimestamp(row.latest_request_at),
          ],
          isEnabledStatus(row.status),
        ),
      ),
    )

    console.log(table.toString())
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
