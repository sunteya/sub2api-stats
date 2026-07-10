export default defineNuxtConfig({
  compatibilityDate: '2026-07-09',
  nitro: {
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      '0 0 * * *': 'daily:top-up',
    },
  },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    sub2apiBaseUrl: process.env.SUB2API_BASE_URL || '',
    sub2apiKey: process.env.SUB2API_KEY || '',
  },
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },
})
