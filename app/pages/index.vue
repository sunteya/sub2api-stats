<script setup lang="ts">
type User = {
  id: number
  email: string
  username: string | null
  role: string
  balance: number
  daily_amount: number | null
  concurrency: number
  current_concurrency?: number | null
  rpm_limit?: number | null
  status: string
  last_active_at?: string | null
  last_used_at?: string | null
  created_at: string
}

type UsersResponse = {
  items: User[]
  total: number
  page: number
  page_size: number
  pages: number
}

type ResetDailyBalanceResponse = {
  email: string
  balance: number
  target: number
  amount: number
  new_balance: number
  skipped: boolean
  reason: 'already_enough' | 'topped_up'
}

const page = ref(1)
const pageSize = 20
const resettingEmail = ref('')
const resetMessage = ref('')
const resetError = ref('')
const isAdminAuthenticated = useState<boolean>('admin-authenticated', () => false)

const { data, error, pending, refresh } = await useFetch<UsersResponse>('/api/users', {
  query: {
    page,
    page_size: pageSize,
  },
  immediate: false,
  watch: false,
})

const users = computed(() => data.value?.items || [])
const total = computed(() => data.value?.total || 0)
const pages = computed(() => data.value?.pages || 1)

watch(isAdminAuthenticated, (authenticated) => {
  if (authenticated) {
    refresh()
  }
}, { immediate: true })

watch(page, () => {
  if (isAdminAuthenticated.value) {
    refresh()
  }
})

function formatDate(value?: string | null): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) {
    return '-'
  }

  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.trunc(value * 10) / 10)
}

function formatDailyAmount(value?: number | null): string {
  if (value === null || value === undefined) {
    return '-'
  }

  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)
}

function previousPage() {
  if (page.value > 1) {
    page.value -= 1
  }
}

function nextPage() {
  if (page.value < pages.value) {
    page.value += 1
  }
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }

    return data.statusMessage || data.message || '重置每日额度失败'
  }

  return error instanceof Error ? error.message : '重置每日额度失败'
}

async function resetDailyBalance(user: User) {
  if (user.daily_amount === null || user.daily_amount === undefined) {
    resetError.value = `${user.email} 未设置每日金额。`
    resetMessage.value = ''
    return
  }

  resettingEmail.value = user.email
  resetMessage.value = ''
  resetError.value = ''

  try {
    const result = await $fetch<ResetDailyBalanceResponse>('/api/daily-amounts/reset', {
      method: 'POST',
      body: {
        email: user.email,
      },
    })

    if (result.skipped) {
      resetMessage.value = `${user.email} 当前余额 ${formatNumber(result.balance)} 已达到每日金额 ${formatDailyAmount(result.target)}。`
    } else {
      resetMessage.value = `${user.email} 已增加 ${formatNumber(result.amount)}，余额约为 ${formatNumber(result.new_balance)}。`
    }

    await refresh()
  } catch (error) {
    resetError.value = getErrorMessage(error)
  } finally {
    resettingEmail.value = ''
  }
}
</script>

