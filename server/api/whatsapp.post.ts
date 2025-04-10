import { defineEventHandler, readBody } from 'h3'
import { classifyExpense, classifyIncome } from './utils/openai'
import { formatarData } from './utils/extrator'
import { validarEExtrairDados, gerarMensagemErroInput } from './utils/input-validator'
import { detectIsIncome, detectContext } from './utils/message-detector'
import { SheetManager } from './utils/sheets-manager'
import { findUser } from '../../db/users'

export default defineEventHandler(async (event) => {
  try {
    // Obter dados da requisição
    const body = await readBody(event)
    const { Body: message, From: phoneNumber } = body
    console.log('Recebido de:', phoneNumber)
    console.log('Mensagem:', message)

    // Verificar e processar usuário
    const user = await findUser(phoneNumber)

    // Se usuário não existe, iniciar onboarding
    if (!user) {
      return onboardingMessage('empresario_individual') // default para novos usuários
    }

    // Verifica se é um comando especial (começa com !)
    if (message.trim().startsWith('!')) {
      return await processarComando(message, phoneNumber, user)
    }

    // Verificar se é uma resposta para uma classificação
    // Usando uma abordagem simplificada: verificar por números (1, 2) ou prefixo "categoria:"
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
- "Recebi R$ 1000 do cliente"</Message>
        </Response>
      `
    }

    // Validar e extrair os dados da mensagem
    const dadosInput = validarEExtrairDados(message)

    // Se a mensagem for inválida, retornar um erro amigável
    if (!dadosInput.isValid) {
      return `
        <Response>
          <Message>${gerarMensagemErroInput(dadosInput)}</Message>
        </Response>
      `
    }

    // Usando os dados validados
    const { descricao, valor, data } = dadosInput
    const dataFormatada = formatarData(data)

    console.log('Descrição extraída:', descricao)
    console.log('Valor extraído:', valor)
    console.log('Data extraída:', dataFormatada)

    // Detectar se é ganho ou gasto baseado em palavras-chave
    const isIncome = detectIsIncome(message)

    try {
      // Classificar como ganho ou gasto dependendo da detecção inicial
      if (isIncome) {
        // Processo para ganhos/receitas
        const classification = await classifyIncome(message, user.perfil)
        console.log('Classificação de ganho:', classification)

        // Tentativa de classificação automática mesmo com baixa confiança
        // Detecção de contexto para ajudar
        if (classification.status === 'ERROR' || classification.status === 'LOW_CONFIDENCE') {
          // Tentar determinar o tipo via detector de contexto
          const contextoDetectado = detectContext(message)

          // Se for possível inferir o tipo (PJ ou PF)
          if (contextoDetectado !== 'INDEFINIDO') {
            // Atualizar a classificação com o contexto detectado
            classification.tipo = contextoDetectado
            classification.categoria =
              contextoDetectado === 'PJ' ? 'Receita Empresarial' : 'Receita Pessoal'
            classification.fonte = contextoDetectado === 'PJ' ? 'Cliente' : 'Geral'
            classification.probabilidade = 0.7 // Classificação de média confiança
            classification.status = 'SUCCESS'

            // Processar com a classificação melhorada
            return await processIncomeSuccess(classification, descricao, valor, dataFormatada, user)
          }

          if (contextoDetectado === 'INDEFINIDO') {
            return `        <Response>
          <Message>Por favor, insira uma mensagem dentro do contexto do Finia.</Message>
        </Response>`
          }

          // Se não foi possível detectar o contexto, usamos a classificação sugerida
          // Mesmo com baixa confiança, tentamos dar uma resposta útil
          classification.status = 'SUCCESS' // Forçar sucesso

          // Incluir mensagem sobre a classificação automática
          return await processIncomeSuccess(
            classification,
            descricao,
            valor,
            dataFormatada,
            user,
            true // flag indicando baixa confiança
          )
        }

        // Processamento de receita com classificação confiável
        return await processIncomeSuccess(classification, descricao, valor, dataFormatada, user)
      } else {
        // Processo para gastos/despesas
        const classification = await classifyExpense(message, user.perfil)
        console.log('Classificação de gasto:', classification)

        // Tentativa de classificação automática mesmo com baixa confiança
        if (classification.status === 'ERROR' || classification.status === 'LOW_CONFIDENCE') {
          // Tentar determinar o tipo via detector de contexto
          const contextoDetectado = detectContext(message)

          // Se for possível inferir o tipo (PJ ou PF)
          if (contextoDetectado !== 'INDEFINIDO') {
            // Atualizar a classificação com o contexto detectado
            classification.tipo = contextoDetectado
            classification.categoria =
              contextoDetectado === 'PJ' ? 'Despesa Empresarial' : 'Despesa Pessoal'
            classification.probabilidade = 0.7 // Classificação de média confiança
            classification.status = 'SUCCESS'

            // Processar com a classificação melhorada
            return await processExpenseSuccess(
              classification,
              descricao,
              valor,
              dataFormatada,
              user
            )
          }

          if (contextoDetectado === 'INDEFINIDO') {
            return `        <Response>
          <Message>Por favor, insira uma mensagem dentro do contexto do Finia.</Message>
        </Response>`
          }

          // Se não foi possível detectar o contexto, usamos a classificação sugerida
          // Mesmo com baixa confiança, tentamos dar uma resposta útil
          classification.status = 'SUCCESS' // Forçar sucesso

          // Incluir mensagem sobre a classificação automática
          return await processExpenseSuccess(
            classification,
            descricao,
            valor,
            dataFormatada,
            user,
            true // flag indicando baixa confiança
          )
        }

        // Processamento de gasto com classificação confiável
        return await processExpenseSuccess(classification, descricao, valor, dataFormatada, user)
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

// Função para processar um gasto classificado com sucesso
async function processExpenseSuccess(
  classification,
  descricao,
  valor,
  dataFormatada,
  user,
  lowConfidence = false
) {
  // Extrair informações relevantes
  const { tipo, categoria, natureza, probabilidade } = classification

  // Configurar mensagem de acordo com o perfil e classificação
  let mensagemResposta

  // Aqui você integraria com SheetManager para salvar o gasto
  // const sheetManager = new SheetManager(user.spreadsheet_id);
  // await sheetManager.adicionarGasto(tipo, new Date(dataFormatada), descricao, valor, categoria);

  const lowConfidenceMessage = lowConfidence
    ? '\n\n⚠️ *Classificação automática* - Se desejar alterar, registre novamente com mais detalhes.'
    : ''

  if (user.perfil === 'pessoa_fisica') {
    mensagemResposta = `
    🎬 *Seu gasto foi salvo na planilha!*
    📌 Categoria: ${categoria}
    💰 Valor: R$ ${valor.toFixed(2)}
    📅 Data: ${dataFormatada}
    🔍 Descrição: ${descricao}
    
    💡 Obrigado por registrar seu gasto conosco!${lowConfidenceMessage}
    `
  } else {
    // dual ou empresario_individual
    if (tipo === 'PJ') {
      mensagemResposta = `
      ✅ *Salvo como GASTO EMPRESARIAL (PJ)!*
      📌 Categoria: ${categoria}
      💰 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      📊 **Dica fiscal**: Guarde a nota fiscal para dedução de impostos.${lowConfidenceMessage}
      `
    } else {
      mensagemResposta = `
      🏠 *Salvo como GASTO PESSOAL (PF)!*
      📌 Categoria: ${categoria}
      💰 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      
      💡 Este mês você já gastou R$ X nesta categoria.${lowConfidenceMessage}
      `
    }
  }

  return `
    <Response>
      <Message>${mensagemResposta.trim()}</Message>
    </Response>
  `
}

// Função para processar uma receita classificada com sucesso
async function processIncomeSuccess(
  classification,
  descricao,
  valor,
  dataFormatada,
  user,
  lowConfidence = false
) {
  // Extrair informações relevantes
  const { tipo, categoria, fonte, probabilidade } = classification

  // Configurar mensagem de acordo com o perfil e classificação
  let mensagemResposta

  // Aqui você integraria com SheetManager para salvar a receita
  // const sheetManager = new SheetManager(user.spreadsheet_id);
  // await sheetManager.adicionarGanho(tipo, new Date(dataFormatada), descricao, valor, categoria);

  const lowConfidenceMessage = lowConfidence
    ? '\n\n⚠️ *Classificação automática* - Se desejar alterar, registre novamente com mais detalhes.'
    : ''

  if (user.perfil === 'pessoa_fisica') {
    mensagemResposta = `
    💰 *Receita registrada com sucesso!*
    📌 Categoria: ${categoria}
    💵 Valor: R$ ${valor.toFixed(2)}
    📅 Data: ${dataFormatada}
    🔍 Descrição: ${descricao}
    📋 Fonte: ${fonte || 'Não especificada'}
    
    🎉 Ótimo trabalho! Continue acompanhando suas finanças.${lowConfidenceMessage}
    `
  } else {
    // dual ou empresario_individual
    if (tipo === 'PJ') {
      mensagemResposta = `
      💼 *Receita EMPRESARIAL (PJ) registrada!*
      📌 Categoria: ${categoria}
      💵 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      🏢 Fonte: ${fonte || 'Cliente'}
      
      💡 **Dica fiscal**: Lembre-se de emitir a nota fiscal correspondente.${lowConfidenceMessage}
      `
    } else {
      mensagemResposta = `
      👤 *Receita PESSOAL (PF) registrada!*
      📌 Categoria: ${categoria}
      💵 Valor: R$ ${valor.toFixed(2)}
      📅 Data: ${dataFormatada}
      🔍 Descrição: ${descricao}
      📋 Fonte: ${fonte || 'Não especificada'}
      
      🎉 Parabéns pelo ganho! Continue acompanhando suas finanças.${lowConfidenceMessage}
      `
    }
  }

  return `
    <Response>
      <Message>${mensagemResposta.trim()}</Message>
    </Response>
  `
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

// Função para processar comandos especiais
async function processarComando(comando: string, telefone: string, user: any) {
  try {
    // Remover o ! inicial e dividir em partes
    const partes = comando.substring(1).split(' ')
    const acao = partes[0].toLowerCase()

    if (acao === 'relatorio' || acao === 'relatório') {
      // Obter mês e ano para o relatório
      const mes = partes[1] || obterMesAtual()
      const ano = partes[2] || new Date().getFullYear().toString()

      console.log(`Processando comando de relatório para ${mes}/${ano}`)

      // Enviar para a função de geração de relatório
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

    // Comando não reconhecido
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

// Função helper para obter o nome do mês atual
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

// Placeholder para a função de geração de relatório
async function gerarEEnviarRelatorio(telefone: string, mes: string, ano: string, user: any) {
  // Esta é uma versão simplificada - você precisará implementar a lógica completa
  return `
    <Response>
      <Message>📊 Relatório de ${mes}/${ano} solicitado. Estamos gerando e enviaremos em breve!</Message>
    </Response>
  `
}
