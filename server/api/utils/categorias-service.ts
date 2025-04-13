// server/utils/categorias-service.ts
import {
  buscarCategoriasUsuario,
  criarCategoria,
  importarCategoriasPadrao
} from '../../../db/categories'
import { findUser } from '../../../db/users'

/**
 * Interface para representar uma categoria
 */
export interface Categoria {
  id?: number
  nome: string
  tipo: string
  natureza?: string
  icone?: string
  user_id?: number
  ativo?: boolean
  ordem?: number
}

/**
 * Obtém as categorias padrão baseadas no perfil do usuário
 */
export async function obterCategoriasPadrao(perfil: string, tipo?: string): Promise<Categoria[]> {
  if (perfil === 'pessoa_fisica') {
    return [
      { nome: 'Alimentação', tipo: 'PF', natureza: 'despesa', icone: '🍽️' },
      { nome: 'Transporte', tipo: 'PF', natureza: 'despesa', icone: '🚗' },
      { nome: 'Moradia', tipo: 'PF', natureza: 'despesa', icone: '🏠' },
      { nome: 'Saúde', tipo: 'PF', natureza: 'despesa', icone: '⚕️' },
      { nome: 'Lazer', tipo: 'PF', natureza: 'despesa', icone: '🎬' },
      { nome: 'Educação', tipo: 'PF', natureza: 'despesa', icone: '📚' },
      { nome: 'Compras', tipo: 'PF', natureza: 'despesa', icone: '🛒' },
      { nome: 'Outros', tipo: 'PF', natureza: 'despesa', icone: '📋' },
      { nome: 'Salário', tipo: 'PF', natureza: 'receita', icone: '💰' },
      { nome: 'Freelance', tipo: 'PF', natureza: 'receita', icone: '🔨' },
      { nome: 'Rendimentos', tipo: 'PF', natureza: 'receita', icone: '💹' },
      { nome: 'Outros Ganhos', tipo: 'PF', natureza: 'receita', icone: '💸' }
    ]
  } else {
    // Para empreendedor
    if (tipo === 'PJ') {
      return [
        { nome: 'Alimentação PJ', tipo: 'PJ', natureza: 'despesa', icone: '🍽️' },
        { nome: 'Marketing', tipo: 'PJ', natureza: 'despesa', icone: '📢' },
        { nome: 'Material de Escritório', tipo: 'PJ', natureza: 'despesa', icone: '🖊️' },
        { nome: 'Software/Assinaturas', tipo: 'PJ', natureza: 'despesa', icone: '💻' },
        { nome: 'Serviços Terceiros', tipo: 'PJ', natureza: 'despesa', icone: '🔧' },
        { nome: 'Impostos', tipo: 'PJ', natureza: 'despesa', icone: '📑' },
        { nome: 'Equipamentos', tipo: 'PJ', natureza: 'despesa', icone: '🖥️' },
        { nome: 'Outros PJ', tipo: 'PJ', natureza: 'despesa', icone: '📋' },
        { nome: 'Vendas', tipo: 'PJ', natureza: 'receita', icone: '💰' },
        { nome: 'Prestação de Serviços', tipo: 'PJ', natureza: 'receita', icone: '🔨' },
        { nome: 'Consultoria', tipo: 'PJ', natureza: 'receita', icone: '📊' },
        { nome: 'Comissões', tipo: 'PJ', natureza: 'receita', icone: '💹' },
        { nome: 'Outros Ganhos PJ', tipo: 'PJ', natureza: 'receita', icone: '💸' }
      ]
    } else if (tipo === 'PF') {
      return [
        { nome: 'Alimentação PF', tipo: 'PF', natureza: 'despesa', icone: '🍽️' },
        { nome: 'Transporte', tipo: 'PF', natureza: 'despesa', icone: '🚗' },
        { nome: 'Moradia', tipo: 'PF', natureza: 'despesa', icone: '🏠' },
        { nome: 'Saúde', tipo: 'PF', natureza: 'despesa', icone: '⚕️' },
        { nome: 'Lazer', tipo: 'PF', natureza: 'despesa', icone: '🎬' },
        { nome: 'Educação', tipo: 'PF', natureza: 'despesa', icone: '📚' },
        { nome: 'Outros PF', tipo: 'PF', natureza: 'despesa', icone: '📋' },
        { nome: 'Salário', tipo: 'PF', natureza: 'receita', icone: '💰' },
        { nome: 'Rendimentos', tipo: 'PF', natureza: 'receita', icone: '💹' },
        { nome: 'Outros Ganhos PF', tipo: 'PF', natureza: 'receita', icone: '💸' }
      ]
    } else {
      // Retornar combinação de ambos se tipo não for especificado
      const categoriasPJ = await obterCategoriasPadrao('empresario_individual', 'PJ')
      const categoriasPF = await obterCategoriasPadrao('empresario_individual', 'PF')
      return [...categoriasPJ, ...categoriasPF]
    }
  }
}

