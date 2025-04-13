// server/api/whatsapp.post.ts
import { defineEventHandler, readBody } from 'h3'
import { findUser, atualizarUsuario, criarCodigoTemporario } from '../../db/users'
import { obterConfiguracoes } from './utils/sheets'
import { SheetManager } from './utils/sheets-manager'
import { formatarData } from './utils/extrator'
import { validarEExtrairDados, gerarMensagemErroInput } from './utils/input-validator'
import {
  contemMultiplasTransacoes,
  extrairMultiplasTransacoes,
  formatarResumoTransacoes
} from './utils/multi-value-processor'
import { processarEtapaOnboarding } from './utils/onboarding-manager'
import { buscarEstadoConversa, salvarEstadoConversa, limparEstadoConversa } from '../../db/users'
import twilio from 'twilio'

// Status possíveis para um usuário
enum UserStatus {
  NEW = 'new', // Usuário não cadastrado
  PENDING_SETUP = 'pending_setup', // Cadastrado, mas sem configuração completa
  ONBOARDING = 'onboarding', // Em processo de onboarding no WhatsApp
  COMPLETE = 'complete' // Totalmente configurado
}

// Interface para padronizar o resultado da classificação
interface ClassificationResult {
  natureza: 'GASTO' | 'GANHO'
  tipo: 'PJ' | 'PF'
  categoria: string
  origem: string
  probabilidade: number
  status: 'SUCCESS' | 'LOW_CONFIDENCE' | 'ERROR'
  errorMessage?: string
}

/**
 * Handler principal para processar mensagens do WhatsApp
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  try {
    // Obter dados da mensagem recebida
    const body = await readBody(event)
    const { Body: message, From: phoneNumber } = body

    console.log('Mensagem recebida:', { from: phoneNumber, body: message })

    // Normalizar o número de telefone (remover prefixo whatsapp:)
    const normalizedPhone = phoneNumber.replace('whatsapp:', '')

    // Obter configurações do sistema
    //const config = await obterConfiguracoes()
    const siteUrl = config.public?.siteUrl || 'https://finia.app'

    // Processar comando de código/reinício independente do status
    if (message.trim().toLowerCase() === 'code' || message.trim().toLowerCase() === 'código') {
      return await handleCodeRequest(normalizedPhone, siteUrl)
    }
    if (
      message.trim().toLowerCase() === 'restart' ||
      message.trim().toLowerCase() === 'reiniciar'
    ) {
      return await handleRestartRequest(normalizedPhone)
    }

    // Verificar o status do usuário
    const userStatus = await verificarStatusUsuario(normalizedPhone)

    // Redirecionar para o handler apropriado com base no status
    switch (userStatus.status) {
      case UserStatus.NEW:
        return await handleNewUser(normalizedPhone, siteUrl)

      case UserStatus.PENDING_SETUP:
        return await handlePendingSetupUser(userStatus.user, siteUrl)

      case UserStatus.ONBOARDING:
        return await handleOnboardingUser(message, userStatus.user)

      case UserStatus.COMPLETE:
        return await handleCompleteUser(message, userStatus.user)

      default:
        return handleError('Status de usuário desconhecido')
    }
  } catch (error) {
    console.error('Erro no processamento:', error)
    return handleError('Ocorreu um erro ao processar sua mensagem')
  }
})

/**
 * Verifica o status atual do usuário com base no número de telefone
 */
async function verificarStatusUsuario(phone: string): Promise<{ status: UserStatus; user?: any }> {
  try {
    // Buscar usuário no banco de dados
    const user = await findUser(phone)

    // Se o usuário não existe, é um novo usuário
    if (!user) {
      return { status: UserStatus.NEW }
    }

    // Verificar se o usuário tem configuração completa
    if (!user.spreadsheet_id || !user.perfil) {
      return { status: UserStatus.PENDING_SETUP, user }
    }

    // Verificar se o onboarding pelo WhatsApp foi concluído
    if (!user.onboarding_completo) {
      // Verificar se há um estado de onboarding em andamento
      const estadoOnboarding = await buscarEstadoConversa(user.id, 'onboarding')
      if (estadoOnboarding) {
        return { status: UserStatus.ONBOARDING, user }
      }

      // Se não tem estado, mas também não tem onboarding completo,
      // iniciar onboarding
      return { status: UserStatus.ONBOARDING, user }
    }

    // Usuário completamente configurado
    return { status: UserStatus.COMPLETE, user }
  } catch (error) {
    console.error('Erro ao verificar status do usuário:', error)
    throw error
  }
}

/**
 * Handler para novos usuários (não cadastrados)
 */
async function handleNewUser(phone: string, siteUrl: string): Promise<string> {
  // Gerar código temporário para cadastro no site
  const code = await criarCodigoTemporario(phone)

  return formatarRespostaTwilio(`
🌟 *Bem-vindo ao Finia!* 🌟

Para começarmos, você precisa criar sua conta no nosso site:

🔗 ${siteUrl}/cadastro?phone=${encodeURIComponent(phone)}

Use este código para verificação rápida:
\`${code}\`
(válido por 15 minutos)

No site, você poderá:
1️⃣ Escolher seu perfil (Pessoa Física ou Empreendedor)
2️⃣ Autorizar conexão com planilha Google
3️⃣ Configurar suas categorias financeiras iniciais

Após completar o cadastro, volte aqui para continuar! 📱✨
  `)
}

