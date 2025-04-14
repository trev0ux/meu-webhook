// server/api/utils/relatorio-service.ts
import { getOpenAIClient } from './openai'
import { getGoogleSheetsClient, obterDadosSheet } from './sheets'
import twilio from 'twilio'
import { marcarSolicitacaoProcessada } from '../../../db/report-requests'
import { findUserById } from '../../../db/users'

/**
 * Interface para representar dados para geração de relatório
 */
interface DadosRelatorio {
  usuario_id: number
  telefone: string
  tipo: 'diario' | 'semanal' | 'mensal' | 'sob_demanda'
  periodo_referencia: string
  solicitacao_id?: number
}

/**
 * Função principal para gerar e enviar o relatório apropriado
 *
 * @param dados Dados necessários para geração do relatório
 * @returns true se o relatório foi gerado e enviado com sucesso
 */
export async function gerarEEnviarRelatorio(dados: DadosRelatorio): Promise<boolean> {
  try {
    // Verificar o tipo de relatório solicitado
    switch (dados.tipo) {
      case 'diario':
        return await gerarEnviarRelatorioDiario(dados)
      case 'semanal':
        return await gerarEnviarRelatorioSemanal(dados)
      case 'mensal':
        return await gerarEnviarRelatorioMensal(dados)
      case 'sob_demanda':
        return await gerarEnviarRelatorioCompleto(dados)
      default:
        console.error(`Tipo de relatório desconhecido: ${dados.tipo}`)
        return false
    }
  } catch (error) {
    console.error('Erro ao gerar e enviar relatório:', error)
    return false
  }
}

/**
 * Gera e envia um relatório diário
 *
 * @param dados Dados necessários para geração do relatório
 * @returns true se o relatório foi gerado e enviado com sucesso
 */
export async function gerarEnviarRelatorioDiario(dados: DadosRelatorio): Promise<boolean> {
  try {
    const config = useRuntimeConfig()

    // Obter informações do usuário incluindo spreadsheet_id
    const user = await findUserById(dados.usuario_id)
    if (!user || !user.spreadsheet_id) {
      console.error('Usuário não encontrado ou sem planilha configurada')
      return false
    }

    // Extrair data de referência
    const dataRef = dados.periodo_referencia || formatarData(new Date())

    // Obter dados para o dia específico
    const dadosPJ = await obterGastosPorDia(user.spreadsheet_id, 'PJ', dataRef)
    const dadosPF = await obterGastosPorDia(user.spreadsheet_id, 'PF', dataRef)

    // Obter ganhos também
    const ganhosPJ = await obterGastosPorDia(user.spreadsheet_id, 'GanhosPJ', dataRef)
    const ganhosPF = await obterGastosPorDia(user.spreadsheet_id, 'GanhosPF', dataRef)

    // Calcular totais
    const totalGastosPJ = dadosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGastosPF = dadosPF.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPJ = ganhosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPF = ganhosPF.reduce((acc, item) => acc + Number(item[2]), 0)

    // Agrupar por categoria
    const categoriasPJ = agruparPorCategoria(dadosPJ)
    const categoriasPF = agruparPorCategoria(dadosPF)

    // Gerar insights com OpenAI específicos para relatório diário
    const insights = await gerarInsightsFinanceiros({
      tipo: 'diario',
      data: dataRef,
      gastosPJ: totalGastosPJ,
      gastosPF: totalGastosPF,
      ganhosPJ: totalGanhosPJ,
      ganhosPF: totalGanhosPF,
      categoriasPJ,
      categoriasPF
    })

    // Criar mensagem do relatório
    const mensagemRelatorio = `
📊 *RELATÓRIO DIÁRIO: ${dataRef}*

💼 *RESUMO PJ:*
  Gastos: R$ ${totalGastosPJ.toFixed(2)}
  Receitas: R$ ${totalGanhosPJ.toFixed(2)}
  Saldo: R$ ${(totalGanhosPJ - totalGastosPJ).toFixed(2)}
  
👤 *RESUMO PF:*
  Gastos: R$ ${totalGastosPF.toFixed(2)}
  Receitas: R$ ${totalGanhosPF.toFixed(2)}
  Saldo: R$ ${(totalGanhosPF - totalGastosPF).toFixed(2)}

📈 *PRINCIPAIS CATEGORIAS:*
${categoriasPJ
  .slice(0, 2)
  .map((c) => `• ${c.categoria} (PJ): R$ ${c.total.toFixed(2)}`)
  .join('\n')}
${categoriasPF
  .slice(0, 2)
  .map((c) => `• ${c.categoria} (PF): R$ ${c.total.toFixed(2)}`)
  .join('\n')}

💡 *INSIGHTS:*
${insights.map((i) => `• ${i}`).join('\n')}

Use !semanal ou !mensal para relatórios mais completos.
    `

    // Enviar via Twilio
    const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken)

    await twilioClient.messages.create({
      from: `whatsapp:${config.twilioPhoneNumber}`,
      to: `whatsapp:${dados.telefone}`,
      body: mensagemRelatorio
    })

    // Marcar solicitação como processada
    if (dados.solicitacao_id) {
      await marcarSolicitacaoProcessada(dados.solicitacao_id)
    }

    return true
  } catch (error) {
    console.error('Erro ao gerar relatório diário:', error)
    return false
  }
}

