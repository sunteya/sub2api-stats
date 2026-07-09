<script setup lang="ts">
type AdminSessionResponse = {
  authenticated: boolean
}

const authenticated = useState<boolean>('admin-authenticated', () => false)
const checking = ref(true)
const submitting = ref(false)
const passwordDraft = ref('')
const errorMessage = ref('')

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }

    return data.statusMessage || data.message || '管理密钥校验失败'
  }

  return error instanceof Error ? error.message : '管理密钥校验失败'
}

async function checkSession() {
  checking.value = true
  errorMessage.value = ''

  try {
    const session = await $fetch<AdminSessionResponse>('/api/admin-session')
    authenticated.value = session.authenticated
  } catch (error) {
    authenticated.value = false
    errorMessage.value = getErrorMessage(error)
  } finally {
    checking.value = false
  }
}

async function submitPassword() {
  const password = passwordDraft.value.trim()

  if (!password) {
    errorMessage.value = '请输入管理密钥。'
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    const session = await $fetch<AdminSessionResponse>('/api/admin-session', {
      method: 'POST',
      body: {
        password,
      },
    })

    authenticated.value = session.authenticated
    passwordDraft.value = ''
  } catch (error) {
    authenticated.value = false
    errorMessage.value = getErrorMessage(error)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  checkSession()
})
</script>

<template>
  <slot v-if="authenticated" />
  <main v-else class="admin-gate">
    <form class="login-panel" novalidate @submit.prevent="submitPassword">
      <p class="eyebrow">Sub2API Admin</p>
      <h1>输入管理密钥</h1>
      <p v-if="checking" class="status">正在检查管理权限...</p>
      <p v-else-if="errorMessage" class="status error">{{ errorMessage }}</p>

      <label class="field">
        <span>管理密钥</span>
        <input
          v-model="passwordDraft"
          autocomplete="current-password"
          autofocus
          class="password-input"
          type="password"
          :disabled="checking || submitting"
        >
      </label>

      <button class="button" type="submit" :disabled="checking || submitting">
        {{ submitting ? '验证中' : '进入管理' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.admin-gate {
  display: grid;
  min-height: 100vh;
  margin: 0;
  place-items: center;
  padding: 24px;
  font-family: Arial, Helvetica, sans-serif;
  background: #f6f7f9;
  color: #111827;
}

.login-panel {
  width: min(100%, 380px);
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #ffffff;
  padding: 24px;
  box-shadow: 0 18px 50px rgb(15 23 42 / 8%);
}

.eyebrow {
  margin: 0 0 6px;
  color: #667085;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0;
}

h1 {
  margin: 0 0 20px;
  font-size: 1.65rem;
  line-height: 1.2;
}

.field {
  display: block;
  margin-bottom: 16px;
}

.field span {
  display: block;
  margin-bottom: 8px;
  color: #667085;
  font-size: 0.82rem;
}

.password-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px 11px;
  color: #111827;
  font: inherit;
}

.password-input:focus {
  border-color: #2563eb;
  outline: 2px solid #bfdbfe;
  outline-offset: 1px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 40px;
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

.status {
  margin: -8px 0 16px;
  color: #667085;
}

.error {
  color: #b42318;
}
</style>