/**
 * Handler para usuários com configuração pendente
 */
async function handlePendingSetupUser(user: any, siteUrl: string): Promise<string> {
  // Verificar o que está faltando na configuração
  if (!user.perfil) {
    return formatarRespostaTwilio(`
Olá${user.nome ? ', ' + user.nome : ''}! 👋

Você já iniciou seu cadastro, mas ainda precisa escolher seu perfil no site:

🔗 ${siteUrl}/perfil?user=${user.id}

Por favor, selecione se você é:
• *Pessoa Física* - para controle financeiro pessoal
• *Empreendedor* - para gerenciar finanças pessoais e do negócio

Após completar esta etapa, volte para continuarmos! 📊
    `)
  } else if (!user.spreadsheet_id) {
    return formatarRespostaTwilio(`
Olá${user.nome ? ', ' + user.nome : ''}! 👋

Você já escolheu seu perfil (${user.perfil === 'pessoa_fisica' ? 'Pessoa Física' : 'Empreendedor'}), 
mas ainda precisa conectar sua planilha:

🔗 ${siteUrl}/planilha?user=${user.id}

Esta etapa é essencial para que o Finia possa salvar suas transações automaticamente.

Após conectar sua planilha, volte para continuarmos! 📊
    `)
  } else {
    return formatarRespostaTwilio(`
Olá${user.nome ? ', ' + user.nome : ''}! 👋

Você precisa completar sua configuração no site antes de continuar:

🔗 ${siteUrl}/configuracao?user=${user.id}

Após completar todas as etapas, volte para continuarmos! 📊
    `)
  }
}

/**
 * Handler para usuários em processo de onboarding
 */
async function handleOnboardingUser(message: string, user: any): Promise<string> {
  try {
    // Processar a etapa atual do onboarding
    const resultado = await processarEtapaOnboarding(message, user.id)

    // Se o onboarding foi concluído, atualizar o usuário
    if (resultado.completo) {
      await atualizarUsuario(user.id, { onboarding_completo: true })
    }

    return formatarRespostaTwilio(resultado.mensagem)
  } catch (error) {
    console.error('Erro no onboarding:', error)
    return handleError('Ocorreu um erro durante a configuração')
  }
}

/**
 * Handler para usuários completamente configurados
 */
async function handleCompleteUser(message: string, user: any): Promise<string> {
  try {
    // Verificar se há um estado de conversa ativo (ex: correção em andamento)
    const estadoConversa = await buscarEstadoConversa(user.id, 'conversa')
    if (estadoConversa && estadoConversa.tipo !== 'onboarding') {
      return await processarEstadoConversa(message, user, estadoConversa)
    }

    // Verificar se é um comando especial (começa com !)
    if (message.trim().startsWith('!')) {
      return await processarComando(message, user)
    }

    // Verificar se é um comando de correção
    if (
      message.trim().toLowerCase().startsWith('corrigir') ||
      message.trim().toLowerCase().startsWith('reclassificar')
    ) {
      return await iniciarCorrecao(message, user)
    }

    // Verificar se contém múltiplas transações
    if (contemMultiplasTransacoes(message)) {
      return await processarMultiplasTransacoes(message, user)
    }

    // Processar uma transação única
    return await processarTransacao(message, user)
  } catch (error) {
    console.error('Erro ao processar mensagem:', error)
    return handleError('Ocorreu um erro ao processar sua mensagem')
  }
}

/**
 * Processar uma transação única
 */
async function processarTransacao(message: string, user: any): Promise<string> {
  // Validar e extrair dados básicos da mensagem
  const dadosInput = validarEExtrairDados(message)

  // Se a mensagem é inválida, retornar erro amigável
  if (!dadosInput.isValid) {
    return formatarRespostaTwilio(gerarMensagemErroInput(dadosInput))
  }

  // Dados extraídos da mensagem
  const { descricao, valor, data } = dadosInput
  const dataFormatada = formatarData(data)

  try {
    // Classificar a transação usando IA
    const classificacao = await classifyTransaction(message, user.perfil, user.preferencias)
    console.log('Classificação:', classificacao)

    if (classificacao.status === 'SUCCESS') {
      // Alta confiança na classificação - processar diretamente
      if (classificacao.natureza === 'GANHO') {
        return await salvarGanho(classificacao, descricao, valor, dataFormatada, user)
      } else {
        return await salvarGasto(classificacao, descricao, valor, dataFormatada, user)
      }
    } else {
      // Baixa confiança - pedir confirmação ao usuário
      return await solicitarConfirmacaoClassificacao(
        classificacao,
        descricao,
        valor,
        dataFormatada,
        user
      )
    }
  } catch (error) {
    console.error('Erro ao classificar transação:', error)
    return handleError('Não foi possível classificar sua transação')
  }
}

/**
 * Solicita confirmação ao usuário para uma classificação com baixa confiança
 */
