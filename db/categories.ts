// db/categorias.ts
import db from './index'

/**
 * Interface para categorias
 */
export interface Categoria {
  id?: number
  usuario_id: number
  nome: string
  tipo: string // 'PJ' ou 'PF'
  natureza: string // 'despesa' ou 'receita'
  icone?: string
  ordem?: number
  ativo: boolean
  criado_em?: Date
  atualizado_em?: Date
}

/**
 * Busca todas as categorias de um usuário
 *
 * @param usuario_id ID do usuário
 * @param filtros Filtros opcionais (tipo, natureza, ativo)
 * @returns Lista de categorias
 */
export async function buscarCategoriasUsuario(
  usuario_id: number,
  filtros: {
    tipo?: string
    natureza?: string
    ativo?: boolean
  } = {}
): Promise<Categoria[]> {
  try {
    let query = `
      SELECT * FROM categorias
      WHERE usuario_id = $1
    `

    const params = [usuario_id]
    let paramIndex = 2

    // Adicionar filtros à query
    if (filtros.tipo) {
      query += ` AND tipo = $${paramIndex}`
      params.push(filtros.tipo)
      paramIndex++
    }

    if (filtros.natureza) {
      query += ` AND natureza = $${paramIndex}`
      params.push(filtros.natureza)
      paramIndex++
    }

    if (filtros.ativo !== undefined) {
      query += ` AND ativo = $${paramIndex}`
      params.push(filtros.ativo)
      paramIndex++
    }

    // Ordenar por ordem, depois nome
    query += ` ORDER BY ordem ASC NULLS LAST, nome ASC`

    const resultado = await db.query(query, params)

    return resultado.rows
  } catch (error) {
    console.error(`Erro ao buscar categorias do usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Busca uma categoria específica pelo ID
 *
 * @param id ID da categoria
 * @param usuario_id ID do usuário (para segurança)
 * @returns A categoria encontrada ou null
 */
export async function buscarCategoriaPorId(
  id: number,
  usuario_id: number
): Promise<Categoria | null> {
  try {
    const query = `
      SELECT * FROM categorias
      WHERE id = $1 AND usuario_id = $2
    `

    const resultado = await db.query(query, [id, usuario_id])

    if (resultado.rows.length === 0) {
      return null
    }

    return resultado.rows[0]
  } catch (error) {
    console.error(`Erro ao buscar categoria ${id} do usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Cria uma nova categoria
 *
 * @param categoria Dados da categoria
 * @returns A categoria criada
 */
export async function criarCategoria(
  categoria: Omit<Categoria, 'id' | 'criado_em' | 'atualizado_em'>
): Promise<Categoria> {
  try {
    // Obter a próxima ordem disponível
    const ordemQuery = `
      SELECT COALESCE(MAX(ordem), 0) + 1 as proxima_ordem 
      FROM categorias 
      WHERE usuario_id = $1 AND tipo = $2 AND natureza = $3
    `

    const ordemResultado = await db.query(ordemQuery, [
      categoria.usuario_id,
      categoria.tipo,
      categoria.natureza
    ])

    const ordem = categoria.ordem || ordemResultado.rows[0].proxima_ordem

    // Inserir nova categoria
    const query = `
      INSERT INTO categorias
      (usuario_id, nome, tipo, natureza, icone, ordem, ativo, criado_em, atualizado_em)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `

    const resultado = await db.query(query, [
      categoria.usuario_id,
      categoria.nome,
      categoria.tipo,
      categoria.natureza,
      categoria.icone || null,
      ordem,
      categoria.ativo !== undefined ? categoria.ativo : true
    ])

    return resultado.rows[0]
  } catch (error) {
    console.error(`Erro ao criar categoria para usuário ${categoria.usuario_id}:`, error)
    throw error
  }
}

/**
 * Atualiza uma categoria existente
 *
 * @param id ID da categoria
 * @param usuario_id ID do usuário (para segurança)
 * @param dados Dados a serem atualizados
 * @returns A categoria atualizada ou null se não encontrada
 */
export async function atualizarCategoria(
  id: number,
  usuario_id: number,
  dados: Partial<Omit<Categoria, 'id' | 'usuario_id' | 'criado_em' | 'atualizado_em'>>
): Promise<Categoria | null> {
  try {
    // Verificar se a categoria existe
    const categoriaExistente = await buscarCategoriaPorId(id, usuario_id)

    if (!categoriaExistente) {
      return null
    }

    // Montar query de atualização
    const campos = Object.keys(dados)
    if (campos.length === 0) {
      return categoriaExistente // Nada para atualizar
    }

    let query = `
      UPDATE categorias
      SET atualizado_em = CURRENT_TIMESTAMP
    `

    const params = []
    let paramIndex = 1

    campos.forEach((campo) => {
      query += `, ${campo} = $${paramIndex}`
      params.push(dados[campo])
      paramIndex++
    })

    query += `
      WHERE id = $${paramIndex} AND usuario_id = $${paramIndex + 1}
      RETURNING *
    `

    params.push(id, usuario_id)

    const resultado = await db.query(query, params)

    return resultado.rows[0]
  } catch (error) {
    console.error(`Erro ao atualizar categoria ${id} do usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Deleta uma categoria
 *
 * @param id ID da categoria
 * @param usuario_id ID do usuário (para segurança)
 * @returns true se deletada com sucesso, false caso contrário
 */
export async function deletarCategoria(id: number, usuario_id: number): Promise<boolean> {
  try {
    const query = `
      DELETE FROM categorias
      WHERE id = $1 AND usuario_id = $2
      RETURNING id
    `

    const resultado = await db.query(query, [id, usuario_id])

    return resultado.rows.length > 0
  } catch (error) {
    console.error(`Erro ao deletar categoria ${id} do usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Importa várias categorias de uma vez
 *
 * @param usuario_id ID do usuário
 * @param categorias Lista de categorias a serem importadas
 * @param substituir Se true, remove categorias existentes do mesmo tipo/natureza
 * @returns Número de categorias importadas
 */
export async function importarCategorias(
  usuario_id: number,
  categorias: Array<Omit<Categoria, 'id' | 'usuario_id' | 'criado_em' | 'atualizado_em'>>,
  substituir: boolean = false
): Promise<number> {
  // Iniciar transação
  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    // Se substituir, excluir categorias existentes do mesmo tipo/natureza
    if (substituir) {
      // Identificar tipos e naturezas únicos nas categorias a importar
      const tiposNaturezas = categorias.reduce((acc, cat) => {
        const key = `${cat.tipo}-${cat.natureza}`
        if (!acc.includes(key)) {
          acc.push(key)
        }
        return acc
      }, [] as string[])

      // Excluir categorias existentes para cada tipo-natureza
      for (const tn of tiposNaturezas) {
        const [tipo, natureza] = tn.split('-')

        const deleteQuery = `
          DELETE FROM categorias
          WHERE usuario_id = $1 AND tipo = $2 AND natureza = $3
        `

        await client.query(deleteQuery, [usuario_id, tipo, natureza])
      }
    }

    // Importar novas categorias
    let importadas = 0

    for (const categoria of categorias) {
      const query = `
        INSERT INTO categorias
        (usuario_id, nome, tipo, natureza, icone, ordem, ativo, criado_em, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `

      await client.query(query, [
        usuario_id,
        categoria.nome,
        categoria.tipo,
        categoria.natureza,
        categoria.icone || null,
        categoria.ordem || importadas + 1,
        categoria.ativo !== undefined ? categoria.ativo : true
      ])

      importadas++
    }

    await client.query('COMMIT')
    return importadas
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`Erro ao importar categorias para usuário ${usuario_id}:`, error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Cria a tabela de categorias, se não existir
 */
export async function criarTabelaCategorias(): Promise<void> {
  try {
    // Verificar se a tabela já existe
    const checkTableQuery = `
      SELECT to_regclass('public.categorias') as table_exists;
    `

    const checkResult = await db.query(checkTableQuery)

    if (checkResult.rows[0].table_exists) {
      console.log('Tabela categorias já existe')
      return
    }

    // Criar tabela
    const createTableQuery = `
      CREATE TABLE categorias (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        nome VARCHAR(100) NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        natureza VARCHAR(20) NOT NULL,
        icone VARCHAR(10),
        ordem INTEGER,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_usuario
          FOREIGN KEY(usuario_id) 
          REFERENCES usuarios(id)
          ON DELETE CASCADE
      );
      
      CREATE INDEX idx_categorias_usuario ON categorias (usuario_id);
      CREATE INDEX idx_categorias_tipo_natureza ON categorias (tipo, natureza);
    `

    await db.query(createTableQuery)

    console.log('Tabela categorias criada com sucesso')
  } catch (error) {
    console.error('Erro ao criar tabela categorias:', error)
    throw error
  }
}

/**
 * Importa categorias padrão para um usuário
 */
export async function importarCategoriasPadrao(
  usuario_id: number,
  perfil: string
): Promise<number> {
  try {
    let categoriasPadrao: Array<
      Omit<Categoria, 'id' | 'usuario_id' | 'criado_em' | 'atualizado_em'>
    > = []

    if (perfil === 'pessoa_fisica') {
      // Categorias padrão para Pessoa Física
      categoriasPadrao = [
        // Despesas
        {
          nome: 'Alimentação',
          tipo: 'PF',
          natureza: 'despesa',
          icone: '🍽️',
          ordem: 1,
          ativo: true
        },
        { nome: 'Transporte', tipo: 'PF', natureza: 'despesa', icone: '🚗', ordem: 2, ativo: true },
        { nome: 'Moradia', tipo: 'PF', natureza: 'despesa', icone: '🏠', ordem: 3, ativo: true },
        { nome: 'Saúde', tipo: 'PF', natureza: 'despesa', icone: '⚕️', ordem: 4, ativo: true },
        { nome: 'Lazer', tipo: 'PF', natureza: 'despesa', icone: '🎬', ordem: 5, ativo: true },
        { nome: 'Educação', tipo: 'PF', natureza: 'despesa', icone: '📚', ordem: 6, ativo: true },
        { nome: 'Compras', tipo: 'PF', natureza: 'despesa', icone: '🛒', ordem: 7, ativo: true },
        { nome: 'Outros', tipo: 'PF', natureza: 'despesa', icone: '📋', ordem: 8, ativo: true },

        // Receitas
        { nome: 'Salário', tipo: 'PF', natureza: 'receita', icone: '💰', ordem: 1, ativo: true },
        { nome: 'Freelance', tipo: 'PF', natureza: 'receita', icone: '🔨', ordem: 2, ativo: true },
        {
          nome: 'Rendimentos',
          tipo: 'PF',
          natureza: 'receita',
          icone: '💹',
          ordem: 3,
          ativo: true
        },
        {
          nome: 'Outros Ganhos',
          tipo: 'PF',
          natureza: 'receita',
          icone: '💸',
          ordem: 4,
          ativo: true
        }
      ]
    } else {
      // Categorias padrão para Empreendedor (PJ + PF)
      categoriasPadrao = [
        // Despesas PJ
        {
          nome: 'Alimentação PJ',
          tipo: 'PJ',
          natureza: 'despesa',
          icone: '🍽️',
          ordem: 1,
          ativo: true
        },
        { nome: 'Marketing', tipo: 'PJ', natureza: 'despesa', icone: '📢', ordem: 2, ativo: true },
        {
          nome: 'Material de Escritório',
          tipo: 'PJ',
          natureza: 'despesa',
          icone: '🖊️',
          ordem: 3,
          ativo: true
        },
        {
          nome: 'Software/Assinaturas',
          tipo: 'PJ',
          natureza: 'despesa',
          icone: '💻',
          ordem: 4,
          ativo: true
        },
        {
          nome: 'Serviços Terceiros',
          tipo: 'PJ',
          natureza: 'despesa',
          icone: '🔧',
          ordem: 5,
          ativo: true
        },
        { nome: 'Impostos', tipo: 'PJ', natureza: 'despesa', icone: '📑', ordem: 6, ativo: true },
        {
          nome: 'Equipamentos',
          tipo: 'PJ',
          natureza: 'despesa',
          icone: '🖥️',
          ordem: 7,
          ativo: true
        },
        { nome: 'Outros PJ', tipo: 'PJ', natureza: 'despesa', icone: '📋', ordem: 8, ativo: true },

        // Receitas PJ
        { nome: 'Vendas', tipo: 'PJ', natureza: 'receita', icone: '💰', ordem: 1, ativo: true },
        {
          nome: 'Prestação de Serviços',
          tipo: 'PJ',
          natureza: 'receita',
          icone: '🔨',
          ordem: 2,
          ativo: true
        },
        {
          nome: 'Consultoria',
          tipo: 'PJ',
          natureza: 'receita',
          icone: '📊',
          ordem: 3,
          ativo: true
        },
        { nome: 'Comissões', tipo: 'PJ', natureza: 'receita', icone: '💹', ordem: 4, ativo: true },
        {
          nome: 'Outros Ganhos PJ',
          tipo: 'PJ',
          natureza: 'receita',
          icone: '💸',
          ordem: 5,
          ativo: true
        },

        // Despesas PF
        {
          nome: 'Alimentação PF',
          tipo: 'PF',
          natureza: 'despesa',
          icone: '🍽️',
          ordem: 1,
          ativo: true
        },
        { nome: 'Transporte', tipo: 'PF', natureza: 'despesa', icone: '🚗', ordem: 2, ativo: true },
        { nome: 'Moradia', tipo: 'PF', natureza: 'despesa', icone: '🏠', ordem: 3, ativo: true },
        { nome: 'Saúde', tipo: 'PF', natureza: 'despesa', icone: '⚕️', ordem: 4, ativo: true },
        { nome: 'Lazer', tipo: 'PF', natureza: 'despesa', icone: '🎬', ordem: 5, ativo: true },
        { nome: 'Educação', tipo: 'PF', natureza: 'despesa', icone: '📚', ordem: 6, ativo: true },
        { nome: 'Outros PF', tipo: 'PF', natureza: 'despesa', icone: '📋', ordem: 7, ativo: true },

        // Receitas PF
        { nome: 'Salário', tipo: 'PF', natureza: 'receita', icone: '💰', ordem: 1, ativo: true },
        {
          nome: 'Rendimentos',
          tipo: 'PF',
          natureza: 'receita',
          icone: '💹',
          ordem: 2,
          ativo: true
        },
        {
          nome: 'Outros Ganhos PF',
          tipo: 'PF',
          natureza: 'receita',
          icone: '💸',
          ordem: 3,
          ativo: true
        }
      ]
    }

    // Importar as categorias padrão (substituindo existentes)
    return await importarCategorias(usuario_id, categoriasPadrao, true)
  } catch (error) {
    console.error(`Erro ao importar categorias padrão para usuário ${usuario_id}:`, error)
    throw error
  }
}

// Script de migração para adicionar a tabela ao banco
export async function executarMigracao(): Promise<void> {
  try {
    await criarTabelaCategorias()
    console.log('Migração concluída com sucesso')
  } catch (error) {
    console.error('Erro na migração:', error)
    throw error
  }
}
