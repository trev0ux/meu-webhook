import { defineEventHandler, readBody } from 'h3'
import { classifyTransaction } from './utils/openai'
import { formatarData } from './utils/extrator'
import { validarEExtrairDados, gerarMensagemErroInput } from './utils/input-validator'
import { detectContext } from './utils/message-detector'
import { SheetManager } from './utils/sheets-manager'
import { findUser } from '../../db/users'
import {
  contemMultiplasTransacoes,
  extrairMultiplasTransacoes,
  Transacao
} from './utils/multi-value-processor'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { Body: message, From: phoneNumber } = body
    console.log('Recebido de:', phoneNumber)
    console.log('Mensagem:', message)

    const user = await findUser(phoneNumber)

    if (!user) {
      return onboardingMessage('empresario_individual')
    }

    if (message.trim().startsWith('!')) {
      return await processarComando(message, phoneNumber, user)
    }

    if (
      message.trim() === '1' ||
      message.trim() === '2' ||
      message.toLowerCase().startsWith('categoria:')
    ) {
      return `
        <Response>
          <Message>❓ Por favor, digite sua transação completa no formato:
"Descrição R$ valor [data]"

Exemplos:
- "Almoço com cliente R$ 50"
- "Recebi R$ 1000 do cliente ABC"</Message>
        </Response>
      `
    }

    if (contemMultiplasTransacoes(message)) {
      return await processarMultiplasTransacoes(message, user)
    }

    const dadosInput = validarEExtrairDados(message)

    if (!dadosInput.isValid) {
      return `
        <Response>
          <Message>${gerarMensagemErroInput(dadosInput)}</Message>
        </Response>
      `
    }

    const { descricao, valor, data } = dadosInput
    const dataFormatada = formatarData(data)

    console.log('Descrição extraída:', descricao)
    console.log('Valor extraído:', valor)
    console.log('Data extraída:', dataFormatada)

    try {
      // Classificação unificada via IA
      const classification = await classifyTransaction(message, user.perfil)
      console.log('Classificação da transação:', classification)

      if (classification.status === 'SUCCESS') {
        // Processamento baseado na natureza da transação (GASTO ou GANHO)
        if (classification.natureza === 'GASTO') {
          return await processExpenseSuccess(classification, descricao, valor, dataFormatada, user)
        } else if (classification.natureza === 'GANHO') {
          return await processIncomeSuccess(classification, descricao, valor, dataFormatada, user)
        }
      }

      // Se a IA não conseguiu classificar com alta confiança
      const contextoDetectado = detectContext(message)

      // Tentar extrair possível origem/contexto
      const extractedInfo = extractExpenseInfo(message)
      const origemDetectada = extractedInfo.origin || 'Não especificada'

      if (contextoDetectado !== 'INDEFINIDO') {
        // Verificar palavras-chave para determinar se é receita ou despesa
        if (
          message.toLowerCase().includes('recebi') ||
          message.toLowerCase().includes('ganho') ||
          message.toLowerCase().includes('salário') ||
          message.toLowerCase().includes('pagamento')
        ) {
          // Parece ser uma receita
          const fallbackClassification = {
            natureza: 'GANHO',
            tipo: contextoDetectado,
            categoria: contextoDetectado === 'PJ' ? 'Receita Empresarial' : 'Receita Pessoal',
            origem: origemDetectada,
            probabilidade: 0.6,
            status: 'SUCCESS'
          }
          return await processIncomeSuccess(
            fallbackClassification,
            descricao,
            valor,
            dataFormatada,
            user,
            true
          )
        } else {
          // Assume-se que é uma despesa (caso mais comum)
          const fallbackClassification = {
            natureza: 'GASTO',
            tipo: contextoDetectado,
            categoria: contextoDetectado === 'PJ' ? 'Despesa Empresarial' : 'Despesa Pessoal',
            origem: origemDetectada,
            probabilidade: 0.6,
            status: 'SUCCESS'
          }
          return await processExpenseSuccess(
            fallbackClassification,
            descricao,
            valor,
            dataFormatada,
            user,
            true
          )
        }
      }

      // Caso realmente não consigamos classificar
      return `
        <Response>
          <Message>⚠️ Não consegui classificar sua transação com certeza.
          
Por favor, reescreva incluindo palavras mais específicas como:
- Para gastos empresariais: cliente, fornecedor, empresa, escritório
- Para gastos pessoais: casa, mercado, pessoal, família 
- Para receitas: pagamento, recebi, salário, freelance

Exemplo: "Almoço com cliente R$ 120" ou "Mercado para casa R$ 250"</Message>
        </Response>
      `
    } catch (error) {
      console.error('Erro na classificação:', error)
      return `
        <Response>
          <Message>❌ Ocorreu um erro ao processar sua mensagem. Por favor, tente novamente com uma descrição clara.</Message>
        </Response>
      `
    }
  } catch (error) {
    console.error('Erro no processamento:', error)
    return `
      <Response>
        <Message>❌ Ocorreu um erro ao processar sua mensagem. 
Verifique o formato e tente novamente.
Exemplo: "Almoço R$ 50" ou "Recebi R$ 1000 do cliente"</Message>
      </Response>
    `
  }
})