async function solicitarConfirmacaoClassificacao(
  classificacao: ClassificationResult,
  descricao: string,
  valor: number,
  dataFormatada: string,
  user: any
): Promise<string> {
  // Salvar estado da conversa para retomar após a resposta
  const dadosEstado = {
    tipo: 'confirmacao_classificacao',
    classificacao,
    transacao: {
      descricao,
      valor,
      data: dataFormatada
    }
  }

  await salvarEstadoConversa(user.id, 'conversa', dadosEstado)

  // Montar mensagem de confirmação baseada no perfil do usuário
  if (user.perfil === 'pessoa_fisica') {
    // Para pessoa física, só precisa confirmar a categoria
    return formatarRespostaTwilio(`
📝 *Confirme a classificação:*

Descrição: ${descricao}
Valor: R$ ${valor.toFixed(2)}
Data: ${dataFormatada}

Categoria sugerida: *${classificacao.categoria}*
Tipo: *${classificacao.natureza === 'GANHO' ? 'Receita' : 'Despesa'}*

Esta classificação está correta?
1️⃣ Sim, está correta
2️⃣ Não, quero corrigir
    `)
  } else {
    // Para empreendedor, confirmar tipo (PJ/PF) e categoria
    return formatarRespostaTwilio(`
📝 *Confirme a classificação:*

Descrição: ${descricao}
Valor: R$ ${valor.toFixed(2)}
Data: ${dataFormatada}

Categoria: *${classificacao.categoria}*
Tipo: *${classificacao.tipo}* (${classificacao.tipo === 'PJ' ? 'Empresarial' : 'Pessoal'})
Natureza: *${classificacao.natureza === 'GANHO' ? 'Receita' : 'Despesa'}*

Esta classificação está correta?
1️⃣ Sim, está correta
2️⃣ Não, quero corrigir
    `)
  }
}

/**
 * Processa a resposta do usuário a um estado de conversa anterior
 */
async function processarEstadoConversa(
  message: string,
  user: any,
  estadoConversa: any
): Promise<string> {
  const tipo = estadoConversa.dados.tipo

  switch (tipo) {
    case 'confirmacao_classificacao':
      return await processarConfirmacaoClassificacao(message, user, estadoConversa.dados)

    case 'correcao_transacao':
      return await processarCorrecaoTransacao(message, user, estadoConversa.dados)

    default:
      // Estado desconhecido - limpar e começar do zero
      await limparEstadoConversa(user.id, 'conversa')
      return formatarRespostaTwilio(`
❓ Não consegui entender sua última mensagem. Por favor, tente novamente ou digite !ajuda para ver os comandos disponíveis.
      `)
  }
}

/**
 * Processa a resposta à solicitação de confirmação de classificação
 */
async function processarConfirmacaoClassificacao(
  message: string,
  user: any,
  dados: any
): Promise<string> {
  const resposta = message.trim().toLowerCase()

  // Interpretar resposta do usuário
  if (resposta === '1' || resposta === 'sim' || resposta === 's' || resposta === 'yes') {
    // Confirmação positiva - salvar com a classificação sugerida
    await limparEstadoConversa(user.id, 'conversa')

    const { classificacao, transacao } = dados

    if (classificacao.natureza === 'GANHO') {
      return await salvarGanho(
        classificacao,
        transacao.descricao,
        transacao.valor,
        transacao.data,
        user
      )
    } else {
      return await salvarGasto(
        classificacao,
        transacao.descricao,
        transacao.valor,
        transacao.data,
        user
      )
    }
  } else if (
    resposta === '2' ||
    resposta === 'não' ||
    resposta === 'nao' ||
    resposta === 'n' ||
    resposta === 'no'
  ) {
    // Usuário quer corrigir - iniciar fluxo de correção
    dados.tipo = 'correcao_transacao'
    dados.etapa = 'escolha_tipo'

    await salvarEstadoConversa(user.id, 'conversa', dados)

    // Montar mensagem baseada no perfil do usuário
    if (user.perfil === 'pessoa_fisica') {
      return formatarRespostaTwilio(`
🔄 *Correção de classificação*

Por favor, escolha o tipo de transação:
1️⃣ Despesa (gasto)
2️⃣ Receita (ganho)
      `)
    } else {
      return formatarRespostaTwilio(`
🔄 *Correção de classificação*

Por favor, escolha o tipo de transação:
1️⃣ Despesa Empresarial (PJ)
2️⃣ Despesa Pessoal (PF)
3️⃣ Receita Empresarial (PJ)
4️⃣ Receita Pessoal (PF)
      `)
    }
  } else {
    // Resposta não reconhecida
    return formatarRespostaTwilio(`
❓ Não entendi sua resposta. Por favor, responda com:
1️⃣ ou "sim" para confirmar
2️⃣ ou "não" para corrigir
    `)
  }
}

/**
 * Processa a resposta durante o fluxo de correção de transação
 */
