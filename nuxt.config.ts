export default defineNuxtConfig({
  compatibilityDate: '2026-07-09',
  runtimeConfig: {
    appDisplayName: process.env.APP_DISPLAY_NAME || '',
    sub2apiBaseUrl: process.env.SUB2API_BASE_URL || '',
    sub2apiKey: process.env.SUB2API_KEY || '',
  },
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },
})
