<script setup lang="ts">
type RequestErrorResult = {
  requestId: string
  matchedFrom: string
  account: { id: string | null; name: string | null; status: string | null; errorMessage: string | null }
  request: { model: string | null; usageCreatedAt: string | null; errorCreatedAt: string | null; firstTokenMs: number | null; durationMs: number | null }
  error: { phase: string | null; type: string | null; severity: string | null; statusCode: number | null; upstreamStatusCode: number | null; source: string | null; owner: string | null; providerCode: string | null; providerType: string | null; networkType: string | null; summary: string | null; summarySource: string | null }
  rawErrors: Record<string, string | null>
}

const route = useRoute()
const requestId = ref(String(route.query.request_id || '').trim())
const result = ref<RequestErrorResult | null>(null)
const pending = ref(false)
const errorMessage = ref('')

const details = computed(() => {
  if (!result.value) return []
  const { account, request, error } = result.value
  return [
    ['匹配来源', result.value.matchedFrom], ['账号 ID', account.id], ['账号名称', account.name], ['账号状态', account.status],
    ['模型', request.model], ['使用记录时间', formatDate(request.usageCreatedAt)], ['错误记录时间', formatDate(request.errorCreatedAt)],
    ['首 Token', request.firstTokenMs === null ? null : `${request.firstTokenMs} ms`], ['请求耗时', request.durationMs === null ? null : `${request.durationMs} ms`],
    ['错误阶段', error.phase], ['错误类型', error.type], ['严重程度', error.severity], ['HTTP 状态码', error.statusCode],
    ['上游状态码', error.upstreamStatusCode], ['错误来源', error.source], ['错误归属', error.owner],
    ['供应商错误码', error.providerCode], ['供应商错误类型', error.providerType], ['网络错误类型', error.networkType],
  ].filter(([, value]) => value !== null && value !== '')
})

const rawErrors = computed(() => Object.entries(result.value?.rawErrors || {}).filter(([, value]) => value))

function formatDate(value: string | null): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }
    return data.statusMessage || data.message || '请求排查失败'
  }
  return error instanceof Error ? error.message : '请求排查失败'
}

async function lookup() {
  const value = requestId.value.trim()
  if (!value) {
    errorMessage.value = '请输入请求 ID。'
    result.value = null
    return
  }

  pending.value = true
  errorMessage.value = ''
  try {
    result.value = await $fetch<RequestErrorResult>('/api/request-error', { query: { request_id: value } })
    await navigateTo({ query: { request_id: value } }, { replace: true })
  } catch (error) {
    result.value = null
    errorMessage.value = getErrorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AdminGate>
    <main class="page">
      <section class="toolbar">
        <div><p class="eyebrow">Sub2API Admin</p><h1>请求排查</h1></div>
        <nav class="actions" aria-label="页面导航">
          <NuxtLink class="button secondary" to="/">用户列表</NuxtLink>
          <NuxtLink class="button secondary" to="/account-stats">账号统计</NuxtLink>
        </nav>
      </section>

      <section class="lookup-panel">
        <form class="lookup-form" @submit.prevent="lookup">
          <label class="field"><span>请求 ID</span><input v-model="requestId" autocomplete="off" placeholder="输入 request_id" :disabled="pending"></label>
          <button class="button" type="submit" :disabled="pending">{{ pending ? '查询中' : '查询' }}</button>
        </form>
      </section>

      <p v-if="errorMessage" class="status error">{{ errorMessage }}</p>

      <template v-if="result">
        <section class="panel summary-panel">
          <div><span>请求 ID</span><strong class="mono">{{ result.requestId }}</strong></div>
          <div><span>错误摘要</span><strong>{{ result.error.summary || '未记录错误详情' }}</strong><small v-if="result.error.summarySource">来源：{{ result.error.summarySource }}</small></div>
        </section>

        <section class="panel details-panel">
          <h2>请求详情</h2>
          <dl>
            <template v-for="[label, value] in details" :key="String(label)">
              <dt>{{ label }}</dt><dd>{{ value }}</dd>
            </template>
          </dl>
        </section>

        <section v-if="result.account.errorMessage" class="panel">
          <h2>账号错误信息</h2><pre>{{ result.account.errorMessage }}</pre>
        </section>

        <section v-if="rawErrors.length" class="panel raw-panel">
          <h2>原始错误内容</h2>
          <details v-for="[source, value] in rawErrors" :key="source">
            <summary>{{ source }}</summary><pre>{{ value }}</pre>
          </details>
        </section>
      </template>
    </main>
  </AdminGate>
</template>

<style scoped>
.page { min-height: 100vh; padding: 32px; font-family: Arial, Helvetica, sans-serif; background: #f6f7f9; color: #111827; }
.toolbar, .lookup-panel, .panel, .status { max-width: 980px; margin-left: auto; margin-right: auto; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }.eyebrow { margin: 0 0 6px; color: #667085; font-size: .82rem; font-weight: 700; letter-spacing: 0; } h1, h2 { margin: 0; } h1 { font-size: 1.8rem; } h2 { font-size: 1rem; }
.actions, .lookup-form { display: flex; align-items: end; gap: 10px; }.button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; min-width: 88px; border: 1px solid #2563eb; border-radius: 6px; background: #2563eb; color: #fff; padding: 9px 14px; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }.button.secondary { border-color: #cbd5e1; background: #fff; color: #1f2937; }.button:disabled { border-color: #cbd5e1; background: #e2e8f0; color: #64748b; cursor: not-allowed; }
.lookup-panel, .panel { box-sizing: border-box; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; }.lookup-panel { margin-bottom: 16px; padding: 18px; }.field { flex: 1; }.field span { display: block; margin-bottom: 7px; color: #667085; font-size: .82rem; }.field input { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; color: #111827; font: inherit; }.field input:focus { border-color: #2563eb; outline: 2px solid #bfdbfe; outline-offset: 1px; }
.status { margin-top: 0; margin-bottom: 16px; color: #b42318; }.panel { margin-bottom: 16px; padding: 18px; }.summary-panel { display: grid; grid-template-columns: minmax(200px, .8fr) minmax(0, 2fr); gap: 22px; }.summary-panel span, small { display: block; color: #667085; font-size: .82rem; }.summary-panel strong { display: block; margin: 7px 0; overflow-wrap: anywhere; }.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .88rem; } dl { display: grid; grid-template-columns: 180px minmax(0, 1fr); margin: 14px 0 0; } dt, dd { margin: 0; border-top: 1px solid #eef2f7; padding: 10px 0; overflow-wrap: anywhere; } dt { color: #667085; } dd { font-variant-numeric: tabular-nums; } pre { margin: 14px 0 0; overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: .85rem/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; } details { border-top: 1px solid #eef2f7; padding: 12px 0; } details:first-of-type { margin-top: 14px; } summary { cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
@media (max-width: 720px) { .page { padding: 20px 14px; }.toolbar { align-items: flex-start; flex-direction: column; }.actions { width: 100%; }.actions .button { flex: 1; }.lookup-form, .summary-panel { display: grid; grid-template-columns: 1fr; }.lookup-form .button { width: 100%; } dl { grid-template-columns: 1fr; } dt { border-bottom: 0; padding-bottom: 2px; } dd { border-top: 0; padding-top: 2px; } }
</style>