async function processarCorrecaoTransacao(message: string, user: any, dados: any): Promise<string> {
  const resposta = message.trim()
  const etapa = dados.etapa

  switch (etapa) {
    case 'escolha_tipo':
      // Processar escolha de tipo (despesa/receita, PJ/PF)
      if (user.perfil === 'pessoa_fisica') {
        // Para pessoa física
        if (resposta === '1') {
          // Despesa
          dados.classificacao_corrigida = {
            ...dados.classificacao,
            natureza: 'GASTO',
            tipo: 'PF'
          }
        } else if (resposta === '2') {
          // Receita
          dados.classificacao_corrigida = {
            ...dados.classificacao,
            natureza: 'GANHO',
            tipo: 'PF'
          }
        } else {
          return formatarRespostaTwilio(`
❓ Por favor, escolha uma opção válida:
1️⃣ Despesa (gasto)
2️⃣ Receita (ganho)
          `)
        }
      } else {
        // Para empreendedor
        if (resposta === '1') {
          // Despesa PJ
          dados.classificacao_corrigida = {
            ...dados.classificacao,
            natureza: 'GASTO',
            tipo: 'PJ'
          }
        } else if (resposta === '2') {
          // Despesa PF
          dados.classificacao_corrigida = {
            ...dados.classificacao,
            natureza: 'GASTO',
            tipo: 'PF'
          }
        } else if (resposta === '3') {
          // Receita PJ
          dados.classificacao_corrigida = {
            ...dados.classificacao,
            natureza: 'GANHO',
            tipo: 'PJ'
          }
        } else if (resposta === '4') {
          // Receita PF
          dados.classificacao_corrigida = {
            ...dados.classificacao,
            natureza: 'GANHO',
            tipo: 'PF'
          }
        } else {
          return formatarRespostaTwilio(`
❓ Por favor, escolha uma opção válida (1-4).
          `)
        }
      }

      // Atualizar estado para próxima etapa
      dados.etapa = 'escolha_categoria'
      await salvarEstadoConversa(user.id, 'conversa', dados)

      // Obter categorias disponíveis baseadas no tipo escolhido
      const categorias = await obterCategoriasPorTipo(
        user,
        dados.classificacao_corrigida.tipo,
        dados.classificacao_corrigida.natureza
      )

      return formatarRespostaTwilio(`
📋 *Escolha a categoria:*

${categorias.map((cat, index) => `${index + 1}. ${cat}`).join('\n')}

Responda com o número da categoria ou digite nova categoria se não estiver na lista.
      `)

    case 'escolha_categoria':
      // Processar escolha de categoria
      let categoriaEscolhida = ''
      const categoriasDisponiveis = await obterCategoriasPorTipo(
        user,
        dados.classificacao_corrigida.tipo,
        dados.classificacao_corrigida.natureza
      )

      // Verificar se a resposta é um número (escolha de categoria existente)
      const indice = parseInt(resposta) - 1
      if (!isNaN(indice) && indice >= 0 && indice < categoriasDisponiveis.length) {
        categoriaEscolhida = categoriasDisponiveis[indice]
      } else {
        // Criar nova categoria com o texto informado
        categoriaEscolhida = resposta.trim()

        // Aqui poderíamos salvar a nova categoria para uso futuro
        // Em uma implementação real, isso seria feito no banco de dados
      }

      // Atualizar classificação corrigida
      dados.classificacao_corrigida.categoria = categoriaEscolhida

      // Finalizar correção
      await limparEstadoConversa(user.id, 'conversa')

      // Salvar transação com a classificação corrigida
      const { classificacao_corrigida, transacao } = dados

      if (classificacao_corrigida.natureza === 'GANHO') {
        return await salvarGanho(
          classificacao_corrigida,
          transacao.descricao,
          transacao.valor,
          transacao.data,
          user,
          true // flag para indicar que é uma correção
        )
      } else {
        return await salvarGasto(
          classificacao_corrigida,
          transacao.descricao,
          transacao.valor,
          transacao.data,
          user,
          true // flag para indicar que é uma correção
        )
      }

    default:
      // Etapa desconhecida - limpar e começar do zero
      await limparEstadoConversa(user.id, 'conversa')
      return formatarRespostaTwilio(`
❌ Ocorreu um erro no processo de correção. Por favor, tente novamente.
      `)
  }
}

/**
 * Obtém categorias disponíveis por tipo e natureza da transação
 */
async function obterCategoriasPorTipo(
  user: any,
  tipo: string,
  natureza: string
): Promise<string[]> {
  // Em uma implementação real, buscaríamos do banco de dados
  // Aqui retornamos categorias de exemplo
  if (tipo === 'PJ') {
    if (natureza === 'GASTO') {
      return [
        'Alimentação PJ',
        'Marketing PJ',
        'Material de Escritório',
        'Software/Assinaturas',
        'Serviços Terceiros',
        'Impostos',
        'Equipamentos',
        'Outros PJ'
      ]
    } else {
      return ['Vendas', 'Prestação de Serviços', 'Consultoria', 'Comissões', 'Outros Ganhos PJ']
    }
  } else {
    if (natureza === 'GASTO') {
      return [
        'Alimentação PF',
        'Transporte PF',
        'Moradia',
        'Saúde',
        'Lazer',
        'Vestuário',
        'Educação',
        'Outros PF'
      ]
    } else {
      return ['Salário', 'Freelance', 'Rendimentos', 'Reembolsos', 'Outros Ganhos PF']
    }
  }
}

/**
 * Inicia o processo de correção da última transação
 */
