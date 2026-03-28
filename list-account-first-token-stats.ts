import 'dotenv/config'
import Table from 'cli-table3'
import { Client } from 'pg'

type AccountFirstTokenStatsRow = {
  id: string
  account_name: string
  status: string | null
  request_count: string
  avg_first_token: string | null
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
    AND first_token_ms IS NOT NULL
),
ranked_usage AS (
  SELECT
    account_id,
    first_token_ms,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY first_token_ms ASC, created_at DESC, id DESC
    ) AS value_rn,
    COUNT(*) OVER (PARTITION BY account_id) AS total_count
  FROM base_usage
),
trimmed_usage AS (
  SELECT
    account_id,
    first_token_ms
  FROM ranked_usage
  WHERE value_rn > FLOOR(total_count * 0.1)::bigint
    AND value_rn <= total_count - FLOOR(total_count * 0.1)::bigint
),
trimmed_stats AS (
  SELECT
    account_id,
    ROUND(AVG(first_token_ms)::numeric / 1000, 1) AS avg_first_token
  FROM trimmed_usage
  GROUP BY account_id
),
account_totals AS (
  SELECT
    account_id,
    COUNT(*) AS request_count,
    MAX(created_at) AS latest_request_at
  FROM base_usage
  GROUP BY account_id
)
SELECT
  a.id AS id,
  a.name AS account_name,
  a.status AS status,
  t.request_count AS request_count,
  s.avg_first_token AS avg_first_token,
  t.latest_request_at AS latest_request_at
FROM accounts a
JOIN account_totals t ON t.account_id = a.id
JOIN trimmed_stats s ON s.account_id = a.id
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

    const result = await client.query<AccountFirstTokenStatsRow>(query)
    const table = new Table({
      head: ['id', 'account_name', 'status', 'request_count', 'avg_first_token', 'latest_request_at'],
      colAligns: ['right', 'left', 'left', 'right', 'right', 'left'],
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
