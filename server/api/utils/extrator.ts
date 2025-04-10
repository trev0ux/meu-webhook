// server/utils/extrator.ts
export function extrairValor(texto: string): number {
  const textoNormalizado = (texto || '').trim().toLowerCase()
  
  const padroes = [
    /r\$\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/,
    
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*$/,
    
    /(\d+(?:[.,]\d{1,2})?)\s*$/
  ]
  
  for (const regex of padroes) {
    const match = textoNormalizado.match(regex)
    
    if (match) {
      let valorCapturado = match[1]
      
      valorCapturado = valorCapturado.replace(',', '.')
      
      valorCapturado = valorCapturado.replace(/\./g, '')
      
      const valor = parseFloat(valorCapturado)
      
      return isNaN(valor) ? 0 : valor
    }
  }
  
  return 0
}

export function extrairData(texto: string): Date {
  const regexData = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/
  const match = texto.match(regexData)
  
  if (match) {
    const dia = parseInt(match[1])
    const mes = parseInt(match[2]) - 1 // Mês em JavaScript é 0-indexed
    let ano = new Date().getFullYear()
    
    if (match[3]) {
      ano = parseInt(match[3])
      if (ano < 100) ano += 2000 // Converter ano de 2 dígitos
    }
    
    return new Date(ano, mes, dia)
  }
  
  return new Date()
}

export function formatarData(data: Date): string {
  return data.toLocaleDateString('pt-BR')
}