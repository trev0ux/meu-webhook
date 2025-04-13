// db/users.ts
import db from './index'
// Importar as funções de estado-conversa diretamente
import {
  buscarEstadoConversa,
  salvarEstadoConversa,
  limparEstadoConversa,
  executarMigracao as executarMigracaoEstadosConversa
} from './estado-conversa'

/**
 * Interface para usuário
 */
export interface Usuario {
  id: number
  telefone: string
  nome: string | null
  email: string | null
  perfil: 'pessoa_fisica' | 'empresario_individual'
  spreadsheet_id: string | null
  onboarding_completo: boolean
  ativo: boolean
  data_criacao: Date
  ultimo_acesso: Date
}

/**
 * Busca um usuário pelo ID
 *
 * @param id ID do usuário
 * @returns Dados do usuário ou null se não encontrado
 */
export async function findUserById(id: number): Promise<Usuario | null> {
  try {
    const query = `
      SELECT * FROM usuarios 
      WHERE id = $1 AND ativo = true
    `

    const result = await db.query(query, [id])

    if (result.rows.length === 0) {
      return null
    }

    // Atualizar último acesso
    await db.query('UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1', [id])

    return result.rows[0] as Usuario
  } catch (error) {
    console.error('Erro ao buscar usuário por ID:', error)
    throw error
  }
}

/**
 * Busca um usuário pelo número de telefone
 *
 * @param telefone Número de telefone (com ou sem prefixo whatsapp:)
 * @returns Dados do usuário ou null se não encontrado
 */
export async function findUser(telefone: string | number): Promise<Usuario | null> {
  try {
    // Normalizar telefone (remover prefixo whatsapp: se existir)
    const normalizedPhone = String(telefone).replace(/^whatsapp:/, '')

    const query = `
      SELECT * FROM usuarios 
      WHERE telefone = $1 AND ativo = true
    `

    const result = await db.query(query, [normalizedPhone])

    if (result.rows.length === 0) {
      return null
    }

    // Atualizar último acesso
    await db.query('UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1', [
      result.rows[0].id
    ])

    return result.rows[0] as Usuario
  } catch (error) {
    console.error('Erro ao buscar usuário por telefone:', error)
    throw error
  }
}

/**
 * Cria um novo usuário
 *
 * @param telefone Número de telefone
 * @param perfil Perfil do usuário
 * @param nome Nome do usuário (opcional)
 * @param email Email do usuário (opcional)
 * @returns Dados do usuário criado
 */
export async function criarUsuario(
  telefone: string,
  perfil: 'pessoa_fisica' | 'empresario_individual',
  nome?: string | null,
  email?: string | null
): Promise<Usuario> {
  try {
    // Normalizar telefone (remover prefixo whatsapp: se existir)
    const normalizedPhone = telefone.replace(/^whatsapp:/, '')

    // Verificar se já existe um usuário com este telefone
    const existingUser = await findUser(normalizedPhone)

    if (existingUser) {
      // Se existe mas está inativo, reativar
      if (!existingUser.ativo) {
        const query = `
          UPDATE usuarios 
          SET ativo = true, 
              perfil = $1, 
              nome = COALESCE($2, nome), 
              email = COALESCE($3, email),
              ultimo_acesso = CURRENT_TIMESTAMP
          WHERE id = $4
          RETURNING *
        `

        const result = await db.query(query, [perfil, nome || null, email || null, existingUser.id])

        return result.rows[0] as Usuario
      }

      // Se já existe e está ativo, retornar erro
      throw new Error(`Usuário com telefone ${normalizedPhone} já existe`)
    }

    // Criar novo usuário
    const query = `
      INSERT INTO usuarios (
        telefone, 
        perfil, 
        nome, 
        email, 
        onboarding_completo,
        ativo,
        data_criacao, 
        ultimo_acesso
      ) 
      VALUES ($1, $2, $3, $4, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `

    const result = await db.query(query, [normalizedPhone, perfil, nome || null, email || null])

    return result.rows[0] as Usuario
  } catch (error) {
    console.error('Erro ao criar usuário:', error)
    throw error
  }
}

/**
 * Atualiza dados de um usuário
 *
 * @param id ID do usuário
 * @param dados Dados a serem atualizados
 * @returns Dados do usuário atualizado
 */
export async function atualizarUsuario(
  id: number,
  dados: Partial<Omit<Usuario, 'id' | 'telefone' | 'data_criacao' | 'ultimo_acesso'>>
): Promise<Usuario> {
  try {
    // Verificar se usuário existe
    const existingUser = await findUserById(id)

    if (!existingUser) {
      throw new Error(`Usuário com ID ${id} não encontrado`)
    }

    // Construir query dinâmica com base nos campos fornecidos
    const campos = Object.keys(dados)
    if (campos.length === 0) {
      return existingUser // Nada para atualizar
    }

    let query = 'UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP'
    const values = []
    let paramCount = 1

    campos.forEach((campo) => {
      query += `, ${campo} = $${paramCount}`
      values.push(dados[campo])
      paramCount++
    })

    query += ` WHERE id = $${paramCount} RETURNING *`
    values.push(id)

    const result = await db.query(query, values)

    return result.rows[0] as Usuario
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error)
    throw error
  }
}

