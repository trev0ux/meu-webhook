// server/api/utils/multi-value-processor.ts
import { validarEExtrairDados } from './input-validator'

/**
 * Interface para representar uma transação extraída do texto
 */
export interface Transacao {
  descricao: string
  valor: number
  data: Date
  textoOriginal: string
}

/**
 * Verifica se a mensagem contém múltiplas transações baseado na presença
 * de múltiplos valores monetários (R$) ou linhas separadas
 */
export function contemMultiplasTransacoes(mensagem: string): boolean {
  // Normaliza quebras de linha
  const textoNormalizado = mensagem.replace(/\r\n/g, '\n')

  // Verifica se há múltiplas linhas com conteúdo significativo
  const linhas = textoNormalizado.split('\n').filter((linha) => linha.trim().length > 0)
  if (linhas.length > 1) {
    return true
  }

  // Conta ocorrências de "R$" para verificar múltiplos valores
  const ocorrenciasRS = (mensagem.match(/R\$\s*\d+/gi) || []).length
  return ocorrenciasRS > 1
}

/**
 * Extrai múltiplas transações de uma mensagem
 * Tenta identificar transações por quebras de linha ou por múltiplos "R$"
 */
export function extrairMultiplasTransacoes(mensagem: string): Transacao[] {
  const transacoes: Transacao[] = []

  // Normaliza quebras de linha
  const textoNormalizado = mensagem.replace(/\r\n/g, '\n')

  // Divide por linhas para processar cada uma
  const linhas = textoNormalizado.split('\n').filter((linha) => linha.trim().length > 0)

  if (linhas.length > 1) {
    // Processa cada linha como uma transação potencial
    for (const linha of linhas) {
      const dadosInput = validarEExtrairDados(linha)
      if (dadosInput.isValid) {
        transacoes.push({
          descricao: dadosInput.descricao,
          valor: dadosInput.valor,
          data: dadosInput.data,
          textoOriginal: linha
        })
      }
    }
  } else {
    // Pode ser uma linha única com múltiplos valores
    // Vamos tentar identificar os padrões "Descrição R$ valor"
    const matches = mensagem.match(/(.+?)R\$\s*(\d+[.,]?\d*)/gi)

    if (matches && matches.length > 1) {
      for (let match of matches) {
        const dadosInput = validarEExtrairDados(match)
        if (dadosInput.isValid) {
          transacoes.push({
            descricao: dadosInput.descricao,
            valor: dadosInput.valor,
            data: dadosInput.data,
            textoOriginal: match
          })
        }
      }
    } else {
      // Tenta dividir em frases (terminadas com ponto) que contenham R$
      const frases = mensagem.split('.').filter((frase) => frase.trim().length > 0)

      for (const frase of frases) {
        if (frase.includes('R$')) {
          const dadosInput = validarEExtrairDados(frase)
          if (dadosInput.isValid) {
            transacoes.push({
              descricao: dadosInput.descricao,
              valor: dadosInput.valor,
              data: dadosInput.data,
              textoOriginal: frase
            })
          }
        }
      }
    }
  }

  return transacoes
}

/**
 * Formata um resumo das transações processadas para exibição
 */
export function formatarResumoTransacoes(transacoes: Transacao[]): string {
  if (transacoes.length === 0) {
    return 'Nenhuma transação válida identificada.'
  }

  let resumo = `✅ *${transacoes.length} transações registradas com sucesso!*\n\n`

  // Calcular valor total
  const valorTotal = transacoes.reduce((total, t) => total + t.valor, 0)
  resumo += `💰 *Valor total: R$ ${valorTotal.toFixed(2)}*\n\n`

  // Resumo individual (limitado a 5 para não ficar muito grande)
  resumo += `📝 *Detalhes:*\n`

  const transacoesExibidas = transacoes.slice(0, 5)

  for (const [index, transacao] of transacoesExibidas.entries()) {
    resumo += `${index + 1}. "${transacao.descricao}" - R$ ${transacao.valor.toFixed(2)}\n`
  }

  // Se houver mais transações que não foram exibidas
  if (transacoes.length > 5) {
    resumo += `...e mais ${transacoes.length - 5} transações.\n`
  }

  resumo += '\n⚠️ Use !relatorio para ver todas as transações organizadas.'

  return resumo
}