async function iniciarCorrecao(message: string, user: any): Promise<string> {
  // Em uma implementação real, buscaríamos a última transação do usuário
  // Aqui usamos uma transação de exemplo
  const ultimaTransacao = {
    descricao: 'Última transação',
    valor: 100,
    data: formatarData(new Date()),
    classificacao: {
      natureza: 'GASTO',
      tipo: 'PF',
      categoria: 'Alimentação PF',
      origem: 'Restaurante',
      probabilidade: 0.9,
      status: 'SUCCESS'
    }
  }

  // Salvar estado para correção
  const dadosEstado = {
    tipo: 'correcao_transacao',
    etapa: 'escolha_tipo',
    transacao: {
      descricao: ultimaTransacao.descricao,
      valor: ultimaTransacao.valor,
      data: ultimaTransacao.data
    },
    classificacao: ultimaTransacao.classificacao
  }

  await salvarEstadoConversa(user.id, 'conversa', dadosEstado)

  // Montar mensagem baseada no perfil do usuário
  if (user.perfil === 'pessoa_fisica') {
    return formatarRespostaTwilio(`
🔄 *Correção da última transação*

Transação atual:
Descrição: ${ultimaTransacao.descricao}
Valor: R$ ${ultimaTransacao.valor.toFixed(2)}
Data: ${ultimaTransacao.data}
Categoria: ${ultimaTransacao.classificacao.categoria}

Por favor, escolha o tipo correto:
1️⃣ Despesa (gasto)
2️⃣ Receita (ganho)
    `)
  } else {
    return formatarRespostaTwilio(`
🔄 *Correção da última transação*

Transação atual:
Descrição: ${ultimaTransacao.descricao}
Valor: R$ ${ultimaTransacao.valor.toFixed(2)}
Data: ${ultimaTransacao.data}
Tipo: ${ultimaTransacao.classificacao.tipo} (${ultimaTransacao.classificacao.tipo === 'PJ' ? 'Empresarial' : 'Pessoal'})
Categoria: ${ultimaTransacao.classificacao.categoria}

Por favor, escolha o tipo correto:
1️⃣ Despesa Empresarial (PJ)
2️⃣ Despesa Pessoal (PF)
3️⃣ Receita Empresarial (PJ)
4️⃣ Receita Pessoal (PF)
    `)
  }
}

/**
 * Classifica uma transação usando IA
 */
async function classifyTransaction(
  message: string,
  perfilUsuario: string,
  preferencias?: any
): Promise<ClassificationResult> {
  // NOTA: Esta é uma implementação mockada para o MVP
  // Em produção, usaríamos uma chamada real à API da OpenAI ou outro modelo de IA

  const textoLower = message.toLowerCase()
  const isPessoaFisica = perfilUsuario === 'pessoa_fisica'

  // Detectar se é ganho ou gasto
  const isGanho =
    textoLower.includes('recebi') ||
    textoLower.includes('ganhou') ||
    textoLower.includes('recebimento') ||
    textoLower.includes('pagou')

  // Para pessoa física, sempre é PF
  const tipo = isPessoaFisica
    ? 'PF'
    : textoLower.includes('cliente') ||
        textoLower.includes('empresa') ||
        textoLower.includes('negócio') ||
        textoLower.includes('trabalho')
      ? 'PJ'
      : 'PF'

  // Classificar categoria baseada em palavras-chave
  let categoria = ''

  if (isGanho) {
    if (tipo === 'PJ') {
      if (textoLower.includes('venda')) categoria = 'Vendas'
      else if (textoLower.includes('serviço')) categoria = 'Prestação de Serviços'
      else if (textoLower.includes('consult')) categoria = 'Consultoria'
      else categoria = 'Outros Ganhos PJ'
    } else {
      if (textoLower.includes('salário')) categoria = 'Salário'
      else if (textoLower.includes('freelance')) categoria = 'Freelance'
      else categoria = 'Outros Ganhos PF'
    }
  } else {
    if (tipo === 'PJ') {
      if (
        textoLower.includes('comida') ||
        textoLower.includes('almoço') ||
        textoLower.includes('restaurante')
      )
        categoria = 'Alimentação PJ'
      else if (textoLower.includes('market') || textoLower.includes('anúncio'))
        categoria = 'Marketing PJ'
      else if (textoLower.includes('material')) categoria = 'Material de Escritório'
      else categoria = 'Outros PJ'
    } else {
      if (textoLower.includes('comida') || textoLower.includes('mercado'))
        categoria = 'Alimentação PF'
      else if (
        textoLower.includes('uber') ||
        textoLower.includes('taxi') ||
        textoLower.includes('ônibus')
      )
        categoria = 'Transporte PF'
      else if (
        textoLower.includes('cinema') ||
        textoLower.includes('viagem') ||
        textoLower.includes('passeio')
      )
        categoria = 'Lazer'
      else if (
        textoLower.includes('médico') ||
        textoLower.includes('remédio') ||
        textoLower.includes('farmácia')
      )
        categoria = 'Saúde'
      else categoria = 'Outros PF'
    }
  }

  // Determinar origem baseada no contexto
  let origem = 'Não especificada'

  // Expressões regulares para capturar contextos comuns
  const reRestaurante = /(?:n[oa]|d[oa]|em)\s+([A-Z][a-zA-Z\s]+)/i
  const reCliente = /cliente\s+([A-Z][a-zA-Z\s]+)/i
  const reEmpresa = /empresa\s+([A-Z][a-zA-Z\s]+)/i

  const matchRestaurante = textoLower.match(reRestaurante)
  const matchCliente = textoLower.match(reCliente)
  const matchEmpresa = textoLower.match(reEmpresa)

  if (matchRestaurante) origem = matchRestaurante[1]
  else if (matchCliente) origem = matchCliente[1]
  else if (matchEmpresa) origem = matchEmpresa[1]

  // Determinar probabilidade baseada na clareza dos indicadores
  let probabilidade = 0.7 // Base
  if (isGanho && (textoLower.includes('recebi') || textoLower.includes('pagou')))
    probabilidade += 0.2
  if (!isGanho && (textoLower.includes('paguei') || textoLower.includes('comprei')))
    probabilidade += 0.2
  if (tipo === 'PJ' && textoLower.includes('cliente')) probabilidade += 0.1
  if (tipo === 'PF' && textoLower.includes('pessoal')) probabilidade += 0.1
  if (
    categoria !== 'Outros PJ' &&
    categoria !== 'Outros PF' &&
    categoria !== 'Outros Ganhos PJ' &&
    categoria !== 'Outros Ganhos PF'
  )
    probabilidade += 0.1

  // Limitar a 1.0
  probabilidade = Math.min(probabilidade, 1.0)

  return {
    natureza: isGanho ? 'GANHO' : 'GASTO',
    tipo,
    categoria,
    origem,
    probabilidade,
    status: probabilidade >= 0.8 ? 'SUCCESS' : 'LOW_CONFIDENCE'
  }
}