/**
 * Gera e envia um relatório semanal
 *
 * @param dados Dados necessários para geração do relatório
 * @returns true se o relatório foi gerado e enviado com sucesso
 */
export async function gerarEnviarRelatorioSemanal(dados: DadosRelatorio): Promise<boolean> {
  try {
    const config = useRuntimeConfig()

    // Obter informações do usuário incluindo spreadsheet_id
    const user = await findUserById(dados.usuario_id)
    if (!user || !user.spreadsheet_id) {
      console.error('Usuário não encontrado ou sem planilha configurada')
      return false
    }

    // Extrair período de referência (formato: "DD/MM/YYYY a DD/MM/YYYY")
    const [dataInicio, dataFim] = dados.periodo_referencia.split(' a ')

    // Obter dados para o período
    const dadosPJ = await obterGastosPorPeriodo(user.spreadsheet_id, 'PJ', dataInicio, dataFim)
    const dadosPF = await obterGastosPorPeriodo(user.spreadsheet_id, 'PF', dataInicio, dataFim)
    const ganhosPJ = await obterGastosPorPeriodo(
      user.spreadsheet_id,
      'GanhosPJ',
      dataInicio,
      dataFim
    )
    const ganhosPF = await obterGastosPorPeriodo(
      user.spreadsheet_id,
      'GanhosPF',
      dataInicio,
      dataFim
    )

    // Calcular totais
    const totalGastosPJ = dadosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGastosPF = dadosPF.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPJ = ganhosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPF = ganhosPF.reduce((acc, item) => acc + Number(item[2]), 0)

    // Agrupar por categoria
    const categoriasPJ = agruparPorCategoria(dadosPJ)
    const categoriasPF = agruparPorCategoria(dadosPF)

    // Gerar insights
    const insights = await gerarInsightsFinanceiros({
      tipo: 'semanal',
      periodo: `${dataInicio} a ${dataFim}`,
      gastosPJ: totalGastosPJ,
      gastosPF: totalGastosPF,
      ganhosPJ: totalGanhosPJ,
      ganhosPF: totalGanhosPF,
      categoriasPJ,
      categoriasPF
    })

    // Criar mensagem do relatório
    const mensagemRelatorio = `
📊 *RELATÓRIO SEMANAL: ${dataInicio} a ${dataFim}*

💼 *RESUMO EMPRESARIAL (PJ):*
  Gastos: R$ ${totalGastosPJ.toFixed(2)}
  Receitas: R$ ${totalGanhosPJ.toFixed(2)}
  Saldo: R$ ${(totalGanhosPJ - totalGastosPJ).toFixed(2)}
  
👤 *RESUMO PESSOAL (PF):*
  Gastos: R$ ${totalGastosPF.toFixed(2)}
  Receitas: R$ ${totalGanhosPF.toFixed(2)}
  Saldo: R$ ${(totalGanhosPF - totalGastosPF).toFixed(2)}

📈 *PRINCIPAIS CATEGORIAS:*
${categoriasPJ
  .slice(0, 3)
  .map((c) => `• ${c.categoria} (PJ): R$ ${c.total.toFixed(2)}`)
  .join('\n')}
${categoriasPF
  .slice(0, 3)
  .map((c) => `• ${c.categoria} (PF): R$ ${c.total.toFixed(2)}`)
  .join('\n')}

💡 *INSIGHTS DA SEMANA:*
${insights.map((i) => `• ${i}`).join('\n')}

📆 Para análise mensal completa, use o comando !mensal
    `

    // Enviar via Twilio
    const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken)

    await twilioClient.messages.create({
      from: `whatsapp:${config.twilioPhoneNumber}`,
      to: `whatsapp:${dados.telefone}`,
      body: mensagemRelatorio
    })

    // Marcar solicitação como processada
    if (dados.solicitacao_id) {
      await marcarSolicitacaoProcessada(dados.solicitacao_id)
    }

    return true
  } catch (error) {
    console.error('Erro ao gerar relatório semanal:', error)
    return false
  }
}