/**
 * Desativa um usuário (exclusão lógica)
 *
 * @param id ID do usuário
 * @returns true se desativado com sucesso
 */
export async function desativarUsuario(id: number): Promise<boolean> {
  try {
    const query = `
      UPDATE usuarios 
      SET ativo = false 
      WHERE id = $1
      RETURNING id
    `

    const result = await db.query(query, [id])

    return result.rows.length > 0
  } catch (error) {
    console.error('Erro ao desativar usuário:', error)
    throw error
  }
}

// Re-exportar funções de estado de conversa
export {
  buscarEstadoConversa,
  salvarEstadoConversa,
  limparEstadoConversa,
  // Re-exportar a função executarMigracao com um nome diferente para evitar colisões
  executarMigracaoEstadosConversa as executarMigracao
}

// Adicionar a db/users.ts

/**
 * Interface para códigos temporários
 */
export interface CodigoTemporario {
  id: number
  telefone: string
  codigo: string
  criado_em: Date
  expira_em: Date
  usado: boolean
}

/**
 * Cria um código temporário de verificação para o número de telefone informado
 * @param telefone Número de telefone no formato internacional
 * @param tempoExpiracao Tempo de expiração em minutos (padrão: 15 minutos)
 * @returns O código gerado
 */
export async function criarCodigoTemporario(
  telefone: string,
  tempoExpiracao: number = 15
): Promise<string> {
  try {
    // Normalizar o número de telefone (remover prefixo whatsapp:)
    const telefoneNormalizado = telefone.replace(/^whatsapp:/, '')

    // Gerar um código aleatório de 6 dígitos
    // Removendo caracteres ambíguos (0, O, 1, I) para evitar confusão
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let codigo = ''

    for (let i = 0; i < 6; i++) {
      const indice = Math.floor(Math.random() * caracteres.length)
      codigo += caracteres.charAt(indice)
    }

    // Calcular data de expiração
    const agora = new Date()
    const expiracao = new Date(agora.getTime() + tempoExpiracao * 60000)

    // Invalidar códigos anteriores do mesmo telefone
    await db.query(
      'UPDATE codigos_temporarios SET usado = TRUE WHERE telefone = $1 AND usado = FALSE',
      [telefoneNormalizado]
    )

    // Inserir novo código no banco de dados
    await db.query(
      'INSERT INTO codigos_temporarios (telefone, codigo, criado_em, expira_em, usado) VALUES ($1, $2, $3, $4, $5)',
      [telefoneNormalizado, codigo, agora, expiracao, false]
    )

    return codigo
  } catch (error) {
    console.error('Erro ao gerar código temporário:', error)
    throw error
  }
}

/**
 * Verifica se um código temporário é válido
 * @param telefone Número de telefone
 * @param codigo Código a ser verificado
 * @returns true se o código for válido, false caso contrário
 */
export async function verificarCodigoTemporario(
  telefone: string,
  codigo: string
): Promise<boolean> {
  try {
    const telefoneNormalizado = telefone.replace(/^whatsapp:/, '')
    const agora = new Date()

    // Buscar código não usado, não expirado, para o telefone
    const resultado = await db.query(
      'SELECT * FROM codigos_temporarios WHERE telefone = $1 AND codigo = $2 AND usado = FALSE AND expira_em > $3',
      [telefoneNormalizado, codigo.toUpperCase(), agora]
    )

    if (resultado.rows.length === 0) {
      return false
    }

    // Marcar código como usado
    await db.query('UPDATE codigos_temporarios SET usado = TRUE WHERE id = $1', [
      resultado.rows[0].id
    ])

    return true
  } catch (error) {
    console.error('Erro ao verificar código temporário:', error)
    return false
  }
}

/**
 * Script SQL para criar a tabela de códigos temporários
 * 
-- Executar no banco de dados:

CREATE TABLE IF NOT EXISTS codigos_temporarios (
  id SERIAL PRIMARY KEY,
  telefone VARCHAR(20) NOT NULL,
  codigo VARCHAR(10) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em TIMESTAMP NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_codigos_temp_telefone ON codigos_temporarios(telefone);
CREATE INDEX idx_codigos_temp_codigo ON codigos_temporarios(codigo);
CREATE INDEX idx_codigos_temp_expiracao ON codigos_temporarios(expira_em, usado);
*/