/**
 * Salva um gasto na planilha do usuário
 */
async function salvarGasto(
  classificacao: ClassificationResult,
  descricao: string,
  valor: number,
  dataFormatada: string,
  user: any,
  isCorrecao: boolean = false
): Promise<string> {
  try {
    // Em uma implementação real, salvaríamos na planilha do usuário
    // const sheetManager = new SheetManager(user.spreadsheet_id)
    // await sheetManager.adicionarGasto(
    //   classificacao.tipo,
    //   new Date(dataFormatada),
    //   descricao,
    //   valor,
    //   classificacao.categoria,
    //   { origem: classificacao.origem }
    // )

    console.log(
      `Salvando gasto: ${JSON.stringify({
        tipo: classificacao.tipo,
        data: dataFormatada,
        descricao,
        valor,
        categoria: classificacao.categoria,
        origem: classificacao.origem
      })}`
    )

    // Indicar se é pessoal ou empresarial
    const isPessoal = classificacao.tipo === 'PF'
    const iconePerfil = isPessoal ? '👤' : '💼'
    const labelPerfil = isPessoal ? 'pessoal' : 'empresarial'

    // Se for correção, personalizar mensagem
    if (isCorrecao) {
      return formatarRespostaTwilio(`
✅ *Transação corrigida com sucesso!*

${iconePerfil} Gasto ${labelPerfil} (${classificacao.tipo})
📝 ${descricao}
💰 R$ ${valor.toFixed(2)}
📆 ${dataFormatada}
📁 Categoria: ${classificacao.categoria}
🏪 Origem: ${classificacao.origem}

A transação foi reclassificada e salva corretamente.
      `)
    }

    // Mensagem padrão de confirmação
    return formatarRespostaTwilio(`
✅ *Gasto registrado com sucesso!*

${iconePerfil} Gasto ${labelPerfil} (${classificacao.tipo})
📝 ${descricao}
💰 R$ ${valor.toFixed(2)}
📆 ${dataFormatada}
📁 Categoria: ${classificacao.categoria}
🏪 Origem: ${classificacao.origem}

${
  isPessoal
    ? '💡 Somando todos os gastos pessoais desta categoria, você já gastou R$ XXX,XX neste mês.'
    : '💡 Lembre-se de guardar comprovantes para fins fiscais.'
}
    `)
  } catch (error) {
    console.error('Erro ao salvar gasto:', error)
    return handleError('Não foi possível salvar seu gasto')
  }
}

/**
 * Salva um ganho/receita na planilha do usuário
 */
async function salvarGanho(
  classificacao: ClassificationResult,
  descricao: string,
  valor: number,
  dataFormatada: string,
  user: any,
  isCorrecao: boolean = false
): Promise<string> {
  try {
    // Em uma implementação real, salvaríamos na planilha do usuário
    // const sheetManager = new SheetManager(user.spreadsheet_id)
    // await sheetManager.adicionarGanho(
    //   classificacao.tipo,
    //   new Date(dataFormatada),
    //   descricao,
    //   valor,
    //   classificacao.categoria,
    //   { origem: classificacao.origem }
    // )

    console.log(
      `Salvando ganho: ${JSON.stringify({
        tipo: classificacao.tipo,
        data: dataFormatada,
        descricao,
        valor,
        categoria: classificacao.categoria,
        origem: classificacao.origem
      })}`
    )

    // Indicar se é pessoal ou empresarial
    const isPessoal = classificacao.tipo === 'PF'
    const iconePerfil = isPessoal ? '👤' : '💼'
    const labelPerfil = isPessoal ? 'pessoal' : 'empresarial'

    // Se for correção, personalizar mensagem
    if (isCorrecao) {
      return formatarRespostaTwilio(`
✅ *Transação corrigida com sucesso!*

${iconePerfil} Receita ${labelPerfil} (${classificacao.tipo})
📝 ${descricao}
💰 R$ ${valor.toFixed(2)}
📆 ${dataFormatada}
📁 Categoria: ${classificacao.categoria}
🏢 Origem: ${classificacao.origem}

A transação foi reclassificada e salva corretamente.
      `)
    }

    // Mensagem padrão de confirmação
    return formatarRespostaTwilio(`
✅ *Receita registrada com sucesso!*

${iconePerfil} Receita ${labelPerfil} (${classificacao.tipo})
📝 ${descricao}
💰 R$ ${valor.toFixed(2)}
📆 ${dataFormatada}
📁 Categoria: ${classificacao.categoria}
🏢 Origem: ${classificacao.origem}

${
  isPessoal
    ? '💰 Seus ganhos pessoais neste mês somam R$ XXX,XX.'
    : '📋 Lembre-se de emitir nota fiscal quando aplicável.'
}
    `)
  } catch (error) {
    console.error('Erro ao salvar ganho:', error)
    return handleError('Não foi possível salvar sua receita')
  }
}

