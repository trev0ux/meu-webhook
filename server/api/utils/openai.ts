// server/utils/openai.ts
import OpenAI from 'openai'
import promptConfig from '../../prompts/prompts'
import configJson from '../../../config/keywords.json'

let openaiInstance: OpenAI | null = null

export function getOpenAIClient() {
  if (openaiInstance) return openaiInstance

  const config = useRuntimeConfig()

  // Novo método de inicialização para OpenAI v4+
  openaiInstance = new OpenAI({
    apiKey: config.openaiApiKey
  })

  return openaiInstance
}

function parseCleanJSON(inputString) {
  const cleanedString = inputString
    .replace(/^.*?`?json\s*/, '')
    .replace(/`*$/, '')
    .trim()

  return JSON.parse(cleanedString)
}

// server/utils/openai.ts - Função melhorada para incluir origem/contexto

/**
 * Classifica uma transação financeira de forma unificada, identificando:
 * - Se é gasto ou ganho
 * - Se é PJ ou PF
 * - A categoria específica
 * - A origem/contexto da transação
 *
 * @param message Mensagem contendo a transação financeira
 * @param profile Perfil do usuário ('pessoa_fisica' ou 'empresario_individual')
 * @returns Objeto com a classificação completa
 */
export async function classifyTransaction(message: string, profile: string) {
  const openai = getOpenAIClient()

  // Mesclar informações dos prompts de despesa e receita
  const keywordsPJ = configJson.classificacao.palavrasChavePJ.join(', ')
  const keywordsPF = configJson.classificacao.palavrasChavePF.join(', ')
  const keywordsGanhosPJ = configJson.classificacao.palavrasChaveGanhosPJ.join(', ')
  const keywordsGanhosPF = configJson.classificacao.palavrasChaveGanhosPF.join(', ')
  const categoriasPJ = configJson.classificacao.categoriasPJ.join(', ')
  const categoriasPF = configJson.classificacao.categoriasPF.join(', ')

  // Sistema prompt para classificação unificada, incluindo origem/contexto
  const systemPrompt = `
  Você é um assistente financeiro especializado em classificar transações financeiras.
  
  INSTRUÇÕES IMPORTANTES:
  1. Determine se a transação é um GASTO (saída de dinheiro) ou GANHO (entrada de dinheiro).
  2. Classifique como PJ (empresarial) ou PF (pessoal).
  3. Atribua uma categoria específica.
  4. Extraia a ORIGEM ou CONTEXTO da transação. 
     - Para gastos: de onde veio o produto/serviço ou onde foi realizado (ex: restaurante, loja, fornecedor)
     - Para ganhos: quem pagou, de onde veio o dinheiro (ex: cliente específico, empresa, banco)
  5. Forneça um nível de confiança na sua classificação.
  
  CONTEXTO - PALAVRAS-CHAVE:
  
  PARA GASTOS PJ (EMPRESARIAIS):
  ${keywordsPJ}
  
  PARA GASTOS PF (PESSOAIS):
  ${keywordsPF}
  
  PARA GANHOS PJ (EMPRESARIAIS):
  ${keywordsGanhosPJ}
  
  PARA GANHOS PF (PESSOAIS):
  ${keywordsGanhosPF}
  
  CATEGORIAS COMUNS:
  - PJ: ${categoriasPJ}
  - PF: ${categoriasPF}
  - Receitas PJ: Prestação de Serviços, Vendas, Comissões, Licenciamentos, Consultoria
  - Receitas PF: Salário, Freelance, Dividendos, Rendimentos, Aluguéis, Reembolsos
  
  REGRAS DE CLASSIFICAÇÃO:
  1. Para GASTOS vs. GANHOS:
     - Gastos: envolvem pagamento, compra, despesa, saída de dinheiro
     - Ganhos: envolvem recebimento, venda, receita, entrada de dinheiro
  
  2. Para PJ vs. PF:
     - PJ: relacionado à atividade profissional, negócio, empresa, clientes
     - PF: relacionado a consumo pessoal, lazer, família, itens domésticos
     
  3. Para ORIGEM/CONTEXTO:
     - Seja específico, extraindo exatamente o nome do estabelecimento, cliente, empresa ou fonte
     - Preserve a grafia original de nomes próprios mencionados
     - Se não houver menção específica, infira a partir do contexto (ex: "Almoço" → "Restaurante")
     - Para ganhos sem origem clara, use termos como "Cliente não especificado" ou "Fonte não identificada"
  `

  // Prompt do usuário para classificação unificada com origem
  const userPrompt = `
  Classifique a seguinte transação financeira, indicando:
  1. Se é um GASTO (saída de dinheiro) ou GANHO (entrada de dinheiro)
  2. Se é PJ (empresarial) ou PF (pessoal)
  3. A categoria específica
  4. A origem/contexto da transação (estabelecimento, cliente, fonte do dinheiro)
  5. O nível de confiança
  
  Responda APENAS em formato JSON:
  {
    "natureza": "GASTO" ou "GANHO",
    "tipo": "PJ" ou "PF",
    "categoria": "nome da categoria específica",
    "origem": "fonte/contexto/estabelecimento/cliente específico",
    "probabilidade": número entre 0 e 1 indicando sua confiança
  }
  
  Transação a classificar: "${message}"
  `

  try {
    // Fazer a chamada para a API da OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })

    const responseContent = response.choices[0].message?.content || '{}'

    try {
      // Tentar fazer o parse do JSON retornado
      const classification = parseCleanJSON(responseContent)

      // Determinar se temos confiança suficiente na classificação
      if (classification.probabilidade <= 0.8) {
        return {
          ...classification,
          status: 'LOW_CONFIDENCE',
          extractedInfo: extractExpenseInfo(message)
        }
      }

      return {
        ...classification,
        status: 'SUCCESS'
      }
    } catch (parseError) {
      console.error('Error processing AI response:', parseError)
      return {
        status: 'ERROR',
        errorType: 'PARSE_ERROR',
        message,
        extractedInfo: extractExpenseInfo(message)
      }
    }
  } catch (error) {
    console.error('Erro na chamada à OpenAI:', error)
    return {
      status: 'ERROR',
      errorType: 'API_ERROR',
      message,
      extractedInfo: extractExpenseInfo(message)
    }
  }
}

// Função auxiliar melhorada para extrair informações básicas
function extractExpenseInfo(message: string) {
  const valueRegex = /R\$\s?(\d+(?:[,.]\d+)?)/i
  const valueMatch = message.match(valueRegex)
  const value = valueMatch ? valueMatch[1] : '?'

  // Tentar extrair possível origem/contexto
  let description = message.replace(valueRegex, '').trim()
  let origin = ''

  // Padrões comuns que indicam origem
  const originPatterns = [
    /\bde\s+([^,\.]+)/i, // "Recebi de Cliente ABC"
    /\bpara\s+([^,\.]+)/i, // "Pagamento para Fornecedor XYZ"
    /\bdo\s+([^,\.]+)/i, // "Dinheiro do Cliente"
    /\bda\s+([^,\.]+)/i, // "Pagamento da Empresa"
    /\bno\s+([^,\.]+)/i, // "Compra no Mercado"
    /\bem\s+([^,\.]+)/i, // "Jantar em Restaurante"
    /\bcom\s+([^,\.]+)/i // "Reunião com Cliente"
  ]

  for (const pattern of originPatterns) {
    const match = description.match(pattern)
    if (match && match[1]) {
      origin = match[1].trim()
      break
    }
  }

  return { value, description, origin }
}
