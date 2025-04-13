// db/index.ts
import { PoolClient } from 'pg'
import { executarMigracao as executarMigracaoEstadosConversa } from './users'
import { executarMigracao as executarMigracaoCategorias } from './categories'
import { executarMigracao as executarMigracaoPreferencias } from './preferencias'

import pkg from 'pg'
const { Pool } = pkg

let pool: pkg.Pool | null = null
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
/**
 * Inicializa a conexão com o banco de dados
 * @param config Configurações do banco de dados
 */
export function initializeDatabase(config: any) {
  pool = new Pool({
    user: config.postgresUser || 'postgres',
    host: config.postgresHost || 'localhost',
    database: config.postgresDb || 'postgres',
    password: config.postgresPassword || '7894',
    port: parseInt(config.postgresPort || '5432')
  })

  return pool
}
/**
 * Executa todas as migrações necessárias para criar tabelas
 */
export async function executarMigracoes(): Promise<void> {
  try {
    console.log('Iniciando migrações...')

    // Garantir que a tabela de usuários existe
    await criarTabelaUsuarios()

    // Executar migrações para outras tabelas
    await executarMigracaoEstadosConversa()
    await executarMigracaoCategorias()
    await executarMigracaoPreferencias()

    console.log('Todas as migrações foram concluídas com sucesso')
  } catch (error) {
    console.error('Erro durante execução das migrações:', error)
    throw error
  }
}

/**
 * Cria a tabela de usuários, se não existir
 */
async function criarTabelaUsuarios(): Promise<void> {
  if (!pool) {
    throw new Error('Pool de banco de dados não inicializado')
  }

  try {
    // Verificar se a tabela já existe
    const checkTableQuery = `
      SELECT to_regclass('public.usuarios') as table_exists;
    `

    const checkResult = await pool.query(checkTableQuery)

    if (checkResult.rows[0].table_exists) {
      console.log('Tabela usuarios já existe')
      return
    }

    // Criar tabela
    const createTableQuery = `
      CREATE TABLE usuarios (
        id SERIAL PRIMARY KEY,
        telefone VARCHAR(20) NOT NULL UNIQUE,
        nome VARCHAR(100),
        email VARCHAR(100),
        perfil VARCHAR(50) NOT NULL,
        spreadsheet_id VARCHAR(100),
        onboarding_completo BOOLEAN NOT NULL DEFAULT FALSE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimo_acesso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX idx_usuarios_telefone ON usuarios (telefone);
    `

    await pool.query(createTableQuery)

    console.log('Tabela usuarios criada com sucesso')
  } catch (error) {
    console.error('Erro ao criar tabela usuarios:', error)
    throw error
  }
}

/**
 * Fecha todas as conexões no pool
 */
export async function fecharConexoes(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log('Conexões com o banco de dados foram encerradas')
  }
}

// Exporta métodos para executar queries
export default {
  /**
   * Executa uma query SQL
   * @param text Query SQL
   * @param params Parâmetros para a query
   * @returns Resultado da query
   */
  query: async (text: string, params?: any[]) => {
    if (!pool) {
      throw new Error('Pool de banco de dados não inicializado')
    }

    const start = Date.now()
    const res = await pool.query(text, params)
    const duration = Date.now() - start

    // Log apenas para queries demoradas (mais de 500ms)
    if (duration > 500) {
      console.log('Query lenta:', { text, duration, rows: res.rowCount })
    }

    return res
  },

  /**
   * Obtém um cliente do pool para executar múltiplas queries em uma transação
   * @returns Cliente do pool
   */
  getClient: async () => {
    if (!pool) {
      throw new Error('Pool de banco de dados não inicializado')
    }

    const client = await pool.connect()
    const query = client.query
    const release = client.release

    // Sobrescreve método de release para log e detecção de vazamentos
    // @ts-ignore
    client.release = () => {
      release.apply(client)
    }

    // Sobrescreve método de query para log de tempo
    // @ts-ignore
    client.query = async (...args) => {
      // @ts-ignore
      return await query.apply(client, args)
    }

    return client as PoolClient
  }
}
