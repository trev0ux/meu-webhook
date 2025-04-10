export function extrairValor(texto: string): number {
  // Se não houver texto, retorna 0
  if (!texto) return 0

  const textoNormalizado = texto.trim().toLowerCase()

  // Diferentes padrões para capturar valores monetários
  const padroes = [
    // Padrão com R$: "R$ 1.234,56" ou "R$1234.56"
    /r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+(?:\.\d{1,2})?|\d+)/i,

    // Padrão sem R$ no final da string: "texto 1.234,56" ou "texto 1234.56"
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s*$/,

    // Padrão para capturar valores numéricos em qualquer posição
    /\b(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+(?:\.\d{1,2})?|\d+)\b/
  ]

  // Verificar cada padrão na ordem definida
  for (const regex of padroes) {
    const matches = textoNormalizado.match(new RegExp(regex, 'g')) || []

    if (matches.length > 0) {
      // Para cada match encontrado
      for (const matchStr of matches) {
        const match = matchStr.match(regex) // rematching para capturar o grupo

        if (match && match[1]) {
          let valorCapturado = match[1]

          // Primeiro remover separadores de milhares (pontos quando seguidos de 3 dígitos)
          valorCapturado = valorCapturado.replace(/\.(?=\d{3})/g, '')

          // Converter vírgula decimal para ponto
          valorCapturado = valorCapturado.replace(',', '.')

          const valor = parseFloat(valorCapturado)

          // Se não for NaN e for maior que zero, retorna imediatamente
          if (!isNaN(valor) && valor > 0) {
            return valor
          }
        }
      }
    }
  }

  return 0
}

export function extrairData(texto: string): Date {
  const regexData = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/
  const match = texto.match(regexData)

  if (match) {
    const dia = parseInt(match[1])
    const mes = parseInt(match[2]) - 1
    let ano = new Date().getFullYear()

    if (match[3]) {
      ano = parseInt(match[3])
      if (ano < 100) ano += 2000
    }

    return new Date(ano, mes, dia)
  }

  return new Date()
}

export function formatarData(data: Date): string {
  return data.toLocaleDateString('pt-BR')
}
