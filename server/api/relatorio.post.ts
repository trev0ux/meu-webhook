// server/api/relatorio.post.ts
import { defineEventHandler, readBody } from 'h3'
import { obterDadosSheet } from './utils/sheets'
import { getOpenAIClient } from './utils/openai'
import { obterConfiguracoes } from './utils/sheets'
import twilio from 'twilio'

export default defineEventHandler(async (event) => {
  try {
    const { telefone, mes, ano } = await readBody(event)
    
    // Verificar autorização
    const { numerosAutorizados } = await obterConfiguracoes()
    if (!numerosAutorizados.includes(telefone)) {
      return {
        success: false,
        message: 'Número não autorizado'
      }
    }
    
    // Obter dados para o período
    const dadosPJ = await obterGastosPorMes('PJ', mes, ano)
    const dadosPF = await obterGastosPorMes('PF', mes, ano)
    
    // Calcular totais
    const totalPJ = dadosPJ.reduce((acc, item) => acc + Number(item[2]), 0)
    const totalPF = dadosPF.reduce((acc, item) => acc + Number(item[2]), 0)
    
    // Agrupar por categoria
    const categoriasPJ = agruparPorCategoria(dadosPJ)
    const categoriasPF = agruparPorCategoria(dadosPF)
    
    // Gerar insights com OpenAI
    const insights = await gerarInsightsFinanceiros({
      totalPJ,
      totalPF,
      categoriasPJ,
      categoriasPF,
      mes,
      ano
    })
    
    // Criar mensagem do relatório
    const mensagemRelatorio = `
📊 RELATÓRIO FINANCEIRO: ${mes.toUpperCase()}/${ano}

💼 GASTOS PJ: R$ ${totalPJ.toFixed(2)}
Principais categorias:
${categoriasPJ.slice(0, 3).map(c => `• ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}

👤 GASTOS PF: R$ ${totalPF.toFixed(2)}
Principais categorias:
${categoriasPF.slice(0, 3).map(c => `• ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}

✨ INSIGHTS:
${insights.map(i => `• ${i}`).join('\n')}

Para obter o PDF completo, envie !pdf ${mes} ${ano}
    `
    
    // Enviar via Twilio
    const config = useRuntimeConfig()
    const twilioClient = twilio(
      config.twilioAccountSid,
      config.twilioAuthToken
    )
    
    await twilioClient.messages.create({
      from: `whatsapp:${config.twilioPhoneNumber}`,
      to: `whatsapp:${telefone}`,
      body: mensagemRelatorio
    })
    
    return { success: true }
  } catch (error) {
    console.error('Erro ao gerar relatório:', error)
    return { success: false, error: error.message }
  }
})

// Função para obter gastos por mês
async function obterGastosPorMes(tipo: string, mes: string, ano: string) {
  const todosDados = await obterDadosSheet(tipo, 'A2:E1000')
  
  // Mapear mês para número
  const meses = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  }
  
  const mesNumero = meses[mes.toLowerCase()]
  
  // Filtrar por data (formato DD/MM/AAAA)
  return todosDados.filter(linha => {
    const data = linha[0]
    return data.includes(`/${mesNumero}/${ano}`) || data.includes(`/${mesNumero}/${ano.substring(2)}`)
  })
}

// Função para agrupar gastos por categoria
function agruparPorCategoria(dados) {
  const categorias = {}
  
  dados.forEach(linha => {
    const categoria = linha[3]
    const valor = Number(linha[2])
    
    if (!categorias[categoria]) {
      categorias[categoria] = 0
    }
    
    categorias[categoria] += valor
  })
  
  // Converter para array e ordenar
  return Object.entries(categorias)
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)
}

// Função para gerar insights com IA
async function gerarInsightsFinanceiros(dados) {
  const openai = getOpenAIClient()
  
  const prompt = `
    Analise os seguintes dados financeiros de ${dados.mes}/${dados.ano}:
    
    Gastos PJ Total: R$ ${dados.totalPJ.toFixed(2)}
    Principais categorias PJ:
    ${dados.categoriasPJ.map(c => `- ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}
    
    Gastos PF Total: R$ ${dados.totalPF.toFixed(2)}
    Principais categorias PF:
    ${dados.categoriasPF.map(c => `- ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}
    
    Gere 3-5 insights financeiros úteis sobre estes dados.
    Formato em tópicos curtos e diretos, cada um com no máximo 2 linhas.
    Não use bullet points, apenas texto simples.
    Separe cada insight por quebra de linha.
  `
  
  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    })
    
    const texto = response.data.choices[0].message?.content || ''
    return texto.split('\n').filter(line => line.trim().length > 0)
  } catch (error) {
    console.error('Erro ao gerar insights:', error)
    return [
      'Não foi possível gerar insights neste momento.',
      'Revise seus gastos para identificar oportunidades de economia.'
    ]
  }
}