/**
 * Processa múltiplas transações de uma vez
 */
async function processarMultiplasTransacoes(message: string, user: any): Promise<string> {
  try {
    // Extrair transações da mensagem
    const transacoes = extrairMultiplasTransacoes(message)

    if (transacoes.length === 0) {
      return formatarRespostaTwilio(`
⚠️ Identifiquei que sua mensagem pode conter múltiplas transações, mas não consegui extrair os dados corretamente.

Por favor, envie uma transação por vez ou separe cada uma em uma linha clara.
      `)
    }

    // Processar cada transação
    let transacoesProcessadas = 0
    let totalPJ = 0
    let totalPF = 0

    for (const transacao of transacoes) {
      try {
        // Classificar a transação
        const classificacao = await classifyTransaction(
          transacao.textoOriginal,
          user.perfil,
          user.preferencias
        )

        if (classificacao.status === 'SUCCESS') {
          // Salvar na planilha (simulado para MVP)
          // const sheetManager = new SheetManager(user.spreadsheet_id)
          // if (classificacao.natureza === 'GANHO') {
          //   await sheetManager.adicionarGanho(...)
          // } else {
          //   await sheetManager.adicionarGasto(...)
          // }

          transacoesProcessadas++

          // Atualizar totais para resumo
          if (classificacao.tipo === 'PJ') {
            totalPJ += transacao.valor
          } else {
            totalPF += transacao.valor
          }
        }
      } catch (error) {
        console.error('Erro ao processar transação múltipla:', error)
      }
    }

    // Se nenhuma transação foi processada com sucesso
    if (transacoesProcessadas === 0) {
      return formatarRespostaTwilio(`
❌ Não consegui processar nenhuma das transações. Por favor, verifique o formato e tente novamente.
      `)
    }

    // Criar resumo das transações processadas
    let resumo = `
✅ *${transacoesProcessadas} transações processadas com sucesso!*

`

    if (totalPJ > 0) {
      resumo += `💼 *Transações Empresariais (PJ):* R$ ${totalPJ.toFixed(2)}\n`
    }

    if (totalPF > 0) {
      resumo += `👤 *Transações Pessoais (PF):* R$ ${totalPF.toFixed(2)}\n`
    }

    resumo += `
💡 Para ver detalhes, digite !relatorio
    `

    return formatarRespostaTwilio(resumo)
  } catch (error) {
    console.error('Erro ao processar múltiplas transações:', error)
    return handleError('Não foi possível processar suas transações')
  }
}

/**
 * Processa comandos especiais (iniciados com !)
 */
async function processarComando(message: string, user: any): Promise<string> {
  const partes = message.substring(1).split(' ')
  const comando = partes[0].toLowerCase()

  switch (comando) {
    case 'ajuda':
    case 'help':
      return formatarRespostaTwilio(`
📚 *Comandos disponíveis:*

!relatorio [mes] [ano] - Gera relatório financeiro
!categorias - Lista suas categorias configuradas
!ajuda - Mostra esta mensagem
!corrigir - Inicia processo para corrigir última transação

*Como registrar transações:*
• Gastos: "Comprei X por R$ Y" ou "Paguei R$ Z pelo W"
• Receitas: "Recebi R$ X de Y" ou "Cliente pagou R$ Z"
      `)

    case 'relatorio':
    case 'relatório':
    case 'report':
      const mes = partes[1] || obterMesAtual()
      const ano = partes[2] || new Date().getFullYear().toString()

      return await gerarRelatorio(user, mes, ano)

    case 'categorias':
    case 'categories':
      return await listarCategorias(user)

    default:
      return formatarRespostaTwilio(`
❓ Comando não reconhecido. Digite !ajuda para ver os comandos disponíveis.
      `)
  }
}

/**
 * Gera um relatório financeiro mensal
 */