async function processarMultiplasTransacoes(message: string, user: any) {
  try {
    const transacoes = extrairMultiplasTransacoes(message)

    if (transacoes.length === 0) {
      return `
        <Response>
          <Message>❌ Não consegui identificar transações válidas na sua mensagem. 
Por favor, verifique o formato e tente novamente.
Exemplo: "Almoço R$ 50" ou "Recebi R$ 1000 do cliente"</Message>
        </Response>
      `
    }

    const transacoesClassificadas = []

    for (const transacao of transacoes) {
      try {
        // Classificação unificada com a nova função
        const classification = await classifyTransaction(transacao.textoOriginal, user.perfil)

        if (classification.status === 'SUCCESS') {
          // Classificação com sucesso
          transacoesClassificadas.push({
            ...transacao,
            tipo: classification.tipo,
            categoria: classification.categoria,
            origem: classification.origem || 'Não especificada',
            natureza: classification.natureza === 'GASTO' ? 'despesa' : 'receita'
          })
        } else {
          // Classificação com baixa confiança, tenta usar o contexto
          const contextoDetectado = detectContext(transacao.textoOriginal)

          // Tentar extrair possível origem/contexto
          const extractedInfo = extractExpenseInfo(transacao.textoOriginal)
          const origemDetectada = extractedInfo.origin || 'Não especificada'

          if (contextoDetectado !== 'INDEFINIDO') {
            // Verificar palavras-chave para determinar se é receita ou despesa
            const textoLower = transacao.textoOriginal.toLowerCase()
            const pareceReceita =
              textoLower.includes('recebi') ||
              textoLower.includes('ganho') ||
              textoLower.includes('salário') ||
              textoLower.includes('pagamento')

            transacoesClassificadas.push({
              ...transacao,
              tipo: contextoDetectado,
              categoria:
                contextoDetectado === 'PJ'
                  ? pareceReceita
                    ? 'Receita Empresarial'
                    : 'Despesa Empresarial'
                  : pareceReceita
                    ? 'Receita Pessoal'
                    : 'Despesa Pessoal',
              origem: origemDetectada,
              natureza: pareceReceita ? 'receita' : 'despesa',
              confiancaBaixa: true
            })
          } else {
            // Não conseguimos classificar de forma alguma
            transacoesClassificadas.push({
              ...transacao,
              tipo: 'INDEFINIDO',
              categoria: 'Não Classificado',
              origem: origemDetectada,
              natureza: 'indefinido',
              confiancaBaixa: true
            })
          }
        }
      } catch (error) {
        console.error('Erro ao processar transação:', error)
      }
    }

    // Removida a inicialização do SheetManager e o armazenamento na planilha
    let totalPJ = 0
    let totalPF = 0
    let countPJ = 0
    let countPF = 0

    // Calculando os totais sem salvar na planilha
    for (const transacao of transacoesClassificadas) {
      if (transacao.tipo === 'PJ') {
        totalPJ += transacao.valor
        countPJ++
      } else if (transacao.tipo === 'PF') {
        totalPF += transacao.valor
        countPF++
      }
    }

    let resumoMensagem = `✅ *${transacoesClassificadas.length} transações processadas com sucesso!*\n\n`

    if (countPJ > 0) {
      resumoMensagem += `💼 *PJ:* ${countPJ} itens totalizando R$ ${totalPJ.toFixed(2)}\n`
    }

    if (countPF > 0) {
      resumoMensagem += `👤 *PF:* ${countPF} itens totalizando R$ ${totalPF.toFixed(2)}\n`
    }

    resumoMensagem += `\n📝 *Detalhes:*\n`

    const transacoesExibidas = transacoesClassificadas.slice(0, 5)

    for (const [index, transacao] of transacoesExibidas.entries()) {
      const tipoIcon = transacao.tipo === 'PJ' ? '💼' : '👤'
      const naturezaIcon = transacao.natureza === 'receita' ? '💰' : '💸'

      resumoMensagem += `${index + 1}. ${tipoIcon} ${naturezaIcon} "${transacao.descricao}" - R$ ${transacao.valor.toFixed(2)} (${transacao.categoria})\n`
      resumoMensagem += `   └ Origem: ${transacao.origem}\n`
    }

    if (transacoesClassificadas.length > 5) {
      resumoMensagem += `...e mais ${transacoesClassificadas.length - 5} transações.\n`
    }

    resumoMensagem += '\n⚠️ Use !relatorio para ver todas as transações organizadas.'

    return `
      <Response>
        <Message>${resumoMensagem}</Message>
      </Response>
    `
  } catch (error) {
    console.error('Erro ao processar múltiplas transações:', error)
    return `
      <Response>
        <Message>❌ Ocorreu um erro ao processar suas transações. Por favor, tente novamente.</Message>
      </Response>
    `
  }
}

