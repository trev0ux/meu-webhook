// server/middleware/twilio-verificacao.ts
import { defineEventHandler, getQuery, getRequestURL } from 'h3'
import { validateRequest } from 'twilio'

export default defineEventHandler(async (event) => {
  // Só verificar na rota do webhook WhatsApp
  if (!event.node.req.url?.includes('/api/whatsapp')) {
    return
  }
  
  try {
    const config = useRuntimeConfig()
    
    // Obter a assinatura do Twilio
    const signature = getRequestHeader(event, 'X-Twilio-Signature') || ''
    
    // URL completa da requisição
    const url = `${config.public.apiBaseUrl}/api/whatsapp`
    
    // Em ambiente de desenvolvimento, podemos pular a validação
    if (process.env.NODE_ENV !== 'production') {
      console.log('Validação Twilio desativada em ambiente de desenvolvimento')
      return
    }
    
    // Importante: NÃO leia o corpo aqui, pois ele será necessário no handler
    // Em vez disso, verificaremos apenas URL e assinatura
    
    /* 
    // Abordagem 1: Validação simplificada sem o corpo
    console.log('Validação simplificada em desenvolvimento - apenas checando se a assinatura existe')
    if (!signature) {
      console.error('Assinatura Twilio não encontrada')
      if (process.env.NODE_ENV === 'production') {
        return createError({
          statusCode: 403,
          statusMessage: 'Assinatura Twilio ausente'
        })
      }
    }
    */
    
    // Abordagem 2: Desativar completamente a validação
    console.log('Validação Twilio desativada temporariamente')
    
  } catch (error) {
    console.error('Erro na validação Twilio:', error)
    if (process.env.NODE_ENV === 'production') {
      return createError({
        statusCode: 403,
        statusMessage: 'Erro na validação de segurança'
      })
    }
  }
})