<template>
  <AdminGate>
    <main class="page">
      <section class="toolbar">
        <div>
          <p class="eyebrow">Sub2API Admin</p>
          <h1>用户列表</h1>
        </div>
        <div class="actions">
          <button class="button" type="button" :disabled="pending" @click="refresh()">
            {{ pending ? '加载中' : '刷新' }}
          </button>
        </div>
      </section>

      <section class="summary" aria-label="用户列表统计">
        <div>
          <span>总用户</span>
          <strong>{{ total }}</strong>
        </div>
        <div>
          <span>当前页</span>
          <strong>{{ page }} / {{ pages }}</strong>
        </div>
        <div>
          <span>每页</span>
          <strong>{{ pageSize }}</strong>
        </div>
      </section>

      <section class="table-panel">
        <p v-if="resetError" class="status error">{{ resetError }}</p>
        <p v-if="resetMessage" class="status success">{{ resetMessage }}</p>
        <p v-if="error" class="status error">
          用户列表加载失败：{{ error.statusMessage || error.message }}
        </p>
        <p v-else-if="pending && !data" class="status">正在加载用户列表...</p>
        <p v-else-if="users.length === 0" class="status">暂无用户。</p>

        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>邮箱</th>
                <th>用户名</th>
                <th>角色</th>
                <th>状态</th>
                <th>余额 / 每日金额</th>
                <th>并发</th>
                <th>RPM</th>
                <th>最近使用</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td class="mono">{{ user.id }}</td>
                <td>{{ user.email }}</td>
                <td>{{ user.username || '-' }}</td>
                <td>{{ user.role }}</td>
                <td>
                  <span class="badge" :class="user.status">{{ user.status }}</span>
                </td>
                <td>
                  <span class="amount-display">{{ formatNumber(user.balance) }} / {{ formatDailyAmount(user.daily_amount) }}</span>
                </td>
                <td class="number">
                  {{ user.current_concurrency ?? 0 }} / {{ user.concurrency }}
                </td>
                <td class="number">{{ user.rpm_limit ?? '-' }}</td>
                <td>{{ formatDate(user.last_used_at || user.last_active_at) }}</td>
                <td>{{ formatDate(user.created_at) }}</td>
                <td>
                  <div class="row-actions">
                    <NuxtLink class="button secondary compact" :to="{ path: '/daily-amounts', query: { email: user.email } }">
                      设置每日金额
                    </NuxtLink>
                    <button
                      class="button compact"
                      type="button"
                      :disabled="pending || resettingEmail === user.email || user.daily_amount === null"
                      @click="resetDailyBalance(user)"
                    >
                      {{ resettingEmail === user.email ? '重置中' : '重置每日额度' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <nav class="pagination" aria-label="用户列表分页">
        <button class="button secondary" type="button" :disabled="page <= 1 || pending" @click="previousPage">
          上一页
        </button>
        <span>第 {{ page }} 页，共 {{ pages }} 页</span>
        <button class="button secondary" type="button" :disabled="page >= pages || pending" @click="nextPage">
          下一页
        </button>
      </nav>
    </main>
  </AdminGate>
</template>

<style scoped>
.page {
  min-height: 100vh;
  margin: 0;
  padding: 32px;
  font-family: Arial, Helvetica, sans-serif;
  background: #f6f7f9;
  color: #111827;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto 20px;
}

.eyebrow {
  margin: 0 0 6px;
  color: #667085;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0;
}

h1 {
  margin: 0;
  font-size: 1.8rem;
  line-height: 1.2;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  border: 1px solid #2563eb;
  border-radius: 6px;
  background: #2563eb;
  color: #ffffff;
  padding: 9px 14px;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
}

.button:disabled {
  border-color: #cbd5e1;
  background: #e2e8f0;
  color: #64748b;
  cursor: not-allowed;
}

.button.secondary {
  border-color: #cbd5e1;
  background: #ffffff;
  color: #1f2937;
  text-decoration: none;
}

.button.compact {
  min-width: 104px;
  padding: 7px 10px;
  font-size: 0.82rem;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  max-width: 1180px;
  margin: 0 auto 16px;
}

.summary div {
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #ffffff;
  padding: 16px;
}

.summary span {
  display: block;
  color: #667085;
  font-size: 0.82rem;
  margin-bottom: 8px;
}

.summary strong {
  font-size: 1.35rem;
}

.table-panel {
  max-width: 1180px;
  margin: 0 auto;
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th,
td {
  border-bottom: 1px solid #eef2f7;
  padding: 12px 14px;
  text-align: left;
  white-space: nowrap;
}

th {
  background: #f8fafc;
  color: #475467;
  font-size: 0.78rem;
  font-weight: 700;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.number {
  text-align: right;
}

.amount-display {
  color: #1f2937;
  font-variant-numeric: tabular-nums;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #334155;
  padding: 2px 10px;
  font-size: 0.78rem;
  font-weight: 700;
}

.badge.active {
  background: #dcfce7;
  color: #166534;
}

.badge.disabled,
.badge.inactive {
  background: #fee2e2;
  color: #991b1b;
}

.status {
  margin: 0;
  padding: 24px;
  color: #667085;
}

.error {
  color: #b42318;
}

.success {
  color: #047857;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  max-width: 1180px;
  margin: 16px auto 0;
  color: #475467;
}

@media (max-width: 720px) {
  .page {
    padding: 20px 14px;
  }

  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .actions {
    width: 100%;
  }

  .actions .button {
    flex: 1;
    text-align: center;
  }

  .summary {
    grid-template-columns: 1fr;
  }

  .pagination {
    justify-content: space-between;
  }
}
</style>
