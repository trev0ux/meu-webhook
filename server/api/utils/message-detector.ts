// server/api/utils/message-detector.ts

/**
 * Detecta se uma mensagem se refere a uma receita/ganho ou despesa/gasto
 * @param message Mensagem do usuário
 * @returns true se for receita/ganho, false se for despesa/gasto
 */
export function detectIsIncome(message: string): boolean {
  const lowerMessage = message.toLowerCase()

  // Palavras-chave que indicam receita/ganho
  const incomeKeywords = [
    'recebi',
    'recebimento',
    'pagamento',
    'pagou',
    'transferiu',
    'depósito',
    'entrou',
    'caiu',
    'salário',
    'salario',
    'freelance',
    'honorário',
    'ganho',
    'fatura',
    'venda',
    'rendimento',
    'aluguel recebido',
    'dividendo',
    'comissão',
    'comissao',
    'royalties',
    'prestação serviço',
    'contrato',
    'projeto',
    'freela',
    'pix recebido',
    'transferência recebida',
    'adiantamento',
    'cliente pagou',
    'recebeu',
    'reembolso',
    'retorno',
    'lucro',
    'pró-labore'
  ]

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
  const pjKeywords = [
    'empresa',
    'cliente',
    'cnpj',
    'nota fiscal',
    'contrato',
    'projeto',
    'serviço',
    'consultoria',
    'fornecedor',
    'business',
    'corporativo',
    'comercial',
    'b2b',
    'reunião de negócios',
    'empreendimento',
    'escritório',
    'jurídica',
    'pj',
    'profissional',
    'negócio',
    'empreendedor',
    'mei',
    'empresarial',
    'prestação',
    'consultor'
  ]

  // Palavras-chave que sugerem contexto PF
  const pfKeywords = [
    'pessoal',
    'casa',
    'família',
    'filhos',
    'supermercado',
    'lazer',
    'restaurante',
    'cinema',
    'shopping',
    'academia',
    'roupas',
    'celular pessoal',
    'faculdade',
    'férias',
    'hobby',
    'presente',
    'física',
    'pf',
    'particular',
    'privado',
    'doméstico',
    'residencial',
    'apartamento',
    'condomínio',
    'iptu'
  ]

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