/**
 * Gera e envia um relatório mensal
 *
 * @param dados Dados necessários para geração do relatório
 * @returns true se o relatório foi gerado e enviado com sucesso
 */
export async function gerarEnviarRelatorioMensal(dados: DadosRelatorio): Promise<boolean> {
  try {
    const config = useRuntimeConfig()

    // Obter informações do usuário incluindo spreadsheet_id
    const user = await findUserById(dados.usuario_id)
    if (!user || !user.spreadsheet_id) {
      console.error('Usuário não encontrado ou sem planilha configurada')
      return false
    }

    // Extrair mês e ano de referência (formato: "mes/ano")
    const [mes, ano] = dados.periodo_referencia.split('/')

    // Obter dados para o mês/ano
    const dadosPJ = await obterGastosPorMes(user.spreadsheet_id, 'PJ', mes, ano)
    const dadosPF = await obterGastosPorMes(user.spreadsheet_id, 'PF', mes, ano)
    const ganhosPJ = await obterGastosPorMes(user.spreadsheet_id, 'GanhosPJ', mes, ano)
    const ganhosPF = await obterGastosPorMes(user.spreadsheet_id, 'GanhosPF', mes, ano)

    // Calcular totais
    const totalGastosPJ = dadosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGastosPF = dadosPF.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPJ = ganhosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPF = ganhosPF.reduce((acc, item) => acc + Number(item[2]), 0)

    // Agrupar por categoria
    const categoriasPJ = agruparPorCategoria(dadosPJ)
    const categoriasPF = agruparPorCategoria(dadosPF)

    // Gerar insights
    const insights = await gerarInsightsFinanceiros({
      tipo: 'mensal',
      mes,
      ano,
      gastosPJ: totalGastosPJ,
      gastosPF: totalGastosPF,
      ganhosPJ: totalGanhosPJ,
      ganhosPF: totalGanhosPF,
      categoriasPJ,
      categoriasPF
    })

    // Criar mensagem do relatório
    const mensagemRelatorio = `
📊 *RELATÓRIO MENSAL: ${mes.toUpperCase()}/${ano}*

💼 *RESUMO EMPRESARIAL (PJ):*
  Gastos: R$ ${totalGastosPJ.toFixed(2)}
  Receitas: R$ ${totalGanhosPJ.toFixed(2)}
  Saldo: R$ ${(totalGanhosPJ - totalGastosPJ).toFixed(2)}
  
👤 *RESUMO PESSOAL (PF):*
  Gastos: R$ ${totalGastosPF.toFixed(2)}
  Receitas: R$ ${totalGanhosPF.toFixed(2)}
  Saldo: R$ ${(totalGanhosPF - totalGastosPF).toFixed(2)}

💰 *SALDO GERAL: R$ ${(totalGanhosPJ + totalGanhosPF - (totalGastosPJ + totalGastosPF)).toFixed(2)}*

📈 *TOP CATEGORIAS PJ:*
${categoriasPJ
  .slice(0, 3)
  .map((c) => `• ${c.categoria}: R$ ${c.total.toFixed(2)}`)
  .join('\n')}

📊 *TOP CATEGORIAS PF:*
${categoriasPF
  .slice(0, 3)
  .map((c) => `• ${c.categoria}: R$ ${c.total.toFixed(2)}`)
  .join('\n')}

💡 *INSIGHTS DO MÊS:*
${insights.map((i) => `• ${i}`).join('\n')}

Para mais detalhes, use !relatorio ${mes} ${ano}
    `

    // Enviar via Twilio
    const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken)

    await twilioClient.messages.create({
      from: `whatsapp:${config.twilioPhoneNumber}`,
      to: `whatsapp:${dados.telefone}`,
      body: mensagemRelatorio
    })

    // Marcar solicitação como processada
    if (dados.solicitacao_id) {
      await marcarSolicitacaoProcessada(dados.solicitacao_id)
    }

    return true
  } catch (error) {
    console.error('Erro ao gerar relatório mensal:', error)
    return false
  }
}

