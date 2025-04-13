// db/estado-conversa.ts
import db from './index'

/**
 * Interface para o estado de conversa
 */
export interface EstadoConversa {
  id?: number
  usuario_id: number
  tipo: string
  dados: any
  criado_em?: Date
  atualizado_em?: Date
}

/**
 * Busca o estado atual de uma conversa por tipo
 *
 * @param usuario_id ID do usuário
 * @param tipo Tipo do estado (onboarding, conversa, etc.)
 * @returns O estado da conversa ou null se não encontrado
 */
export async function buscarEstadoConversa(
  usuario_id: number,
  tipo: string = 'conversa'
): Promise<EstadoConversa | null> {
  try {
    const query = `
      SELECT * FROM estados_conversa 
      WHERE usuario_id = $1 AND tipo = $2
      ORDER BY atualizado_em DESC 
      LIMIT 1
    `

    const resultado = await db.query(query, [usuario_id, tipo])

    if (resultado.rows.length === 0) {
      return null
    }

    // Converter dados de JSON para objeto JS
    const estado = resultado.rows[0]

    // Verifica se dados é uma string; se for, faz parse
    if (typeof estado.dados === 'string') {
      estado.dados = JSON.parse(estado.dados)
    }

    return estado
  } catch (error) {
    console.error(
      `Erro ao buscar estado de conversa (tipo: ${tipo}) para usuário ${usuario_id}:`,
      error
    )
    throw error
  }
}

/**
 * Salva ou atualiza o estado de uma conversa
 *
 * @param usuario_id ID do usuário
 * @param tipo Tipo do estado (onboarding, conversa, etc.)
 * @param dados Dados do estado (objeto que será serializado para JSON)
 * @returns O estado da conversa salvo/atualizado
 */
export async function salvarEstadoConversa(
  usuario_id: number,
  tipo: string = 'conversa',
  dados: any
): Promise<EstadoConversa> {
  try {
    // Verificar se já existe um estado deste tipo para o usuário
    const estadoExistente = await buscarEstadoConversa(usuario_id, tipo)

    let resultado

    // Serializar dados para JSON
    const dadosJSON = JSON.stringify(dados)

    if (estadoExistente) {
      // Atualizar estado existente
      const query = `
        UPDATE estados_conversa 
        SET dados = $1, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `

      resultado = await db.query(query, [dadosJSON, estadoExistente.id])
    } else {
      // Criar novo estado
      const query = `
        INSERT INTO estados_conversa 
        (usuario_id, tipo, dados, criado_em, atualizado_em)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `

      resultado = await db.query(query, [usuario_id, tipo, dadosJSON])
    }

    // Converter dados de JSON para objeto JS
    const estado = resultado.rows[0]

    // Verifica se dados é uma string; se for, faz parse
    if (typeof estado.dados === 'string') {
      estado.dados = JSON.parse(estado.dados)
    }

    return estado
  } catch (error) {
    console.error(
      `Erro ao salvar estado de conversa (tipo: ${tipo}) para usuário ${usuario_id}:`,
      error
    )
    throw error
  }
}

/**
 * Remove o estado de uma conversa
 *
 * @param usuario_id ID do usuário
 * @param tipo Tipo do estado (onboarding, conversa, etc.)
 * @returns true se removido com sucesso, false caso contrário
 */
export async function limparEstadoConversa(
  usuario_id: number,
  tipo: string = 'conversa'
): Promise<boolean> {
  try {
    const query = `
      DELETE FROM estados_conversa
      WHERE usuario_id = $1 AND tipo = $2
      RETURNING id
    `

    const resultado = await db.query(query, [usuario_id, tipo])

    return resultado.rows.length > 0
  } catch (error) {
    console.error(
      `Erro ao limpar estado de conversa (tipo: ${tipo}) para usuário ${usuario_id}:`,
      error
    )
    throw error
  }
}

/**
 * Cria a tabela de estados de conversa, se não existir
 */
export async function criarTabelaEstadosConversa(): Promise<void> {
  try {
    // Verificar se a tabela já existe
    const checkTableQuery = `
      SELECT to_regclass('public.estados_conversa') as table_exists;
    `

    const checkResult = await db.query(checkTableQuery)

    if (checkResult.rows[0].table_exists) {
      console.log('Tabela estados_conversa já existe')
      return
    }

    // db/estado-conversa.ts (continuação)

    const createTableQuery = `
      CREATE TABLE estados_conversa (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        dados JSONB NOT NULL,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_usuario
          FOREIGN KEY(usuario_id) 
          REFERENCES usuarios(id)
          ON DELETE CASCADE
      );
      
      CREATE INDEX idx_estados_conversa_usuario_tipo ON estados_conversa (usuario_id, tipo);
    `

    await db.query(createTableQuery)

    console.log('Tabela estados_conversa criada com sucesso')
  } catch (error) {
    console.error('Erro ao criar tabela estados_conversa:', error)
    throw error
  }
}

/**
 * Busca todos os estados de conversa de um usuário
 *
 * @param usuario_id ID do usuário
 * @returns Lista de estados de conversa
 */
export async function buscarTodosEstadosConversa(usuario_id: number): Promise<EstadoConversa[]> {
  try {
    const query = `
      SELECT * FROM estados_conversa 
      WHERE usuario_id = $1
      ORDER BY tipo, atualizado_em DESC
    `

    const resultado = await db.query(query, [usuario_id])

    // Processar cada estado para converter dados JSON
    return resultado.rows.map((row) => {
      // Converter dados de JSON para objeto JS, se necessário
      if (typeof row.dados === 'string') {
        row.dados = JSON.parse(row.dados)
      }

      return row as EstadoConversa
    })
  } catch (error) {
    console.error(`Erro ao buscar estados de conversa para usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Remove todos os estados de conversa de um usuário
 *
 * @param usuario_id ID do usuário
 * @returns Número de estados removidos
 */
export async function limparTodosEstadosConversa(usuario_id: number): Promise<number> {
  try {
    const query = `
      DELETE FROM estados_conversa
      WHERE usuario_id = $1
      RETURNING id
    `

    const resultado = await db.query(query, [usuario_id])

    return resultado.rows.length
  } catch (error) {
    console.error(`Erro ao limpar todos estados de conversa para usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Executa a migração para criar a tabela de estados de conversa
 */
export async function executarMigracao(): Promise<void> {
  try {
    await criarTabelaEstadosConversa()
    console.log('Migração de estados_conversa concluída com sucesso')
  } catch (error) {
    console.error('Erro na migração de estados_conversa:', error)
    throw error
  }
}
