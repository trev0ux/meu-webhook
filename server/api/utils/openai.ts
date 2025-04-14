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
// Melhoria na função classifyTransaction em server/api/utils/openai.ts
export async function classifyTransaction(message: string, profile: string) {
  const openai = getOpenAIClient()

  // Mesclar informações dos prompts de despesa e receita
  const keywordsPJ = configJson.classificacao.palavrasChavePJ.join(', ')
  const keywordsPF = configJson.classificacao.palavrasChavePF.join(', ')
  const keywordsGanhosPJ = configJson.classificacao.palavrasChaveGanhosPJ.join(', ')
  const keywordsGanhosPF = configJson.classificacao.palavrasChaveGanhosPF.join(', ')
  const categoriasPJ = configJson.classificacao.categoriasPJ.join(', ')
  const categoriasPF = configJson.classificacao.categoriasPF.join(', ')

  // Sistema prompt reforçado para reconhecimento de ganhos
  const systemPrompt = `
  Você é um assistente financeiro especializado em classificar transações financeiras, com foco especial em distinguir entre GASTOS e GANHOS.
  
  INSTRUÇÕES IMPORTANTES:
  1. Determine se a transação é um GASTO (saída de dinheiro) ou GANHO (entrada de dinheiro).
     - GANHOS são identificados por palavras como: recebi, pagamento, entrou, ganhei, depósito, vendas
     - GASTOS são identificados por palavras como: comprei, paguei, gastei, compra
  
  2. Classifique como PJ (empresarial) ou PF (pessoal).
  3. Atribua uma categoria específica.
  4. Extraia a ORIGEM ou CONTEXTO da transação. 
     - Para gastos: de onde veio o produto/serviço ou onde foi realizado
     - Para ganhos: quem pagou, de onde veio o dinheiro
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
     - REGRA CRÍTICA: Se a mensagem contém apenas um valor (ex: "R$ 200") sem contexto claro, NÃO classifique automaticamente.
       Neste caso, indique baixa confiança (probabilidade < 0.4).
     - Gastos: envolvem pagamento, compra, despesa, saída de dinheiro
     - Ganhos: envolvem recebimento, venda, receita, entrada de dinheiro, termos como "recebi", "pagamento", "depósito"
  
  2. Para PJ vs. PF:
     - PJ: relacionado à atividade profissional, negócio, empresa, clientes
     - PF: relacionado a consumo pessoal, lazer, família, itens domésticos
  `

  // Prompt do usuário melhorado
  const userPrompt = `
  Classifique a seguinte transação financeira, indicando:
  1. Se é um GASTO (saída de dinheiro) ou GANHO (entrada de dinheiro)
  2. Se é PJ (empresarial) ou PF (pessoal)
  3. A categoria específica
  4. A origem/contexto da transação
  5. O nível de confiança
  
  Se a mensagem for muito curta ou ambígua para classificação precisa, defina uma probabilidade baixa (<0.4).
  
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