/**
 * Obtém as categorias do usuário com fallback para categorias padrão
 *
 * @param usuarioId ID do usuário
 * @param tipo Tipo das categorias (PJ, PF ou undefined para ambos)
 * @param natureza Natureza das categorias (despesa, receita ou undefined para ambos)
 * @returns Lista de categorias
 */
export async function obterCategoriasUsuario(
  usuarioId: number,
  tipo?: string,
  natureza?: string
): Promise<Categoria[]> {
  try {
    // Buscar categorias do usuário no banco
    const categorias = await buscarCategoriasUsuario(usuarioId, {
      tipo,
      natureza,
      ativo: true // Somente categorias ativas
    })

    // Se encontrou categorias personalizadas, retorna
    if (categorias && categorias.length > 0) {
      return categorias
    }

    // Se não encontrou, buscar perfil do usuário e retornar categorias padrão
    const user = await findUser(usuarioId)

    if (!user) {
      throw new Error(`Usuário ${usuarioId} não encontrado`)
    }

    console.log(`Sem categorias personalizadas para o usuário ${usuarioId}. Retornando padrão.`)

    // Importar categorias padrão para este usuário
    await importarCategoriasPadrao(usuarioId, user.perfil)

    // Buscar categorias novamente (agora devem estar no banco)
    return await buscarCategoriasUsuario(usuarioId, {
      tipo,
      natureza,
      ativo: true
    })
  } catch (error) {
    console.error('Erro ao obter categorias do usuário:', error)

    // Em caso de erro, tenta retornar categorias padrão diretamente (sem salvar no banco)
    console.log('Retornando categorias padrão sem persistir no banco...')

    const user = await findUser(usuarioId)

    if (!user) {
      return [] // Retorna array vazio se não encontrar o usuário
    }

    return obterCategoriasPadrao(user.perfil, tipo)
  }
}

/**
 * Salva categorias personalizadas para o usuário
 *
 * @param usuarioId ID do usuário
 * @param categorias Lista de categorias a serem salvas
 * @param tipo Tipo opcional (PJ ou PF) a ser aplicado a todas as categorias
 * @returns Promessa vazia
 */
export async function salvarCategoriasPersonalizadas(
  usuarioId: number,
  categorias: Categoria[],
  tipo?: string
): Promise<void> {
  try {
    // Verificar se usuário existe
    const user = await findUser(usuarioId)

    if (!user) {
      throw new Error(`Usuário ${usuarioId} não encontrado`)
    }

    console.log(`Salvando ${categorias.length} categorias para o usuário ${usuarioId}`)

    // Processar cada categoria
    for (const categoria of categorias) {
      // Garantir que tipo está definido
      if (tipo) {
        categoria.tipo = tipo
      }

      // Adicionar user_id
      categoria.user_id = usuarioId

      // Garantir que natureza está definida
      if (!categoria.natureza) {
        // Se não foi informada, tenta detectar por palavras no nome
        if (isNomeCategoriaDespesa(categoria.nome)) {
          categoria.natureza = 'despesa'
        } else if (isNomeCategoriaReceita(categoria.nome)) {
          categoria.natureza = 'receita'
        } else {
          // Default para despesa
          categoria.natureza = 'despesa'
        }
      }

      // Garantir que ícone está definido
      if (!categoria.icone) {
        categoria.icone = obterIconePadrao(categoria.nome)
      }

      // Garantir que ativo está definido
      if (categoria.ativo === undefined) {
        categoria.ativo = true
      }

      // Criar categoria no banco
      await criarCategoria({
        usuario_id: usuarioId,
        nome: categoria.nome,
        tipo: categoria.tipo,
        natureza: categoria.natureza,
        icone: categoria.icone,
        ordem: categoria.ordem,
        ativo: categoria.ativo
      })
    }

    console.log(`${categorias.length} categorias salvas com sucesso para o usuário ${usuarioId}`)
  } catch (error) {
    console.error('Erro ao salvar categorias personalizadas:', error)
    throw error
  }
}

