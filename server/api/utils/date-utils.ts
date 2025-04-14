// server/api/utils/date-utils.ts

/**
 * Obtém o nome do mês atual em português
 * @returns Nome do mês atual
 */
export function obterMesAtual(): string {
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

/**
 * Formata uma data para o formato DD/MM/YYYY
 * @param data Objeto Date
 * @returns Data formatada como string
 */
export function formatarData(data: Date): string {
  const dia = data.getDate().toString().padStart(2, '0')
  const mes = (data.getMonth() + 1).toString().padStart(2, '0')
  const ano = data.getFullYear()

  return `${dia}/${mes}/${ano}`
}

/**
 * Obtém o número da semana atual no ano
 * @param data Objeto Date (opcional, usa data atual se não fornecido)
 * @returns Número da semana (1-53)
 */
export function obterNumeroSemana(data: Date = new Date()): number {
  // Criar uma cópia da data para não modificar o original
  const dataTemp = new Date(data)

  // Encontrar o primeiro dia do ano
  const primeiroDiaAno = new Date(data.getFullYear(), 0, 1)

  // Ajustar para o primeiro dia ser domingo (início da semana)
  const diaPrimeiroJaneiro = primeiroDiaAno.getDay()
  primeiroDiaAno.setDate(primeiroDiaAno.getDate() - diaPrimeiroJaneiro)

  // Calcular a diferença em dias entre a data e o primeiro domingo do ano
  const diffDias = Math.floor(
    (dataTemp.getTime() - primeiroDiaAno.getTime()) / (24 * 60 * 60 * 1000)
  )

  // Converter em semanas e adicionar 1 (pois a primeira semana é 1, não 0)
  return Math.floor(diffDias / 7) + 1
}

/**
 * Obtém o primeiro e último dia da semana que contém a data especificada
 * @param data Objeto Date (opcional, usa data atual se não fornecido)
 * @returns Objeto com primeiro e último dia da semana
 */
export function obterPrimeiroEUltimoDiaSemana(data: Date = new Date()): {
  inicio: Date
  fim: Date
} {
  // Criar uma cópia da data para não modificar o original
  const dataTemp = new Date(data)

  // Obter dia da semana (0 = domingo, 1 = segunda, etc.)
  const diaSemana = dataTemp.getDay()

  // Calcular o primeiro dia da semana (domingo)
  const primeiroDia = new Date(dataTemp)
  primeiroDia.setDate(dataTemp.getDate() - diaSemana)

  // Calcular o último dia da semana (sábado)
  const ultimoDia = new Date(primeiroDia)
  ultimoDia.setDate(primeiroDia.getDate() + 6)

  return { inicio: primeiroDia, fim: ultimoDia }
}

/**
 * Obtém o primeiro e último dia do mês que contém a data especificada
 * @param data Objeto Date (opcional, usa data atual se não fornecido)
 * @returns Objeto com primeiro e último dia do mês
 */
export function obterPrimeiroEUltimoDiaMes(data: Date = new Date()): { inicio: Date; fim: Date } {
  // Primeiro dia do mês
  const primeiroDia = new Date(data.getFullYear(), data.getMonth(), 1)

  // Último dia do mês
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0)

  return { inicio: primeiroDia, fim: ultimoDia }
}

/**
 * Converte um nome de mês para número (1-12)
 * @param mes Nome do mês em português
 * @returns Número do mês (1-12)
 */
export function converterMesParaNumero(mes: string): number {
  const meses = {
    janeiro: 1,
    fevereiro: 2,
    março: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12
  }

  const mesLowerCase = mes.toLowerCase()

  // Se for um número entre 1 e 12, retorna o próprio número
  if (/^([1-9]|1[0-2])$/.test(mes)) {
    return parseInt(mes)
  }

  // Se for nome de mês, retorna o número correspondente
  return meses[mesLowerCase] || 1 // Retorna 1 (janeiro) se não encontrar
}

/**
 * Converte um número de mês para nome em português
 * @param mes Número do mês (1-12)
 * @returns Nome do mês em português
 */
export function converterNumeroParaMes(mes: number): string {
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

  // Ajustar para índice 0-11
  const mesIndex = mes - 1

  // Verificar se é um índice válido
  if (mesIndex >= 0 && mesIndex < 12) {
    return meses[mesIndex]
  }

  // Retornar janeiro por padrão
  return 'janeiro'
}