/**
 * Gera e envia um relatório completo sob demanda
 *
 * @param dados Dados necessários para geração do relatório
 * @returns true se o relatório foi gerado e enviado com sucesso
 */
export async function gerarEnviarRelatorioCompleto(dados: DadosRelatorio): Promise<boolean> {
  try {
    const config = useRuntimeConfig()

    // Obter informações do usuário incluindo spreadsheet_id
    const user = await findUserById(dados.usuario_id)
    if (!user || !user.spreadsheet_id) {
      console.error('Usuário não encontrado ou sem planilha configurada')
      return false
    }

    // Extrair mês e ano de referência (formato: "mes/ano")
    const [mes, ano] = dados.periodo_referencia.split('/')

    // Obter dados para o mês/ano
    const dadosPJ = await obterGastosPorMes(user.spreadsheet_id, 'PJ', mes, ano)
    const dadosPF = await obterGastosPorMes(user.spreadsheet_id, 'PF', mes, ano)
    const ganhosPJ = await obterGastosPorMes(user.spreadsheet_id, 'GanhosPJ', mes, ano)
    const ganhosPF = await obterGastosPorMes(user.spreadsheet_id, 'GanhosPF', mes, ano)

    // Calcular totais
    const totalGastosPJ = dadosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGastosPF = dadosPF.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPJ = ganhosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalGanhosPF = ganhosPF.reduce((acc, item) => acc + Number(item[2]), 0)

    // Agrupar por categoria
    const categoriasPJ = agruparPorCategoria(dadosPJ)
    const categoriasPF = agruparPorCategoria(dadosPF)

    // Obter dados do mês anterior para comparação
    const mesAnteriorNum = parseInt(mes) - 1
    const anoAnterior = mesAnteriorNum === 0 ? parseInt(ano) - 1 : parseInt(ano)
    const mesAnterior = mesAnteriorNum === 0 ? '12' : mesAnteriorNum.toString().padStart(2, '0')

    const dadosMesAnteriorPJ = await obterGastosPorMes(
      user.spreadsheet_id,
      'PJ',
      mesAnterior,
      anoAnterior.toString()
    )
    const dadosMesAnteriorPF = await obterGastosPorMes(
      user.spreadsheet_id,
      'PF',
      mesAnterior,
      anoAnterior.toString()
    )
    const totalMesAnteriorPJ = dadosMesAnteriorPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalMesAnteriorPF = dadosMesAnteriorPF.reduce((acc, item) => acc + Number(item[2]), 0)

    // Calcular variações percentuais
    const variacaoPJ =
      totalMesAnteriorPJ > 0 ? ((totalGastosPJ - totalMesAnteriorPJ) / totalMesAnteriorPJ) * 100 : 0
    const variacaoPF =
      totalMesAnteriorPF > 0 ? ((totalGastosPF - totalMesAnteriorPF) / totalMesAnteriorPF) * 100 : 0

    // Gerar insights avançados
    const insights = await gerarInsightsFinanceirosAvancados({
      tipo: 'completo',
      mes,
      ano,
      gastosPJ: totalGastosPJ,
      gastosPF: totalGastosPF,
      ganhosPJ: totalGanhosPJ,
      ganhosPF: totalGanhosPF,
      categoriasPJ,
      categoriasPF,
      variacaoPJ,
      variacaoPF,
      dadosPJ,
      dadosPF
    })

    // Criar mensagem do relatório detalhado
    const mensagemRelatorio = `
📊 *RELATÓRIO FINANCEIRO COMPLETO: ${mes.toUpperCase()}/${ano}*

💼 *RESUMO EMPRESARIAL (PJ):*
  Total de Gastos: R$ ${totalGastosPJ.toFixed(2)}
  Total de Receitas: R$ ${totalGanhosPJ.toFixed(2)}
  Saldo: R$ ${(totalGanhosPJ - totalGastosPJ).toFixed(2)}
  Variação em relação ao mês anterior: ${variacaoPJ.toFixed(1)}%
  
👤 *RESUMO PESSOAL (PF):*
  Total de Gastos: R$ ${totalGastosPF.toFixed(2)}
  Total de Receitas: R$ ${totalGanhosPF.toFixed(2)}
  Saldo: R$ ${(totalGanhosPF - totalGastosPF).toFixed(2)}
  Variação em relação ao mês anterior: ${variacaoPF.toFixed(1)}%

💰 *SALDO GERAL DO MÊS: R$ ${(totalGanhosPJ + totalGanhosPF - (totalGastosPJ + totalGastosPF)).toFixed(2)}*

📈 *CATEGORIAS EMPRESARIAIS (PJ):*
${categoriasPJ
  .slice(0, 5)
  .map(
    (c) =>
      `• ${c.categoria}: R$ ${c.total.toFixed(2)} (${((c.total / totalGastosPJ) * 100).toFixed(1)}%)`
  )
  .join('\n')}

📊 *CATEGORIAS PESSOAIS (PF):*
${categoriasPF
  .slice(0, 5)
  .map(
    (c) =>
      `• ${c.categoria}: R$ ${c.total.toFixed(2)} (${((c.total / totalGastosPF) * 100).toFixed(1)}%)`
  )
  .join('\n')}

💡 *ANÁLISE FINANCEIRA:*
${insights.map((i) => `• ${i}`).join('\n')}

🔍 *RECOMENDAÇÕES:*
• Acompanhe diariamente suas despesas usando !diario
• Para análise da evolução, use !mensal regularmente
• Registre todas as transações para relatórios mais precisos
    `

    // Enviar via Twilio
    const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken)

    await twilioClient.messages.create({
      from: `whatsapp:${config.twilioPhoneNumber}`,
      to: `whatsapp:${dados.telefone}`,
      body: mensagemRelatorio
    })

    // Marcar solicitação como processada
    if (dados.solicitacao_id) {
      await marcarSolicitacaoProcessada(dados.solicitacao_id)
    }

    return true
  } catch (error) {
    console.error('Erro ao gerar relatório completo:', error)
    return false
  }
}