async function gerarRelatorio(user: any, mes: string, ano: string): Promise<string> {
  try {
    // Em uma implementação real, buscaríamos dados da planilha
    // const sheetManager = new SheetManager(user.spreadsheet_id)
    // const dadosPJ = await sheetManager.obterDadosMes('PJ', mes, ano)
    // const dadosPF = await sheetManager.obterDadosMes('PF', mes, ano)

    // Relatório simulado para MVP
    return formatarRespostaTwilio(`
📊 *Relatório Financeiro: ${mes.toUpperCase()}/${ano}*

${
  user.perfil === 'empresario_individual'
    ? `
💼 *EMPRESARIAL (PJ)*
Receitas: R$ 5.000,00
Despesas: R$ 1.800,00
Saldo: R$ 3.200,00

📋 Principais receitas:
• Consultoria: R$ 3.500,00
• Venda de produtos: R$ 1.500,00

📋 Principais despesas:
• Marketing: R$ 800,00
• Serviços: R$ 500,00
• Software: R$ 300,00
`
    : ''
}

👤 *PESSOAL (PF)*
Receitas: R$ 2.500,00
Despesas: R$ 2.100,00
Saldo: R$ 400,00

📋 Principais despesas:
• Moradia: R$ 800,00
• Alimentação: R$ 500,00
• Transporte: R$ 300,00

💡 *Insights:*
• Suas despesas com alimentação representam 23% dos gastos pessoais
• Seu faturamento empresarial aumentou 15% em relação ao mês anterior
• Meta de economia pessoal atingida: 16% da receita

Para mais detalhes, acesse sua planilha Google Sheets.
    `)
  } catch (error) {
    console.error('Erro ao gerar relatório:', error)
    return handleError('Não foi possível gerar o relatório')
  }
}

/**
 * Lista as categorias configuradas do usuário
 */
async function listarCategorias(user: any): Promise<string> {
  try {
    // Em uma implementação real, buscaríamos as categorias do usuário
    // const categorias = await obterCategoriasUsuario(user.id)

    // Categorias simuladas para MVP
    if (user.perfil === 'pessoa_fisica') {
      return formatarRespostaTwilio(`
📋 *Suas categorias configuradas:*

*Despesas:*
• Alimentação
• Transporte
• Moradia
• Saúde
• Lazer
• Educação
• Compras
• Outros

*Receitas:*
• Salário
• Freelance
• Rendimentos
• Outros

Para adicionar novas categorias, acesse o site do Finia.
      `)
    } else {
      return formatarRespostaTwilio(`
📋 *Suas categorias configuradas:*

*Despesas PJ:*
• Alimentação PJ
• Marketing
• Material de Escritório
• Software/Assinaturas
• Serviços Terceiros
• Impostos
• Equipamentos
• Outros PJ

*Receitas PJ:*
• Vendas
• Prestação de Serviços
• Consultoria
• Comissões
• Outros Ganhos PJ

*Despesas PF:*
• Alimentação PF
• Transporte
• Moradia
• Saúde
• Lazer
• Educação
• Outros PF

*Receitas PF:*
• Salário
• Rendimentos
• Outros Ganhos PF

Para adicionar novas categorias, acesse o site do Finia.
      `)
    }
  } catch (error) {
    console.error('Erro ao listar categorias:', error)
    return handleError('Não foi possível listar suas categorias')
  }
}

/**
 * Solicita código de verificação para o site
 */
async function handleCodeRequest(phone: string, siteUrl: string): Promise<string> {
  try {
    const temporaryCode = await criarCodigoTemporario(phone)

    return formatarRespostaTwilio(`
🔑 *Código de Verificação*

Use este código para autenticação no site do Finia:
\`${temporaryCode}\`
(válido por 15 minutos)

🔗 ${siteUrl}/login?phone=${encodeURIComponent(phone)}
    `)
  } catch (error) {
    console.error('Erro ao gerar código temporário:', error)
    return handleError('Não foi possível gerar o código de verificação')
  }
}

/**
 * Processa solicitação de reinício do onboarding
 */
async function handleRestartRequest(phone: string): Promise<string> {
  try {
    const user = await findUser(phone)

    if (!user) {
      return formatarRespostaTwilio(`
Você ainda não possui cadastro no Finia. Digite "code" para receber um código de verificação para se cadastrar no site.
      `)
    }

    // Limpar estados de conversa
    await limparEstadoConversa(user.id, 'onboarding')
    await limparEstadoConversa(user.id, 'conversa')

    // Marcar onboarding como não completo
    await atualizarUsuario(user.id, { onboarding_completo: false })

    return formatarRespostaTwilio(`
🔄 *Reiniciando configuração*

Sua configuração foi reiniciada. Vamos começar novamente.

Como você gostaria de ser chamado?
    `)
  } catch (error) {
    console.error('Erro ao reiniciar configuração:', error)
    return handleError('Não foi possível reiniciar sua configuração')
  }
}

/**
 * Função para gerar código temporário (mockada para MVP)
 */
async function criarCodigoTemporario(phone: string): Promise<string> {
  // Em uma implementação real, salvaríamos no banco de dados
  // Aqui apenas geramos um código aleatório
  const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let codigo = ''

  for (let i = 0; i < 6; i++) {
    const indice = Math.floor(Math.random() * caracteres.length)
    codigo += caracteres.charAt(indice)
  }

  return codigo
}

/**
 * Formata a resposta para o formato do Twilio
 */
function formatarRespostaTwilio(mensagem: string): string {
  return `
    <Response>
      <Message>${mensagem.trim()}</Message>
    </Response>
  `
}

/**
 * Trata erros genéricos
 */
function handleError(mensagem: string): string {
  return formatarRespostaTwilio(`
❌ ${mensagem}. Por favor, tente novamente ou entre em contato com o suporte.
  `)
}

/**
 * Obtém o nome do mês atual
 */
function obterMesAtual(): string {
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
