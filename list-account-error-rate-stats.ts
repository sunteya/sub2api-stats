import 'dotenv/config'
import Table from 'cli-table3'
import { Client } from 'pg'

type AccountErrorRateStatsRow = {
  id: string
  account_name: string
  status: string | null
  request_count: string
  error_count: string
  error_rate: string | null
  latest_request_at: Date | string | null
}

const ANSI_GREEN = '\x1b[32m'
const ANSI_RESET = '\x1b[0m'

const query = `
WITH ranked_usage AS (
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
    upstream_status_code
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
    ) AS has_error
  FROM latest_usage u
  FULL OUTER JOIN latest_errors e ON u.request_key = e.request_key
)
SELECT
  a.id AS id,
  a.name AS account_name,
  a.status AS status,
  COUNT(*) AS request_count,
  COUNT(*) FILTER (WHERE r.has_error) AS error_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE r.has_error)::numeric / NULLIF(COUNT(*), 0),
    1
  ) AS error_rate,
  MAX(r.latest_request_at) AS latest_request_at
FROM accounts a
JOIN merged_requests r ON r.account_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id, a.name, a.status
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

    const result = await client.query<AccountErrorRateStatsRow>(query)
    const table = new Table({
      head: ['id', 'account_name', 'status', 'request_count', 'error_count', 'error_rate', 'latest_request_at'],
      colAligns: ['right', 'left', 'left', 'right', 'right', 'right', 'left'],
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
            row.error_count,
            formatRate(row.error_rate),
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
