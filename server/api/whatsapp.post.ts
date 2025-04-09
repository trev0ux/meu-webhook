// server/api/whatsapp.post.ts
import { defineEventHandler, readBody } from 'h3'
import twilio from 'twilio'
import { classificarGasto } from './utils/openai'
import { extrairValor, extrairData, formatarData } from './utils/extrator'
// import { adicionarLinhaSheet, obterDadosSheet, obterConfiguracoes } from './utils/sheets'
import { getOpenAIClient } from './utils/openai'

export default defineEventHandler(async (event) => {
 try {
   // Obter dados da requisição
   const body = await readBody(event)
   const { Body, From } = body
   
   console.log('Recebido de:', From)
   console.log('Mensagem:', Body)
   
   if (!usuariosData[From]) {
    return enviarMensagemOnboarding(From);
  }
   
   // Extrair informações da mensagem
   const valor = extrairValor(Body || '')
   const data = extrairData(Body || '')
   const dataFormatada = formatarData(data)
   
   console.log('Valor extraído:', valor)
   console.log('Data extraída:', dataFormatada)
   
   // Classificar o gasto usando OpenAI
   const { tipo, categoria, probabilidade } = await classificarGasto(Body || '')
   
   console.log('Classificação:', tipo, categoria, probabilidade)
   
   // Determinar em qual planilha salvar
   const sheetName = tipo === 'PJ' ? 'PJ' : 'PF'
   
   // Salvar na planilha
  //  await adicionarLinhaSheet(sheetName, [
  //    dataFormatada,
  //    Body,
  //    valor,
  //    categoria,
  //    From
  //  ])
   
   console.log('Dados salvos na planilha:', sheetName)
   
   // Criar resposta baseada na classificação
   let mensagemResposta
   
   if (probabilidade < 0.8) {
     // Caso ambíguo, pedir confirmação
     mensagemResposta = `
⛽ *${Body}*
- **Classificação**: ${Math.round(probabilidade * 100)}% ${tipo}

🔍 *É gasto empresarial (PJ) ou pessoal (PF)?*
(Digite 1 para PJ, 2 para PF, ou ignore para aceitar ${tipo})
     `
   } else if (tipo === 'PJ') {
     mensagemResposta = `
✅ *Salvo como GASTO EMPRESARIAL (PJ)!*
📌 **Dica fiscal**: Guarde a nota fiscal para dedução.
     `
   } else {
     mensagemResposta = `
🎬 *Salvo como GASTO PESSOAL (PF)!*
     `
   }
   
   console.log('Resposta enviada:', mensagemResposta)
   
   // Retornar resposta para o Twilio (XML)
   return `
     <Response>
       <Message>${mensagemResposta}</Message>
     </Response>
   `
 } catch (error) {
   console.error('Erro no processamento:', error)
   
   return `
     <Response>
       <Message>❌ Ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.</Message>
     </Response>
   `
 }
})

// Função para processar comandos especiais
async function processarComando(comando: string, telefone: string) {
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
     return await gerarEEnviarRelatorio(telefone, mes, ano)
   }
   
   // Comando não reconhecido
   console.log('Comando não reconhecido:', comando)
   return `
     <Response>
       <Message>❓ Comando não reconhecido. Comandos disponíveis:
- !relatorio [mês] [ano] - Solicitar relatório</Message>
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
   'janeiro', 'fevereiro', 'março', 'abril',
   'maio', 'junho', 'julho', 'agosto',
   'setembro', 'outubro', 'novembro', 'dezembro'
 ]
 return meses[new Date().getMonth()]
}

// // Função para gerar e enviar relatório
// async function gerarEEnviarRelatorio(telefone: string, mes: string, ano: string) {
//  try {
//    console.log(`Gerando relatório para ${mes}/${ano}`)
   
//    // Obter dados para o período
//    const gastosPJ = await obterGastosPorMes('PJ', mes, ano)
//    const gastosPF = await obterGastosPorMes('PF', mes, ano)
   
//    console.log(`Encontrados ${gastosPJ.length} gastos PJ e ${gastosPF.length} gastos PF`)
   
//    // Verificar se há dados para gerar relatório
//    if (gastosPJ.length === 0 && gastosPF.length === 0) {
//      return `
//        <Response>
//          <Message>Não encontrei gastos registrados para ${mes}/${ano}. Registre alguns gastos primeiro.</Message>
//        </Response>
//      `
//    }
   
//    // Calcular totais
//    const totalPJ = gastosPJ.reduce((acc, item) => acc + Number(item[2] || 0), 0)
//    const totalPF = gastosPF.reduce((acc, item) => acc + Number(item[2] || 0), 0)
   