/**
 * Obtém gastos por dia específico
 *
 * @param spreadsheetId ID da planilha do usuário
 * @param sheetName Nome da aba (PJ, PF, GanhosPJ, GanhosPF)
 * @param data Data no formato DD/MM/YYYY
 * @returns Lista de linhas com dados do dia
 */
async function obterGastosPorDia(
  spreadsheetId: string,
  sheetName: string,
  data: string
): Promise<any[]> {
  try {
    // Obter todos os dados da planilha
    const todosDados = await obterDadosSheet(spreadsheetId, sheetName, 'A2:E1000')

    // Filtrar por data específica (coluna 0 contém a data)
    return todosDados.filter((linha) => linha[0] === data)
  } catch (error) {
    console.error(`Erro ao obter gastos por dia para ${sheetName}, data ${data}:`, error)
    return []
  }
}

/**
 * Obtém gastos por período
 *
 * @param spreadsheetId ID da planilha do usuário
 * @param sheetName Nome da aba (PJ, PF, GanhosPJ, GanhosPF)
 * @param dataInicio Data inicial no formato DD/MM/YYYY
 * @param dataFim Data final no formato DD/MM/YYYY
 * @returns Lista de linhas com dados do período
 */
async function obterGastosPorPeriodo(
  spreadsheetId: string,
  sheetName: string,
  dataInicio: string,
  dataFim: string
): Promise<any[]> {
  try {
    // Obter todos os dados da planilha
    const todosDados = await obterDadosSheet(spreadsheetId, sheetName, 'A2:E1000')

    // Converter as datas de string para objetos Date para comparação
    const dataInicioObj = converterStringParaData(dataInicio)
    const dataFimObj = converterStringParaData(dataFim)

    // Filtrar por período
    return todosDados.filter((linha) => {
      const dataLinha = converterStringParaData(linha[0])
      return dataLinha >= dataInicioObj && dataLinha <= dataFimObj
    })
  } catch (error) {
    console.error(`Erro ao obter gastos por período para ${sheetName}:`, error)
    return []
  }
}

/**
 * Obtém gastos por mês
 *
 * @param spreadsheetId ID da planilha do usuário
 * @param sheetName Nome da aba (PJ, PF, GanhosPJ, GanhosPF)
 * @param mes Mês (número ou nome)
 * @param ano Ano (YYYY)
 * @returns Lista de linhas com dados do mês/ano
 */
