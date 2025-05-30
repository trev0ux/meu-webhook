// server/api/utils/message-detector.ts
import configJson from '../../../config/keywords.json'

/**
 * Detecta se uma mensagem se refere a uma receita/ganho ou despesa/gasto
 * @param message Mensagem do usuário
 * @returns true se for receita/ganho, false se for despesa/gasto
 */
export function detectIsIncome(message: string, profile: string): boolean {
  const lowerMessage = message.toLowerCase()

  let incomeKeywords = []

  if (profile === 'pessoa_fisica') {
    incomeKeywords = configJson.classificacao.palavrasChaveGanhosPF
  } else {
    incomeKeywords = configJson.classificacao.palavrasChaveGanhosPJ
  }

  // Verificar se alguma palavra-chave de receita está presente
  return incomeKeywords.some((keyword) => lowerMessage.includes(keyword))
}

export function detectIsExpense(message: string, profile: string): boolean {
  const lowerMessage = message.toLowerCase()

  let incomeKeywords = []

  if (profile === 'pessoa_fisica') {
    incomeKeywords = configJson.classificacao.palavrasChavePF
  } else {
    incomeKeywords = configJson.classificacao.palavrasChavePJ
  }

  // Verificar se alguma palavra-chave de receita está presente
  return incomeKeywords.some((keyword) => lowerMessage.includes(keyword))
}
/**
 * Detecta o contexto da mensagem - se é pessoal (PF) ou empresarial (PJ)
 * Útil para mensagens ambíguas
 * @param message Mensagem do usuário
 * @returns 'PJ', 'PF' ou 'INDEFINIDO'
 */
export function detectContext(message: string): 'PJ' | 'PF' | 'INDEFINIDO' {
  const lowerMessage = message.toLowerCase()

  // Palavras-chave que sugerem contexto PJ
  const pjKeywords = configJson.classificacao.palavrasChavePJ
  const pfKeywords = configJson.classificacao.palavrasChavePF

  // Contar ocorrências de palavras-chave
  const pjCount = pjKeywords.filter((keyword) => lowerMessage.includes(keyword)).length
  const pfCount = pfKeywords.filter((keyword) => lowerMessage.includes(keyword)).length

  // Determinar contexto baseado na contagem de palavras-chave
  if (pjCount > pfCount) return 'PJ'
  if (pfCount > pjCount) return 'PF'
  return 'INDEFINIDO'
}

/**
 * Detecta se a mensagem é sobre uma despesa fixa ou variável
 * @param message Mensagem do usuário
 * @returns 'FIXA', 'VARIÁVEL' ou 'INDEFINIDO'
 */
export function detectExpenseType(message: string): 'FIXA' | 'VARIÁVEL' | 'INDEFINIDO' {
  const lowerMessage = message.toLowerCase()

  // Palavras-chave que sugerem despesa fixa
  const fixedKeywords = [
    'mensal',
    'mensalidade',
    'assinatura',
    'recorrente',
    'fixo',
    'todos os meses',
    'sempre',
    'plano',
    'conta fixa',
    'parcela',
    'prestação',
    'financiamento',
    'aluguel',
    'condomínio',
    'iptu',
    'água',
    'luz',
    'telefone',
    'internet',
    'escola',
    'faculdade',
    'curso',
    'academia',
    'netflix',
    'spotify'
  ]

  // Palavras-chave que sugerem despesa variável
  const variableKeywords = [
    'eventual',
    'pontual',
    'único',
    'uma vez',
    'inesperado',
    'imprevisto',
    'hoje',
    'ontem',
    'esta semana',
    'nesta vez',
    'excepcionalmente',
    'restaurante',
    'compra',
    'cinema',
    'lazer',
    'viagem',
    'presente',
    'emergência',
    'conserto',
    'reparo',
    'médico',
    'remédio'
  ]

  // Contar ocorrências de palavras-chave
  const fixedCount = fixedKeywords.filter((keyword) => lowerMessage.includes(keyword)).length
  const variableCount = variableKeywords.filter((keyword) => lowerMessage.includes(keyword)).length

  // Determinar tipo de despesa baseado na contagem de palavras-chave
  if (fixedCount > variableCount) return 'FIXA'
  if (variableCount > fixedCount) return 'VARIÁVEL'
  return 'INDEFINIDO'
}
