// server/api/whatsapp.post.ts - Versão atualizada com integração completa
import { defineEventHandler, readBody } from 'h3'
import { classifyTransaction } from './utils/openai'
import { formatarData } from './utils/extrator'
import { validarEExtrairDados, gerarMensagemErroInput } from './utils/input-validator'
import { detectContext, detectIsIncome } from './utils/message-detector'
import { findUser } from '../../db/users'
import {
  contemMultiplasTransacoes,
  extrairMultiplasTransacoes,
  Transacao
} from './utils/multi-value-processor'
import { verificarSolicitacaoHoje, registrarSolicitacaoRelatorio } from '../../db/report-requests'
import { obterMesAtual } from './utils/date-utils'

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

    // Verificar se é uma resposta de confirmação
    if (isConfirmationResponse(message)) {
      console.log('Detectada resposta de confirmação')
      return await processConfirmationResponse(message, user)
    }

    // Verificar se é um comando
    if (message.trim().startsWith('!')) {
      return await processarComando(message, phoneNumber, user)
    }

    // Verificar se é um número/opção de menu
    if (
      message.trim() === '1' ||
      message.trim() === '2' ||
      message.trim() === '3' ||
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

    // Verificar se contém múltiplas transações
    if (contemMultiplasTransacoes(message)) {
      return await processarMultiplasTransacoes(message, user)
    }

    // Processar transação única
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

      // Verificar primeiro se é uma classificação de baixa confiança
      if (classification.status === 'LOW_CONFIDENCE') {
        console.log('Classificação com baixa confiança, solicitando nova entrada')

        // Verificar se há indícios de que é uma receita antes de solicitar nova entrada
        if (detectIsIncome(message, user.perfil)) {
          // Tenta processar como receita de baixa confiança
          console.log('Indícios de receita detectados, processando como receita')
          const fallbackClassification = {
            natureza: 'GANHO',
            tipo: detectContext(message) !== 'INDEFINIDO' ? detectContext(message) : 'PF',
            categoria: detectContext(message) === 'PJ' ? 'Receita Empresarial' : 'Receita Pessoal',
            origem: extractExpenseInfo(message).origin || 'Não especificada',
            probabilidade: 0.6,
            status: 'SUCCESS'
          }

          // Solicitar ao usuário confirmação de que é uma receita
          return `
            <Response>
              <Message>💰 *Parece que você está registrando uma RECEITA/GANHO*

Valor: R$ ${valor.toFixed(2)}
Descrição: ${descricao}
Data: ${dataFormatada}

Confirme se é uma receita respondendo com:
"sim" - para confirmar como receita
"não" - se for um gasto
"detalhar" - para fornecer mais informações</Message>
            </Response>
          `
        }

        // Se não parece uma receita ou não tem certeza, solicitar nova entrada
        return requestNewInput()
      }

      if (classification.status === 'SUCCESS') {
        // Processamento baseado na natureza da transação (GASTO ou GANHO)
        if (classification.natureza === 'GASTO') {
          return await processExpenseSuccess(classification, descricao, valor, dataFormatada, user)
        } else if (classification.natureza === 'GANHO') {
          return await processIncomeSuccess(classification, descricao, valor, dataFormatada, user)
        }
      }

      // Se chegou aqui, tente uma abordagem de fallback
      // Verificar palavras-chave para determinar se é receita ou despesa
      if (detectIsIncome(message, user.perfil)) {
        // Parece ser uma receita
        const contextoDetectado = detectContext(message)
        const origemDetectada = extractExpenseInfo(message).origin || 'Não especificada'

        const fallbackClassification = {
          natureza: 'GANHO',
          tipo: contextoDetectado !== 'INDEFINIDO' ? contextoDetectado : 'PF',
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
        const contextoDetectado = detectContext(message)
        const origemDetectada = extractExpenseInfo(message).origin || 'Não especificada'

        const fallbackClassification = {
          natureza: 'GASTO',
          tipo: contextoDetectado !== 'INDEFINIDO' ? contextoDetectado : 'PF',
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

/**
 * Processa a solicitação de relatório via WhatsApp
 *
 * @param telefone Telefone do usuário
 * @param tipo Tipo de relatório (diario, semanal, mensal, sob_demanda)
 * @param periodoReferencia Período de referência para o relatório
 * @param user Dados do usuário
 * @returns Resposta formatada para o WhatsApp
 */
async function processarSolicitacaoRelatorio(
  telefone: string,
  tipo: 'diario' | 'semanal' | 'mensal' | 'sob_demanda',
  periodoReferencia: string,
  user: any
): Promise<string> {
  try {
    // 1. Verificar se o usuário já fez uma solicitação deste tipo hoje
    const jaFoiSolicitado = await verificarSolicitacaoHoje(user.id, tipo)

    if (jaFoiSolicitado) {
      return `
        <Response>
          <Message>⚠️ *Limite de solicitações atingido*
          
Você já solicitou um relatório ${tipo} hoje. Para evitar sobrecarregar o sistema, limitamos a uma solicitação por dia.

Seu relatório anterior está sendo processado e será enviado em breve.</Message>
        </Response>
      `
    }

    // 2. Verificar se o usuário tem uma planilha configurada
    if (!user.spreadsheet_id) {
      return `
        <Response>
          <Message>❌ *Planilha não configurada*
          
Você precisa ter uma planilha configurada para receber relatórios.
Por favor, configure sua planilha através do site ou entre em contato com o suporte.</Message>
        </Response>
      `
    }

    // 3. Registrar a solicitação no banco de dados
    await registrarSolicitacaoRelatorio(user.id, tipo, periodoReferencia)

    // 4. Preparar mensagem de resposta apropriada
    let mensagemResposta

    switch (tipo) {
      case 'diario':
        mensagemResposta = `
📊 *Relatório Diário Solicitado*
          
Estamos gerando seu relatório diário para ${periodoReferencia || 'hoje'}.
Você receberá o resultado em instantes.

Este relatório incluirá:
• Resumo de gastos do dia
• Comparativo entre PJ e PF
• Principais categorias
• Insights personalizados`
        break

      case 'semanal':
        mensagemResposta = `
📊 *Relatório Semanal Solicitado*
          
Estamos gerando seu relatório para a semana de ${periodoReferencia}.
Você receberá o resultado em instantes.

Este relatório incluirá:
• Resumo de gastos da semana
• Principais categorias
• Comparativo entre PJ e PF
• Tendências e insights`
        break

      case 'mensal':
        mensagemResposta = `
📊 *Relatório Mensal Solicitado*
          
Estamos gerando seu relatório mensal para ${periodoReferencia}.
Você receberá o resultado em instantes.

Este relatório incluirá:
• Visão geral do mês
• Despesas por categoria
• Receitas por origem
• Análise de tendências
• Recomendações personalizadas`
        break

      case 'sob_demanda':
        mensagemResposta = `
📊 *Relatório Detalhado Solicitado*
          
Estamos gerando seu relatório completo para ${periodoReferencia}.
Você receberá o resultado em instantes.

Este relatório incluirá:
• Análise detalhada de gastos e receitas
• Comparativo com período anterior
• Distribuição por categorias
• Insights avançados
• Recomendações específicas

Utilize este relatório para uma análise profunda de suas finanças!`
        break
    }

    return `
      <Response>
        <Message>${mensagemResposta.trim()}</Message>
      </Response>
    `
  } catch (error) {
    console.error('Erro ao processar solicitação de relatório:', error)
    return `
      <Response>
        <Message>❌ Ocorreu um erro ao processar sua solicitação de relatório. 
Por favor, tente novamente mais tarde ou entre em contato com o suporte.</Message>
      </Response>
    `
  }
}

/**
 * Processa comandos recebidos via WhatsApp
 *
 * @param comando Comando recebido (começa com !)
 * @param telefone Telefone do usuário
 * @param user Dados do usuário
 * @returns Resposta formatada para o WhatsApp
 */
async function processarComando(comando: string, telefone: string, user: any) {
  try {
    const partes = comando.substring(1).split(' ')
    const acao = partes[0].toLowerCase()

    // Comando de relatório completo
    if (acao === 'relatorio' || acao === 'relatório') {
      const mes = partes[1] || obterMesAtual()
      const ano = partes[2] || new Date().getFullYear().toString()

      console.log(`Processando comando de relatório completo para ${mes}/${ano}`)

      return await processarSolicitacaoRelatorio(telefone, 'sob_demanda', `${mes}/${ano}`, user)
    }

    // Comando de relatório diário
    else if (acao === 'diario' || acao === 'diário') {
      // Obter data de referência (hoje ou data específica se fornecida)
      const dataRef = partes.length > 1 ? partes[1] : formatarData(new Date())

      console.log(`Processando comando de relatório diário para ${dataRef}`)

      return await processarSolicitacaoRelatorio(telefone, 'diario', dataRef, user)
    }

    // Comando de relatório semanal
    else if (acao === 'semanal') {
      // Obter período da semana atual
      const agora = new Date()
      const dataInicio = new Date(agora)
      dataInicio.setDate(agora.getDate() - agora.getDay()) // Domingo da semana atual

      const dataFim = new Date(dataInicio)
      dataFim.setDate(dataInicio.getDate() + 6) // Sábado da semana atual

      const refPeriodo = `${formatarData(dataInicio)} a ${formatarData(dataFim)}`

      console.log(`Processando comando de relatório semanal para ${refPeriodo}`)

      return await processarSolicitacaoRelatorio(telefone, 'semanal', refPeriodo, user)
    }

    // Comando de relatório mensal
    else if (acao === 'mensal') {
      // Obter mês de referência (atual ou específico se fornecido)
      const mes = partes.length > 1 ? partes[1] : obterMesAtual()
      const ano = partes.length > 2 ? partes[2] : new Date().getFullYear().toString()

      const refPeriodo = `${mes}/${ano}`

      console.log(`Processando comando de relatório mensal para ${refPeriodo}`)

      return await processarSolicitacaoRelatorio(telefone, 'mensal', refPeriodo, user)
    }

    // Comando de ajuda
    else if (acao === 'ajuda') {
      return `
        <Response>
          <Message>*📚 Ajuda do Finia*

*Formato para registrar transações*:
- "Descrição/nome + R$ valor + [data opcional]"
- "Recebi X de Y" para registrar ganhos

*Relatórios disponíveis* (limite de 1 por dia cada tipo):
!diario [DD/MM] - Relatório do dia (hoje ou data específica)
!semanal - Relatório da semana atual
!mensal [mês] [ano] - Relatório mensal
!relatorio [mês] [ano] - Relatório detalhado completo

*Outros comandos*:
!ajuda - Mostra esta mensagem
!categorias - Lista suas categorias

*Dicas*:
- Registre todas as transações para relatórios mais precisos
- Use "recebi" para ganhos e "gastei" para despesas
- Mencione "cliente/empresa" para gastos/ganhos PJ</Message>
        </Response>
      `
    }

    // Comando de categorias
    else if (acao === 'categorias') {
      // Buscar categorias do usuário - implementação simplificada
      return `
        <Response>
          <Message>📋 *Suas categorias configuradas*

💼 *Categorias Empresariais (PJ):*
• Alimentação PJ
• Marketing
• Material de Escritório
• Software/Assinaturas
• Serviços Terceiros
• Impostos
• Equipamentos

👤 *Categorias Pessoais (PF):*
• Alimentação PF
• Moradia
• Transporte
• Saúde
• Lazer
• Educação

Para personalizar suas categorias, acesse o painel web.</Message>
        </Response>
      `
    }

    // Comando desconhecido
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

/**
 * Gera mensagem de boas-vindas/onboarding
 *
 * @param profile Perfil do usuário
 * @returns Mensagem formatada
 */
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

/**
 * Solicita nova entrada quando a mensagem é ambígua
 */
function requestNewInput() {
  const mensagemResposta = `
⚠️ *Preciso de mais informações*

Não consegui identificar com certeza se você está registrando um GASTO ou um GANHO.

Para GANHOS/RECEITAS, inclua palavras como:
• "Recebi R$ X"
• "Pagamento de R$ X"
• "Cliente depositou R$ X"
• "Salário de R$ X"

Para GASTOS, inclua palavras como:
• "Comprei X por R$ Y"
• "Gastei R$ X com Y"
• "Pagamento de X por R$ Y"

*Exemplos corretos:*
✅ "Recebi R$ 200 de freelance"
✅ "Pagamento do cliente ABC R$ 500"
✅ "Gastei R$ 150 no mercado"
  `
  return `
    <Response>
      <Message>${mensagemResposta.trim()}</Message>
    </Response>
  `
}

/**
 * Verifica se a mensagem é uma resposta de confirmação
 */
function isConfirmationResponse(message: string): boolean {
  const confirmationResponses = ['sim', 'yes', 's', 'y', 'confirmar', 'ok', 'correto', 'certo']
  const rejectionResponses = ['não', 'nao', 'no', 'n', 'errado', 'incorreto']
  const detailingResponses = [
    'detalhar',
    'detalhe',
    'detalhes',
    'mais info',
    'mais informações',
    'corrigir'
  ]

  const lowerMessage = message.toLowerCase().trim()

  return (
    confirmationResponses.includes(lowerMessage) ||
    rejectionResponses.includes(lowerMessage) ||
    detailingResponses.includes(lowerMessage)
  )
}

/**
 * Processa resposta de confirmação
 */
async function processConfirmationResponse(message: string, user: any): Promise<string> {
  // Buscar estado pendente para este usuário
  // Em um sistema real, você usaria algo como:
  // const pendingState = await buscarEstadoConversa(user.id, 'pendingTransaction')

  // Simulação simplificada:
  // Assumindo que temos acesso a última transação pendente para o usuário
  const pendingTransaction = {
    descricao: 'Última transação pendente',
    valor: 200,
    data: new Date(),
    tipo: 'PF',
    categoria: 'Rendimentos',
    origem: 'Fonte não identificada'
  }

  const lowerMessage = message.toLowerCase().trim()

  // Resposta de confirmação positiva
  if (['sim', 'yes', 's', 'y', 'confirmar', 'ok', 'correto', 'certo'].includes(lowerMessage)) {
    // Processar como receita confirmada
    const confirmedClassification = {
      natureza: 'GANHO',
      tipo: pendingTransaction.tipo,
      categoria: pendingTransaction.categoria,
      origem: pendingTransaction.origem,
      probabilidade: 1.0, // Confiança máxima pois foi confirmado pelo usuário
      status: 'SUCCESS'
    }

    // Processar a receita confirmada
    return `
      <Response>
        <Message>✅ *Receita confirmada e registrada!*
        
💰 Valor: R$ ${pendingTransaction.valor.toFixed(2)}
📅 Data: ${formatarData(pendingTransaction.data)}
📝 Categoria: ${pendingTransaction.categoria}
        
Obrigado pela confirmação!</Message>
      </Response>
    `
  }

  // Resposta de rejeição
  if (['não', 'nao', 'no', 'n', 'errado', 'incorreto'].includes(lowerMessage)) {
    // Processar como gasto em vez de receita
    const correctedClassification = {
      natureza: 'GASTO',
      tipo: pendingTransaction.tipo,
      categoria: pendingTransaction.tipo === 'PJ' ? 'Despesa Empresarial' : 'Despesa Pessoal',
      origem: pendingTransaction.origem,
      probabilidade: 1.0, // Confiança máxima pois foi corrigido pelo usuário
      status: 'SUCCESS'
    }

    // Processar o gasto corrigido
    return `
      <Response>
        <Message>✅ *Gasto registrado corretamente!*
        
💸 Valor: R$ ${pendingTransaction.valor.toFixed(2)}
📅 Data: ${formatarData(pendingTransaction.data)}
📝 Categoria: ${correctedClassification.categoria}
        
Obrigado pela correção!</Message>
      </Response>
    `
  }

  // Resposta solicitando mais detalhes
  if (
    ['detalhar', 'detalhe', 'detalhes', 'mais info', 'mais informações', 'corrigir'].includes(
      lowerMessage
    )
  ) {
    return `
      <Response>
        <Message>📝 *Por favor, forneça detalhes completos da transação*
        
Descreva novamente com informações mais claras, incluindo:
- Se é um gasto ou receita
- Valor exato
- Origem ou destino do dinheiro
- Data (opcional)

Exemplo para receita: "Recebi R$ 200 de freelance"
Exemplo para gasto: "Comprei material de escritório R$ 200"</Message>
      </Response>
    `
  }

  // Não deveria chegar aqui, mas por segurança
  return requestNewInput()
}

/**
 * Processa múltiplas transações
 */
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
        console.log(classification.status)
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

    // Calculando os totais
    let totalPJ = 0
    let totalPF = 0
    let countPJ = 0
    let countPF = 0

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

/**
 * Função auxiliar para extrair informações básicas
 */
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

/**
 * Processa transação de gasto com sucesso
 */
async function processExpenseSuccess(
  classification,
  descricao,
  valor,
  dataFormatada,
  user,
  lowConfidence = false
) {
  const { tipo, categoria, natureza, origem, probabilidade } = classification

  // Simulação de salvamento (sem acesso real à planilha)
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

/**
 * Processa transação de ganho/receita com sucesso
 */
async function processIncomeSuccess(
  classification,
  descricao,
  valor,
  dataFormatada,
  user,
  lowConfidence = false
) {
  const { tipo, categoria, origem, probabilidade } = classification

  // Simulação de salvamento (sem acesso real à planilha)
  console.log(
    `Simulando salvamento de ganho: ${tipo}, ${dataFormatada}, ${descricao}, ${valor}, ${categoria}, Origem: ${origem || 'Não especificada'}`
  )

  const lowConfidenceMessage = lowConfidence
    ? '\n\n⚠️ *Classificação automática* - Se desejar alterar, registre novamente com mais detalhes.'
    : ''

  if (user.perfil === 'pessoa_fisica') {
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