async function obterGastosPorMes(
  spreadsheetId: string,
  sheetName: string,
  mes: string,
  ano: string
): Promise<any[]> {
  try {
    // Obter todos os dados da planilha
    const todosDados = await obterDadosSheet(spreadsheetId, sheetName, 'A2:E1000')

    // Converter mês para número se for nome
    const mesNumero = converterMesParaNumero(mes)

    // Filtrar por mês/ano (formato das datas: DD/MM/YYYY ou DD/MM/YY)
    return todosDados.filter((linha) => {
      if (!linha[0]) return false

      const dataPartes = linha[0].split('/')
      if (dataPartes.length < 3) return false

      const mesLinha = dataPartes[1]
      let anoLinha = dataPartes[2]

      // Normalizar ano de 2 dígitos para 4 dígitos
      if (anoLinha.length === 2) {
        anoLinha = (parseInt(anoLinha) < 50 ? '20' : '19') + anoLinha
      }

      return mesLinha === mesNumero && (anoLinha === ano || anoLinha === ano.substring(2))
    })
  } catch (error) {
    console.error(`Erro ao obter gastos por mês para ${sheetName}, ${mes}/${ano}:`, error)
    return []
  }
}

/**
 * Agrupa dados por categoria e calcula total
 *
 * @param dados Lista de linhas de dados
 * @returns Lista de categorias com totais, ordenada por valor
 */