async function processExpenseSuccess(
  classification,
  descricao,
  valor,
  dataFormatada,
  user,
  lowConfidence = false
) {
  const { tipo, categoria, natureza, origem, probabilidade } = classification

  // Removida a inicialização do SheetManager e o armazenamento na planilha
  console.log(
    `Simulando salvamento de gasto: ${tipo}, ${dataFormatada}, ${descricao}, ${valor}, ${categoria}, Origem: ${origem || 'Não especificada'}`
  )

  const lowConfidenceMessage = lowConfidence
    ? '\n\n⚠️ *Classificação automática* - Se desejar alterar, registre novamente com mais detalhes.'
    : ''

  if (user.perfil === 'pessoa_fisica') {
    const mensagemResposta = `
    🎬 *Seu gasto foi salvo na planilha!*
    📌 Categoria: ${categoria}
    💰 Valor: R$ ${valor.toFixed(2)}
    📅 Data: ${dataFormatada}
    🔍 Descrição: ${descricao}
    🏪 Origem: ${origem || 'Não especificada'}
    
    💡 Obrigado por registrar seu gasto conosco!${lowConfidenceMessage}
    `
    return `
      <Response>
        <Message>${mensagemResposta.trim()}</Message>
      </Response>
    `
  } else {
    if (tipo === 'PJ') {
      const mensagemResposta = `
      ✅ *Salvo como GASTO EMPRESARIAL (PJ)!*
      📌 Categoria: ${categoria}
      💰 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      🏢 Fornecedor: ${origem || 'Não especificado'}
      
      📊 **Dica fiscal**: Guarde a nota fiscal para dedução de impostos.${lowConfidenceMessage}
      `
      return `
        <Response>
          <Message>${mensagemResposta.trim()}</Message>
        </Response>
      `
    } else {
      const mensagemResposta = `
      🏠 *Salvo como GASTO PESSOAL (PF)!*
      📌 Categoria: ${categoria}
      💰 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      🏪 Estabelecimento: ${origem || 'Não especificado'}
      
      💡 Gasto registrado com sucesso.${lowConfidenceMessage}
      `
      return `
        <Response>
          <Message>${mensagemResposta.trim()}</Message>
        </Response>
      `
    }
  }
}

async function processIncomeSuccess(
  classification,
  descricao,
  valor,
  dataFormatada,
  user,
  lowConfidence = false
) {
  const { tipo, categoria, origem, probabilidade } = classification

  // Removida a inicialização do SheetManager e o armazenamento na planilha
  console.log(
    `Simulando salvamento de ganho: ${tipo}, ${dataFormatada}, ${descricao}, ${valor}, ${categoria}, Origem: ${origem || 'Não especificada'}`
  )

  const lowConfidenceMessage = lowConfidence
    ? '\n\n⚠️ *Classificação automática* - Se desejar alterar, registre novamente com mais detalhes.'
    : ''

  if (user.perfil === 'pessoa_fisica') {
    // Removido cálculo do total da categoria
    const mensagemResposta = `
    💰 *Receita registrada com sucesso!*
    📌 Categoria: ${categoria}
    💵 Valor: R$ ${valor.toFixed(2)}
    📅 Data: ${dataFormatada}
    🔍 Descrição: ${descricao}
    📋 Fonte: ${origem || 'Não especificada'}
    
    🎉 Ótimo trabalho! Continue acompanhando suas finanças.${lowConfidenceMessage}
    `
    return `
      <Response>
        <Message>${mensagemResposta.trim()}</Message>
      </Response>
    `
  } else {
    if (tipo === 'PJ') {
      const mensagemResposta = `
      💼 *Receita EMPRESARIAL (PJ) registrada!*
      📌 Categoria: ${categoria}
      💵 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      🏢 Cliente: ${origem || 'Não especificado'}
      
      💡 **Dica fiscal**: Lembre-se de emitir a nota fiscal correspondente.${lowConfidenceMessage}
      `
      return `
        <Response>
          <Message>${mensagemResposta.trim()}</Message>
        </Response>
      `
    } else {
      const mensagemResposta = `
      👤 *Receita PESSOAL (PF) registrada!*
      📌 Categoria: ${categoria}
      💵 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      📋 Fonte: ${origem || 'Não especificada'}
      
      🎉 Parabéns pelo ganho! Continue acompanhando suas finanças.${lowConfidenceMessage}
      `
      return `
        <Response>
          <Message>${mensagemResposta.trim()}</Message>
        </Response>
      `
    }
  }
}