//    // Agrupar por categoria
//    const categoriasPJ = agruparPorCategoria(gastosPJ)
//    const categoriasPF = agruparPorCategoria(gastosPF)
   
//    console.log('Gerando insights financeiros...')
   
//    // Gerar insights com OpenAI
//    const insights = await gerarInsightsFinanceiros({
//      totalPJ,
//      totalPF,
//      categoriasPJ,
//      categoriasPF,
//      mes,
//      ano
//    })
   
//    // Criar mensagem do relatório
//    const mensagemRelatorio = `
// 📊 RELATÓRIO FINANCEIRO: ${mes.toUpperCase()}/${ano}

// 💼 GASTOS PJ: R$ ${totalPJ.toFixed(2)}
// Principais categorias:
// ${categoriasPJ.slice(0, 3).map(c => `• ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}

// 👤 GASTOS PF: R$ ${totalPF.toFixed(2)}
// Principais categorias:
// ${categoriasPF.slice(0, 3).map(c => `• ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}

// ✨ INSIGHTS:
// ${insights.map(i => `• ${i}`).join('\n')}
//    `
   
//    console.log('Relatório gerado com sucesso')
   
//    // Retornar resposta para o Twilio
//    return `
//      <Response>
//        <Message>${mensagemRelatorio}</Message>
//      </Response>
//    `
//  } catch (error) {
//    console.error('Erro ao gerar relatório:', error)
   
//    return `
//      <Response>
//        <Message>❌ Ocorreu um erro ao gerar o relatório. Por favor, tente novamente.</Message>
//      </Response>
//    `
//  }
// }

// // Função para obter gastos por mês
// async function obterGastosPorMes(tipo: string, mes: string, ano: string) {
//  const meses = {
//    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
//    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
//    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
//  }
 
//  const mesNumero = meses[mes.toLowerCase()]
//  if (!mesNumero) {
//    console.error('Mês inválido:', mes)
//    return []
//  }
 
//  try {
//    const todosDados = await obterDadosSheet(tipo, 'A2:E1000')
   
//    // Filtrar por data (formato DD/MM/AAAA)
//    return todosDados.filter(linha => {
//      if (!linha[0]) return false
//      const data = linha[0]
//      return data.includes(`/${mesNumero}/${ano}`) || data.includes(`/${mesNumero}/${ano.substring(2)}`)
//    })
//  } catch (error) {
//    console.error(`Erro ao obter dados da planilha ${tipo}:`, error)
//    return []
//  }
// }

// // Função para agrupar gastos por categoria
// function agruparPorCategoria(dados) {
//  const categorias = {}
 
//  dados.forEach(linha => {
//    if (!linha[3]) return
   
//    const categoria = linha[3]
//    const valor = Number(linha[2] || 0)
   
//    if (!categorias[categoria]) {
//      categorias[categoria] = 0
//    }
   
//    categorias[categoria] += valor
//  })
 
//  // Converter para array e ordenar
//  return Object.entries(categorias)
//    .map(([categoria, total]) => ({ categoria, total }))
//    .sort((a, b) => Number(b.total) - Number(a.total))
// }

// // Função para gerar insights com IA
// async function gerarInsightsFinanceiros(dados) {
//  try {
//    const openai = getOpenAIClient()
   
//    const prompt = `
//      Analise os seguintes dados financeiros de ${dados.mes}/${dados.ano}:
     
//      Gastos PJ Total: R$ ${dados.totalPJ.toFixed(2)}
//      Principais categorias PJ:
//      ${dados.categoriasPJ.map(c => `- ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}
     
//      Gastos PF Total: R$ ${dados.totalPF.toFixed(2)}
//      Principais categorias PF:
//      ${dados.categoriasPF.map(c => `- ${c.categoria}: R$ ${c.total.toFixed(2)}`).join('\n')}
     
//      Gere 3-5 insights financeiros úteis sobre estes dados.
//      Formato em tópicos curtos e diretos, cada um com no máximo 2 linhas.
//      Não use bullet points, apenas texto simples.
//      Separe cada insight por quebra de linha.
//    `
   
//    const response = await openai.chat.completions.create({
//      model: "gpt-3.5-turbo",
//      messages: [{ role: "user", content: prompt }]
//    })
   
//    const texto = response.choices[0].message?.content || ''
//    return texto.split('\n').filter(line => line.trim().length > 0)
//  } catch (error) {
//    console.error('Erro ao gerar insights:', error)
//    return [
//      'Não foi possível gerar insights neste momento.',
//      'Revise seus gastos para identificar oportunidades de economia.'
//    ]
//  }
// }