/**
 * Verifica se o nome da categoria parece ser uma despesa
 */
function isNomeCategoriaDespesa(nome: string): boolean {
  const termosComuns = [
    'gasto',
    'despesa',
    'compra',
    'pagamento',
    'conta',
    'alimentação',
    'transporte',
    'moradia',
    'aluguel',
    'saúde',
    'médico',
    'remédio',
    'educação',
    'curso',
    'lazer',
    'diversão',
    'viagem',
    'restaurante',
    'mercado',
    'supermercado',
    'combustível',
    'gasolina',
    'água',
    'luz',
    'energia',
    'telefone',
    'internet',
    'imposto',
    'taxa',
    'tarifa',
    'material',
    'equipamento',
    'roupa',
    'vestuário'
  ]

  const nomeLower = nome.toLowerCase()

  return termosComuns.some((termo) => nomeLower.includes(termo))
}

/**
 * Verifica se o nome da categoria parece ser uma receita
 */
function isNomeCategoriaReceita(nome: string): boolean {
  const termosComuns = [
    'receita',
    'ganho',
    'renda',
    'salário',
    'venda',
    'prestação',
    'serviço',
    'comissão',
    'freelance',
    'consultoria',
    'honorário',
    'rendimento',
    'investimento',
    'dividendo',
    'lucro',
    'prêmio',
    'bônus',
    'aluguel',
    'royalty',
    'recebimento',
    'pagamento'
  ]

  const nomeLower = nome.toLowerCase()

  return termosComuns.some((termo) => nomeLower.includes(termo))
}

/**
 * Obtém um ícone padrão baseado no nome da categoria
 */
function obterIconePadrao(nomeCategoria: string): string {
  const nomeLower = nomeCategoria.toLowerCase()

  // Mapeamento de palavras-chave para ícones
  const icones = {
    aliment: '🍽️',
    comida: '🍽️',
    restaurante: '🍽️',
    mercado: '🛒',
    transport: '🚗',
    uber: '🚗',
    taxi: '🚕',
    moradia: '🏠',
    casa: '🏠',
    aluguel: '🏠',
    saude: '⚕️',
    médic: '💊',
    hospital: '🏥',
    remédio: '💊',
    lazer: '🎬',
    cinema: '🎬',
    viagem: '✈️',
    educac: '📚',
    escola: '🏫',
    curso: '📚',
    livro: '📚',
    marketing: '📢',
    anuncio: '📣',
    publicidade: '📣',
    software: '💻',
    assinatura: '📱',
    material: '📦',
    escritorio: '🖊️',
    imposto: '📑',
    taxa: '📑',
    servico: '🔧',
    venda: '💰',
    receita: '💸',
    salario: '💼',
    freelance: '🔨',
    cliente: '👥',
    comiss: '💹',
    internet: '🌐',
    telefone: '📱',
    luz: '💡',
    energia: '⚡',
    água: '💧',
    gás: '🔥',
    roupa: '👕',
    vestuário: '👖',
    supermercado: '🛒',
    pet: '🐶',
    animal: '🐱',
    beleza: '💄',
    estética: '💅',
    academia: '🏋️',
    esporte: '⚽',
    presente: '🎁',
    doação: '❤️',
    jurídico: '⚖️',
    advogado: '👨‍⚖️',
    contador: '🧮',
    combustível: '⛽',
    gasolina: '⛽',
    estacionamento: '🅿️',
    hospedagem: '🏨',
    hotel: '🏨',
    seguro: '🔒',
    investimento: '📈',
    rendimento: '💹',
    dividendo: '💰',
    consult: '💼',
    projeto: '📋',
    equipamento: '🖥️'
  }

  // Procurar a correspondência mais próxima
  for (const [chave, icone] of Object.entries(icones)) {
    if (nomeLower.includes(chave)) {
      return icone
    }
  }

  // Ícones padrão por tipo
  if (nomeLower.includes('pj')) return '💼'
  if (nomeLower.includes('pf')) return '👤'

  // Se for receita, usar ícone de dinheiro
  if (isNomeCategoriaReceita(nomeCategoria)) return '💰'

  return '📋' // Ícone genérico
}
