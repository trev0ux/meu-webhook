// server/api/utils/input-validator.ts
import { extrairValor, extrairData } from './extrator'

/**
 * Interface para os dados extraídos de uma mensagem
 */
interface InputData {
  isValid: boolean
  descricao: string
  valor: number
  data: Date
  erro?: string
}

/**
 * Valida e extrai dados de uma mensagem no formato:
 * nome/descrição + valor monetário + data (opcional)
 *
 * @param mensagem A mensagem a ser validada e processada
 * @returns Objeto com os dados extraídos e flag de validação
 */
export function validarEExtrairDados(mensagem: string): InputData {
  // Padronizar a mensagem
  const mensagemNormalizada = mensagem.trim()

  // Verificar se a mensagem está vazia
  if (!mensagemNormalizada) {
    return {
      isValid: false,
      descricao: '',
      valor: 0,
      data: new Date(),
      erro: 'Mensagem vazia'
    }
  }

  // Extrair o valor monetário
  const valor = extrairValor(mensagemNormalizada)

  // Se não encontrou valor monetário, a mensagem é inválida
  if (valor === 0) {
    return {
      isValid: false,
      descricao: mensagemNormalizada,
      valor: 0,
      data: new Date(),
      erro: 'Valor monetário não encontrado. Por favor, inclua um valor com R$.'
    }
  }

  // Extrair a data (se presente)
  const data = extrairData(mensagemNormalizada)

  // Extrair a descrição (tudo que não é valor monetário ou data)
  let descricao = mensagemNormalizada
    // Remover o valor monetário (formato R$ X.XXX,XX)
    .replace(/r\$\s*\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/i, '')
    // Remover o valor monetário (outros formatos)
    .replace(/\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g, '')
    // Remover formatos de data (DD/MM/YYYY, DD/MM, etc)
    .replace(/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g, '')
    .trim()

  // Se não sobrou nada na descrição, é inválido
  if (!descricao) {
    return {
      isValid: false,
      descricao: '',
      valor,
      data,
      erro: 'Descrição/nome não encontrado. Por favor, informe o que está registrando.'
    }
  }

  // Tudo validado corretamente
  return {
    isValid: true,
    descricao,
    valor,
    data
  }
}

/**
 * Gera uma mensagem de erro amigável para inputs inválidos
 */
export function gerarMensagemErroInput(resultado: InputData): string {
  let mensagem = '❌ ' + (resultado.erro || 'Formato inválido.')

  mensagem += '\n\n📝 Por favor, use o formato: "Descrição R$ Valor [DD/MM]"'
  mensagem += '\n\nExemplos:'
  mensagem += '\n✅ "Almoço com cliente R$ 50"'
  mensagem += '\n✅ "Recebi R$ 1000 do cliente ABC"'
  mensagem += '\n✅ "Compra supermercado R$ 230,50 12/04"'

  return mensagem
}