function agruparPorCategoria(dados: any[]): { categoria: string; total: number }[] {
  const categorias = {}

  dados.forEach((linha) => {
    if (!linha[3]) return // Pular linhas sem categoria

    const categoria = linha[3]
    const valor = Number(linha[2]) || 0

    if (!categorias[categoria]) {
      categorias[categoria] = 0
    }

    categorias[categoria] += valor
  })

  // Converter para array e ordenar
  return Object.entries(categorias)
    .map(([categoria, total]) => ({ categoria, total: total as number }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Gera insights financeiros com OpenAI
 *
 * @param dados Dados financeiros para análise
 * @returns Lista de insights
 */
async function gerarInsightsFinanceiros(dados: any): Promise<string[]> {
  const openai = getOpenAIClient()

  let prompt = `
    Analise os seguintes dados financeiros`

  if (dados.tipo === 'diario') {
    prompt += ` do dia ${dados.data}:\n\n`
  } else if (dados.tipo === 'semanal') {
    prompt += ` do período ${dados.periodo}:\n\n`
  } else if (dados.tipo === 'mensal') {
    prompt += ` de ${dados.mes}/${dados.ano}:\n\n`
  }

  prompt += `
Gastos PJ Total: R$ ${dados.gastosPJ.toFixed(2)}
Receitas PJ Total: R$ ${dados.ganhosPJ.toFixed(2)}
Principais categorias PJ:
${dados.categoriasPJ.map((c) => `- ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}

Gastos PF Total: R$ ${dados.gastosPF.toFixed(2)}
Receitas PF Total: R$ ${dados.ganhosPF.toFixed(2)}
Principais categorias PF:
${dados.categoriasPF.map((c) => `- ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}

Analise estes dados financeiros e gere de 3 a 5 insights claros e objetivos. Cada insight deve ter no máximo 2 linhas, em formato de texto simples sem marcadores. Separe cada insight por uma linha em branco. Foque em padrões relevantes, comparações entre PJ/PF e oportunidades de otimização.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    })

    const texto = response.data.choices[0].message?.content || ''
    return texto.split('\n').filter((line) => line.trim().length > 0)
  } catch (error) {
    console.error('Erro ao gerar insights:', error)
    return [
      'Não foi possível gerar insights neste momento.',
      'Revise seus gastos para identificar oportunidades de economia.'
    ]
  }
}

/**
 * Gera insights financeiros avançados com OpenAI para relatórios completos
 *
 * @param dados Dados financeiros para análise detalhada
 * @returns Lista de insights avançados
 */
async function gerarInsightsFinanceirosAvancados(dados: any): Promise<string[]> {
  const openai = getOpenAIClient()

  const prompt = `
    Analise detalhadamente os seguintes dados financeiros de ${dados.mes}/${dados.ano}:
    
    RESUMO EMPRESARIAL (PJ):
    - Gastos: R$ ${dados.gastosPJ.toFixed(2)}
    - Receitas: R$ ${dados.ganhosPJ.toFixed(2)}
    - Saldo: R$ ${(dados.ganhosPJ - dados.gastosPJ).toFixed(2)}
    - Variação em relação ao mês anterior: ${dados.variacaoPJ.toFixed(1)}%
    
    Categorias PJ:
    ${dados.categoriasPJ.map((c) => `- ${c.categoria}: R$ ${c.total.toFixed(2)} (${((c.total / dados.gastosPJ) * 100).toFixed(1)}%)`).join('\n')}
    
    RESUMO PESSOAL (PF):
    - Gastos: R$ ${dados.gastosPF.toFixed(2)}
    - Receitas: R$ ${dados.ganhosPF.toFixed(2)}
    - Saldo: R$ ${(dados.ganhosPF - dados.gastosPF).toFixed(2)}
    - Variação em relação ao mês anterior: ${dados.variacaoPF.toFixed(1)}%
    
    Categorias PF:
    ${dados.categoriasPF.map((c) => `- ${c.categoria}: R$ ${c.total.toFixed(2)} (${((c.total / dados.gastosPF) * 100).toFixed(1)}%)`).join('\n')}
    
    SALDO GERAL: R$ ${(dados.ganhosPJ + dados.ganhosPF - (dados.gastosPJ + dados.gastosPF)).toFixed(2)}
    
    Gere 5-7 insights financeiros úteis e recomendações específicas baseadas nestes dados.
    Inclua análises comparativas entre PJ e PF, tendências de gastos, e sugestões concretas de melhorias.
    Formato em tópicos curtos e diretos, cada um com no máximo 2 linhas.
    Não use bullet points, apenas texto simples.
    Separe cada insight por quebra de linha.
  `

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    })

    const texto = response.data.choices[0].message?.content || ''
    return texto.split('\n').filter((line) => line.trim().length > 0)
  } catch (error) {
    console.error('Erro ao gerar insights avançados:', error)
    return [
      'Não foi possível gerar análises detalhadas neste momento.',
      'Compare seus gastos e receitas para identificar oportunidades de otimização.',
      'Analise as categorias com maior percentual de gastos para possíveis reduções.',
      'Verifique o equilíbrio entre despesas pessoais e empresariais.'
    ]
  }
}

/**
 * Converte string de data para objeto Date
 *
 * @param dataString Data no formato DD/MM/YYYY
 * @returns Objeto Date
 */
function converterStringParaData(dataString: string): Date {
  const partes = dataString.split('/')
  if (partes.length !== 3) {
    return new Date()
  }

  const dia = parseInt(partes[0])
  const mes = parseInt(partes[1]) - 1 // Meses em JS são 0-indexed
  let ano = parseInt(partes[2])

  // Normalizar ano de 2 dígitos para 4 dígitos
  if (ano < 100) {
    ano = ano < 50 ? 2000 + ano : 1900 + ano
  }

  return new Date(ano, mes, dia)
}

/**
 * Converte nome ou número do mês para número padronizado (01-12)
 *
 * @param mes Nome ou número do mês
 * @returns Número do mês no formato de string (01-12)
 */
function converterMesParaNumero(mes: string): string {
  const meses = {
    janeiro: '01',
    fevereiro: '02',
    março: '03',
    abril: '04',
    maio: '05',
    junho: '06',
    julho: '07',
    agosto: '08',
    setembro: '09',
    outubro: '10',
    novembro: '11',
    dezembro: '12'
  }

  // Se já for um número, padronizar para sempre ter 2 dígitos
  if (/^\d{1,2}$/.test(mes)) {
    return mes.padStart(2, '0')
  }

  // Se for nome de mês, converter para número
  const mesLower = mes.toLowerCase()
  return meses[mesLower] || '01' // Default para janeiro se não encontrar
}

/**
 * Modifica a função obterDadosSheet para suportar spreadsheetId
 *
 * @param spreadsheetId ID da planilha do usuário
 * @param sheetName Nome da aba
 * @param range Range de células
 * @returns Dados da planilha
 */
async function obterDadosSheet(
  spreadsheetId: string,
  sheetName: string,
  range: string
): Promise<any[]> {
  try {
    const config = useRuntimeConfig()
    const sheets = await getGoogleSheetsClient()

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!${range}`
    })

    return response.data.values || []
  } catch (error) {
    console.error(`Erro ao obter dados da planilha ${sheetName}:`, error)
    return []
  }
}
