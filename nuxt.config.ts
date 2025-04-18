// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY,
    googleSheetId: process.env.GOOGLE_SHEET_ID,
    postgresUser: process.env.POSTGRES_USER,
    postgresHost: process.env.POSTGRES_HOST,
    postgresDb: process.env.POSTGRES_DB,
    postgresPassword: process.env.POSTGRES_PASSWORD,
    postgresPort: process.env.POSTGRES_PORT,
    public: {
      apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3002'
    }
  },

  vite: {
    server: {
      hmr: {
        // Permitir hosts externos (incluindo ngrok)
        clientPort: 24678,
        port: 24678
      }
    }
  },
  
  // Configuração de desenvolvimento
  devServer: {
    // Permitir conexões de qualquer host
    port: 3002,
    host: '0.0.0.0' // Isso é importante para permitir acessos externos
  },
  compatibilityDate: '2025-04-07'
})