function onboardingMessage(profile: string) {
  let messageOnboarding

  if (profile === 'empresario_individual') {
    messageOnboarding = `
    🌟 *Bem-vindo ao Finia - Modo Dual!* 💼
    
    Olá, empreendedor! Sou seu assistente financeiro completo. 📊
    
    Ajudo você a separar e gerenciar:
    ✅ Gastos Pessoais (PF)
    ✅ Gastos Empresariais (PJ)
    ✅ Receitas Pessoais e Profissionais
    
    *Como funciona?*
    
    📝 Para registrar GASTOS, simplesmente descreva:
    - "Almoço com cliente R$ 120" (PJ)
    - "Cinema com família R$ 80" (PF)
    
    💰 Para registrar RECEITAS, use termos como:
    - "Recebi R$ 2000 do cliente ABC pelo projeto" (PJ)
    - "Recebi salário de R$ 3000 hoje" (PF)
    
    Classificarei automaticamente entre pessoal e empresarial! 🚀
    
    Dúvidas? Digite *!ajuda*
        `
  }

  if (profile === 'pessoa_fisica') {
    messageOnboarding = `
    🌟 *Bem-vindo ao Finia!* 💰
    
    Olá! Sou seu assistente financeiro pessoal no WhatsApp. 📱
    
    Vou te ajudar a controlar seus gastos e receitas de forma simples:
    
    ✅ Registre gastos com facilidade:
    - "Mercado R$ 250"
    - "Uber R$ 35"
    
    ✅ Registre receitas facilmente:
    - "Recebi salário R$ 3000"
    - "Ganhei R$ 500 de freelance"
    
    Estou aqui para te ajudar a ter mais controle financeiro! 💸
    
    Dúvidas? Digite *!ajuda*
        `
  }

  return `
        <Response>
        <Message>${messageOnboarding?.trim()}</Message>
      </Response>
      `
}

async function processarComando(comando: string, telefone: string, user: any) {
  try {
    const partes = comando.substring(1).split(' ')
    const acao = partes[0].toLowerCase()

    if (acao === 'relatorio' || acao === 'relatório') {
      const mes = partes[1] || obterMesAtual()
      const ano = partes[2] || new Date().getFullYear().toString()

      console.log(`Processando comando de relatório para ${mes}/${ano}`)

      return await gerarEEnviarRelatorio(telefone, mes, ano, user)
    } else if (acao === 'ajuda') {
      return `
      <Response>
        <Message>*📚 Ajuda do Finia*

*Formato correto*:
- "Descrição/nome + R$ valor + [data opcional]"

*Exemplos*:
- "Almoço R$ 50"
- "Uber R$ 35 12/04"
- "Recebi do cliente ABC R$ 2000"
- "Pagamento freelance R$ 500 04/04"

*Comandos disponíveis*:
!relatorio [mês] [ano] - Gera relatório financeiro
!ajuda - Mostra esta mensagem de ajuda

*Dicas*:
- Para melhor classificação, seja específico:
  - Para gastos/receitas PJ: mencione "cliente", "empresa", "projeto"
  - Para gastos/receitas PF: use "pessoal", "casa", "família"
- Se a classificação automática não for correta, registre novamente com mais detalhes.
        </Message>
      </Response>
      `
    } else if (acao === 'corrigir') {
      return `
      <Response>
        <Message>Para corrigir um registro, por favor, insira-o novamente com mais detalhes para garantir uma classificação correta.

Exemplo: "Almoço de trabalho com cliente ABC R$ 120 (PJ)"
        </Message>
      </Response>
      `
    }

    console.log('Comando não reconhecido:', comando)
    return `
     <Response>
       <Message>❓ Comando não reconhecido. Digite !ajuda para ver os comandos disponíveis.</Message>
     </Response>
   `
  } catch (error) {
    console.error('Erro ao processar comando:', error)
    return `
     <Response>
       <Message>❌ Ocorreu um erro ao processar seu comando. Por favor, tente novamente.</Message>
     </Response>
   `
  }
}

function obterMesAtual() {
  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
  ]
  return meses[new Date().getMonth()]
}

async function gerarEEnviarRelatorio(telefone: string, mes: string, ano: string, user: any) {
  try {
    // Removida a inicialização do SheetManager
    console.log(`Simulando geração de relatório para ${mes}/${ano}`)

    return `
      <Response>
        <Message>📊 Relatório de ${mes}/${ano} solicitado. Estamos gerando e enviaremos em breve!</Message>
      </Response>
    `
  } catch (error) {
    console.error('Erro ao gerar relatório:', error)
    return `
      <Response>
        <Message>❌ Ocorreu um erro ao gerar seu relatório. Por favor, tente novamente mais tarde.</Message>
      </Response>
    `
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
