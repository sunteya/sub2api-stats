import 'dotenv/config'
import Table from 'cli-table3'
import { Client } from 'pg'

type AccountFirstTokenStatsRow = {
  id: string
  account_name: string
  request_count: string
  avg_first_token: string | null
  latest_request_at: Date | string | null
}

const query = `
WITH ranked_usage AS (
  SELECT
    account_id,
    first_token_ms,
    created_at,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM usage_logs
  WHERE account_id IS NOT NULL
    AND first_token_ms IS NOT NULL
),
last_100 AS (
  SELECT
    account_id,
    first_token_ms,
    created_at
  FROM ranked_usage
  WHERE rn <= 100
)
SELECT
  a.id AS id,
  a.name AS account_name,
  COUNT(*) AS request_count,
  ROUND(AVG(l.first_token_ms)::numeric / 1000, 1) AS avg_first_token,
  MAX(l.created_at) AS latest_request_at
FROM accounts a
JOIN last_100 l ON l.account_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id, a.name
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
      head: ['id', 'account_name', 'request_count', 'avg_first_token', 'latest_request_at'],
      colAligns: ['right', 'left', 'right', 'right', 'left'],
      chars: asciiTableChars,
      style: {
        head: [],
        border: [],
        compact: true,
      },
    })

    table.push(
      ...result.rows.map((row) => [
        row.id,
        row.account_name,
        row.request_count,
        row.avg_first_token ?? '',
        formatTimestamp(row.latest_request_at),
      ]),
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
