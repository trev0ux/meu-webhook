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

function defineIfNeedClassification(message, response?) {
  let classification

  try {
    classification = parseCleanJSON(response)
  } catch (parseError) {
    console.error('Error processing AI response:', parseError)
    return {
      status: 'ERROR',
      errorType: 'PARSE_ERROR',
      message,
      extractedInfo: extractExpenseInfo(message)
    }
  }

  if (classification.probabilidade <= 0.7) {
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
}

export async function classifyExpense(message: string, profile: string) {
  const openai = getOpenAIClient()

  const promptTemplates = promptConfig.classificacao[profile]

  const keywordsPJ = configJson.classificacao.palavrasChavePJ.join(', ')
  const keywordsPF = configJson.classificacao.palavrasChavePF.join(', ')
  const categoriesPJ = configJson.classificacao.categoriasPJ.join(', ')
  const categoriesPF = configJson.classificacao.categoriasPF.join(', ')
  const fixedKeyword = configJson.classificacao.despesasFixas.palavrasChave.join(', ')
  const dynamicKeyword = configJson.classificacao.despesasVariaveis.palavrasChave.join(', ')

  let systemContent = promptTemplates.system
    .replace('{palavrasChavePJ}', keywordsPJ)
    .replace('{palavrasChavePF}', keywordsPF)
    .replace('{categoriasPJ}', categoriesPJ)
    .replace('{categoriasPF}', categoriesPF)
    .replace('{palavrasChaveFixas}', fixedKeyword)
    .replace('{palavrasChaveVariaveis}', dynamicKeyword)

  let userContent = promptTemplates.user.replace('{mensagem}', message)

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ]
    })

    const responseFiltered = response.choices[0].message?.content || '{}'

    return defineIfNeedClassification(message, responseFiltered)
  } catch (error) {
    console.error('Erro ao classificar gasto:', error)
  }
}

function extractExpenseInfo(message: string) {
  const valueRegex = /R\$\s?(\d+(?:[,.]\d+)?)/i
  const valueMatch = message.match(valueRegex)
  const value = valueMatch ? valueMatch[1] : '?'

  const description = message.replace(valueRegex, '').trim()

  return { value, description }
}
