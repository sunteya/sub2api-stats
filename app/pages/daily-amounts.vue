<script setup lang="ts">
type User = {
  id: number
  email: string
  username: string | null
  balance: number
  daily_amount: number | null
}

type UsersResponse = {
  items: User[]
  total: number
  page: number
  page_size: number
  pages: number
}

const route = useRoute()
const selectedEmail = computed(() => String(route.query.email || '').trim())
const amountDraft = ref<string | number>('')
const savedDailyAmount = ref<number | null | undefined>()
const saving = ref(false)
const saveMessage = ref('')
const saveError = ref('')

const { data, error, pending, refresh } = await useFetch<UsersResponse>('/api/users', {
  query: {
    page: 1,
    page_size: 100,
    search: selectedEmail,
  },
})

const selectedUser = computed(() => {
  const email = selectedEmail.value.toLowerCase()

  if (!email) {
    return null
  }

  return data.value?.items.find((user) => user.email.toLowerCase() === email) || null
})

const currentDailyAmount = computed(() => {
  if (savedDailyAmount.value !== undefined) {
    return savedDailyAmount.value
  }

  return selectedUser.value?.daily_amount ?? null
})

watch(selectedUser, (user) => {
  savedDailyAmount.value = undefined
  amountDraft.value = formatAmountInput(user?.daily_amount)
}, { immediate: true })

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

function formatAmountInput(value?: number | null): string {
  if (value === null || value === undefined) {
    return ''
  }

  return value.toFixed(1)
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }

    return data.statusMessage || data.message || '每日金额保存失败'
  }

  return error instanceof Error ? error.message : '每日金额保存失败'
}

async function saveDailyAmount() {
  if (!selectedUser.value) {
    saveError.value = '没有找到要编辑的用户。'
    saveMessage.value = ''
    return
  }

  const rawAmount = String(amountDraft.value ?? '').trim()
  const amount = rawAmount === '' ? null : Math.round(Number(rawAmount) * 10) / 10

  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    saveError.value = '每日金额必须是大于等于 0 的数字。'
    saveMessage.value = ''
    return
  }

  saveError.value = ''
  saveMessage.value = ''
  saving.value = true

  try {
    const user = selectedUser.value

    await $fetch('/api/daily-amounts', {
      method: 'PUT',
      body: {
        amounts: {
          [user.email]: amount,
        },
      },
    })

    user.daily_amount = amount
    savedDailyAmount.value = amount
    amountDraft.value = formatAmountInput(amount)
    saveMessage.value = `${user.email} 的每日金额已保存。`
    await navigateTo('/')
  } catch (error) {
    saveError.value = getErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="page">
    <section class="toolbar">
      <div>
        <p class="eyebrow">Sub2API Admin</p>
        <h1>设置每日金额</h1>
      </div>
      <NuxtLink class="button secondary" to="/">返回用户列表</NuxtLink>
    </section>

    <section class="panel">
      <p v-if="saveError" class="status error">{{ saveError }}</p>
      <p v-if="saveMessage" class="status success">{{ saveMessage }}</p>
      <p v-if="!selectedEmail" class="status">请从用户列表选择一个用户。</p>
      <p v-else-if="error" class="status error">
        用户加载失败：{{ error.statusMessage || error.message }}
      </p>
      <p v-else-if="pending && !data" class="status">正在加载用户...</p>
      <p v-else-if="!selectedUser" class="status">没有找到 {{ selectedEmail }}。</p>

      <form v-else class="form" novalidate @submit.prevent="saveDailyAmount">
        <div class="user-summary">
          <div>
            <span>邮箱</span>
            <strong>{{ selectedUser.email }}</strong>
          </div>
          <div>
            <span>用户名</span>
            <strong>{{ selectedUser.username || '-' }}</strong>
          </div>
          <div>
            <span>余额 / 每日金额</span>
            <strong>{{ formatNumber(selectedUser.balance) }} / {{ formatDailyAmount(currentDailyAmount) }}</strong>
          </div>
        </div>

        <label class="field">
          <span>每日金额</span>
          <input
            v-model="amountDraft"
            class="amount-input"
            type="number"
            min="0"
            step="0.1"
            placeholder="空为不设置"
          >
        </label>

        <div class="actions">
          <button class="button" type="button" :disabled="saving || pending" @click="saveDailyAmount">
            {{ saving ? '保存中' : '保存' }}
          </button>
        </div>
      </form>
    </section>
  </main>
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
  max-width: 720px;
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
  text-decoration: none;
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
}

.panel {
  max-width: 720px;
  margin: 0 auto;
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.form {
  padding: 18px;
}

.user-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.user-summary div {
  border: 1px solid #eef2f7;
  border-radius: 8px;
  padding: 12px;
}

.user-summary span,
.field span {
  display: block;
  margin-bottom: 8px;
  color: #667085;
  font-size: 0.82rem;
}

.user-summary strong {
  display: block;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}

.field {
  display: block;
  max-width: 220px;
}

.amount-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 9px 10px;
  color: #111827;
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.amount-input:focus {
  border-color: #2563eb;
  outline: 2px solid #bfdbfe;
  outline-offset: 1px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.status {
  margin: 0;
  padding: 16px 18px;
  color: #667085;
}

.error {
  color: #b42318;
}

.success {
  color: #047857;
}

@media (max-width: 720px) {
  .page {
    padding: 20px 14px;
  }

  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar .button {
    width: 100%;
  }

  .user-summary {
    grid-template-columns: 1fr;
  }
}
</style>
