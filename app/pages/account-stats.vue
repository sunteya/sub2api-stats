<script setup lang="ts">
type AccountStatsRow = {
  id: string
  account_name: string
  status: string | null
  request_count: string
  avg_first_token: string | null
  error_windows: string
  total_windows: string
  availability_10m: string | null
  latest_request_at: string | null
}

type AccountStatsResponse = {
  items: AccountStatsRow[]
}

const isAdminAuthenticated = useState<boolean>('admin-authenticated', () => false)

const { data, error, pending, refresh } = await useFetch<AccountStatsResponse>('/api/account-stats', {
  immediate: false,
  watch: false,
})

const accounts = computed(() => data.value?.items || [])
const activeAccounts = computed(() => accounts.value.filter((account) => account.status === 'active').length)

watch(isAdminAuthenticated, (authenticated) => {
  if (authenticated) {
    refresh()
  }
}, { immediate: true })

function formatDate(value: string | null): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatStatus(status: string | null): string {
  if (status === 'active') {
    return '启用'
  }

  if (status === 'inactive') {
    return '停用'
  }

  return status || '-'
}

function formatAvailability(value: string | null): string {
  return value === null ? '-' : `${value}%`
}

function formatFirstToken(value: string | null): string {
  return value === null ? '-' : `${value}s`
}
</script>

<template>
  <AdminGate>
    <main class="page">
      <section class="toolbar">
        <div>
          <p class="eyebrow">Sub2API Admin</p>
          <h1>账号统计</h1>
        </div>
        <div class="actions">
          <NuxtLink class="button secondary" to="/">用户列表</NuxtLink>
          <NuxtLink class="button secondary" to="/request-error">请求排查</NuxtLink>
          <button class="button" type="button" :disabled="pending" @click="refresh()">
            {{ pending ? '加载中' : '刷新' }}
          </button>
        </div>
      </section>

      <section class="summary" aria-label="账号统计摘要">
        <div>
          <span>有请求账号</span>
          <strong>{{ accounts.length }}</strong>
        </div>
        <div>
          <span>启用账号</span>
          <strong>{{ activeAccounts }}</strong>
        </div>
      </section>

      <section class="table-panel">
        <p v-if="error" class="status error">账号统计加载失败：{{ error.statusMessage || error.message }}</p>
        <p v-else-if="pending && !data" class="status">正在加载账号统计...</p>
        <p v-else-if="accounts.length === 0" class="status">暂无有请求记录的账号。</p>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>账号名称</th>
                <th>状态</th>
                <th class="number">请求数</th>
                <th class="number">平均首 Token</th>
                <th class="number">异常窗口 / 总窗口</th>
                <th class="number">10 分钟可用率</th>
                <th>最近请求时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in accounts" :key="account.id">
                <td class="mono">{{ account.id }}</td>
                <td>{{ account.account_name }}</td>
                <td><span class="badge" :class="account.status || ''">{{ formatStatus(account.status) }}</span></td>
                <td class="number">{{ account.request_count }}</td>
                <td class="number">{{ formatFirstToken(account.avg_first_token) }}</td>
                <td class="number">{{ account.error_windows }} / {{ account.total_windows }}</td>
                <td class="number">{{ formatAvailability(account.availability_10m) }}</td>
                <td>{{ formatDate(account.latest_request_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </AdminGate>
</template>

<style scoped>
.page { min-height: 100vh; margin: 0; padding: 32px; font-family: Arial, Helvetica, sans-serif; background: #f6f7f9; color: #111827; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 1180px; margin: 0 auto 20px; }
.eyebrow { margin: 0 0 6px; color: #667085; font-size: 0.82rem; font-weight: 700; letter-spacing: 0; }
h1 { margin: 0; font-size: 1.8rem; line-height: 1.2; }
.actions { display: flex; align-items: center; gap: 10px; }
.button { display: inline-flex; align-items: center; justify-content: center; min-width: 88px; border: 1px solid #2563eb; border-radius: 6px; background: #2563eb; color: #fff; padding: 9px 14px; font-size: 0.92rem; font-weight: 700; cursor: pointer; text-decoration: none; }
.button:disabled { border-color: #cbd5e1; background: #e2e8f0; color: #64748b; cursor: not-allowed; }
.button.secondary { border-color: #cbd5e1; background: #fff; color: #1f2937; }
.summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-width: 1180px; margin: 0 auto 16px; }
.summary div { border: 1px solid #dde3ee; border-radius: 8px; background: #fff; padding: 16px; }
.summary span { display: block; margin-bottom: 8px; color: #667085; font-size: 0.82rem; }
.summary strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.table-panel { max-width: 1180px; margin: 0 auto; overflow: hidden; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; }
.table-wrap { overflow-x: auto; }
table { width: 100%; min-width: 1030px; border-collapse: collapse; font-size: 0.9rem; }
th, td { border-bottom: 1px solid #eef2f7; padding: 12px 14px; text-align: left; white-space: nowrap; }
th { background: #f8fafc; color: #475467; font-size: 0.78rem; font-weight: 700; }
tbody tr:last-child td { border-bottom: 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.number { text-align: right; font-variant-numeric: tabular-nums; }
.badge { display: inline-flex; align-items: center; min-height: 24px; border-radius: 999px; background: #f1f5f9; color: #334155; padding: 2px 10px; font-size: 0.78rem; font-weight: 700; }
.badge.active { background: #dcfce7; color: #166534; }
.badge.inactive { background: #fee2e2; color: #991b1b; }
.status { margin: 0; padding: 24px; color: #667085; }
.error { color: #b42318; }
@media (max-width: 720px) { .page { padding: 20px 14px; } .toolbar { align-items: flex-start; flex-direction: column; } .actions { width: 100%; } .actions .button { flex: 1; } .summary { grid-template-columns: 1fr; } }
</style>
