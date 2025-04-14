// db/report-requests.ts
import db from './index'

/**
 * Interface para solicitações de relatórios
 */
export interface ReportRequest {
  id?: number
  usuario_id: number
  tipo: 'diario' | 'semanal' | 'mensal' | 'sob_demanda'
  data_solicitacao: Date
  periodo_referencia?: string // Ex: "04/2025" para mensal, "15/04/2025" para diário
  processado: boolean
  data_processamento?: Date
}

/**
 * Registra uma nova solicitação de relatório
 *
 * @param usuario_id ID do usuário
 * @param tipo Tipo do relatório (diario, semanal, mensal, sob_demanda)
 * @param periodo_referencia Período de referência opcional (formato depende do tipo)
 * @returns A solicitação registrada
 */
export async function registrarSolicitacaoRelatorio(
  usuario_id: number,
  tipo: 'diario' | 'semanal' | 'mensal' | 'sob_demanda',
  periodo_referencia?: string
): Promise<ReportRequest> {
  try {
    const query = `
      INSERT INTO solicitacoes_relatorios
      (usuario_id, tipo, data_solicitacao, periodo_referencia, processado)
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3, false)
      RETURNING *
    `

    const resultado = await db.query(query, [usuario_id, tipo, periodo_referencia || null])

    return resultado.rows[0]
  } catch (error) {
    console.error('Erro ao registrar solicitação de relatório:', error)
    throw error
  }
}

/**
 * Verifica se o usuário já solicitou um relatório do tipo especificado hoje
 *
 * @param usuario_id ID do usuário
 * @param tipo Tipo do relatório (diario, semanal, mensal, sob_demanda)
 * @returns true se já solicitou hoje, false caso contrário
 */
export async function verificarSolicitacaoHoje(
  usuario_id: number,
  tipo: 'diario' | 'semanal' | 'mensal' | 'sob_demanda'
): Promise<boolean> {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM solicitacoes_relatorios
      WHERE usuario_id = $1
        AND tipo = $2
        AND data_solicitacao >= CURRENT_DATE
        AND data_solicitacao < CURRENT_DATE + INTERVAL '1 day'
    `

    const resultado = await db.query(query, [usuario_id, tipo])

    return parseInt(resultado.rows[0].count) > 0
  } catch (error) {
    console.error('Erro ao verificar solicitação de relatório:', error)
    throw error
  }
}

/**
 * Marca uma solicitação de relatório como processada
 *
 * @param id ID da solicitação
 * @returns A solicitação atualizada
 */
export async function marcarSolicitacaoProcessada(id: number): Promise<ReportRequest | null> {
  try {
    const query = `
      UPDATE solicitacoes_relatorios
      SET processado = true, data_processamento = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `

    const resultado = await db.query(query, [id])

    if (resultado.rows.length === 0) {
      return null
    }

    return resultado.rows[0]
  } catch (error) {
    console.error('Erro ao marcar solicitação como processada:', error)
    throw error
  }
}

/**
 * Obtém as solicitações não processadas para um tipo de relatório
 *
 * @param tipo Tipo do relatório (diario, semanal, mensal, sob_demanda)
 * @returns Lista de solicitações não processadas
 */
export async function obterSolicitacoesNaoProcessadas(
  tipo: 'diario' | 'semanal' | 'mensal' | 'sob_demanda'
): Promise<ReportRequest[]> {
  try {
    const query = `
      SELECT *
      FROM solicitacoes_relatorios
      WHERE tipo = $1
        AND processado = false
      ORDER BY data_solicitacao ASC
    `

    const resultado = await db.query(query, [tipo])

    return resultado.rows
  } catch (error) {
    console.error('Erro ao obter solicitações não processadas:', error)
    throw error
  }
}

/**
 * Obtém o histórico de solicitações de relatório de um usuário
 *
 * @param usuario_id ID do usuário
 * @param limit Limite de registros (padrão: 50)
 * @param offset Deslocamento para paginação (padrão: 0)
 * @returns Lista de solicitações do usuário
 */
export async function obterHistoricoSolicitacoesUsuario(
  usuario_id: number,
  limit: number = 50,
  offset: number = 0
): Promise<ReportRequest[]> {
  try {
    const query = `
      SELECT *
      FROM solicitacoes_relatorios
      WHERE usuario_id = $1
      ORDER BY data_solicitacao DESC
      LIMIT $2 OFFSET $3
    `

    const resultado = await db.query(query, [usuario_id, limit, offset])

    return resultado.rows
  } catch (error) {
    console.error('Erro ao obter histórico de solicitações:', error)
    throw error
  }
}

/**
 * Obtém as estatísticas de solicitações de relatórios
 *
 * @returns Estatísticas de solicitações
 */
export async function obterEstatisticasSolicitacoes(): Promise<any> {
  try {
    const query = `
      SELECT 
        tipo,
        COUNT(*) as total,
        SUM(CASE WHEN processado = true THEN 1 ELSE 0 END) as processadas,
        SUM(CASE WHEN processado = false THEN 1 ELSE 0 END) as pendentes,
        COUNT(DISTINCT usuario_id) as usuarios_unicos,
        MAX(data_solicitacao) as ultima_solicitacao
      FROM solicitacoes_relatorios
      GROUP BY tipo
    `

    const resultado = await db.query(query)

    return resultado.rows
  } catch (error) {
    console.error('Erro ao obter estatísticas de solicitações:', error)
    throw error
  }
}

/**
 * Cria a tabela de solicitações de relatórios, se não existir
 */
export async function criarTabelaSolicitacoesRelatorios(): Promise<void> {
  try {
    // Verificar se a tabela já existe
    const checkTableQuery = `
      SELECT to_regclass('public.solicitacoes_relatorios') as table_exists;
    `

    const checkResult = await db.query(checkTableQuery)

    if (checkResult.rows[0].table_exists) {
      console.log('Tabela solicitacoes_relatorios já existe')
      return
    }

    // Criar tabela
    const createTableQuery = `
      CREATE TABLE solicitacoes_relatorios (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        data_solicitacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        periodo_referencia VARCHAR(50),
        processado BOOLEAN NOT NULL DEFAULT FALSE,
        data_processamento TIMESTAMP,
        CONSTRAINT fk_usuario
          FOREIGN KEY(usuario_id) 
          REFERENCES usuarios(id)
          ON DELETE CASCADE
      );
      
      CREATE INDEX idx_solicitacoes_relatorios_usuario ON solicitacoes_relatorios (usuario_id);
      CREATE INDEX idx_solicitacoes_relatorios_tipo ON solicitacoes_relatorios (tipo);
      CREATE INDEX idx_solicitacoes_relatorios_processado ON solicitacoes_relatorios (processado);
      CREATE INDEX idx_solicitacoes_relatorios_data ON solicitacoes_relatorios (data_solicitacao);
    `

    await db.query(createTableQuery)

    console.log('Tabela solicitacoes_relatorios criada com sucesso')
  } catch (error) {
    console.error('Erro ao criar tabela solicitacoes_relatorios:', error)
    throw error
  }
}

/**
 * Limpa solicitações antigas já processadas
 *
 * @param diasParaRetencao Número de dias para manter solicitações processadas (padrão: 30)
 * @returns Número de registros removidos
 */
export async function limparSolicitacoesAntigas(diasParaRetencao: number = 30): Promise<number> {
  try {
    const query = `
      DELETE FROM solicitacoes_relatorios
      WHERE processado = true
        AND data_processamento < CURRENT_DATE - INTERVAL '${diasParaRetencao} days'
      RETURNING id
    `

    const resultado = await db.query(query)

    console.log(`${resultado.rows.length} solicitações antigas removidas`)
    return resultado.rows.length
  } catch (error) {
    console.error('Erro ao limpar solicitações antigas:', error)
    throw error
  }
}

/**
 * Script de migração para adicionar a tabela ao banco
 */
export async function executarMigracao(): Promise<void> {
  try {
    await criarTabelaSolicitacoesRelatorios()
    console.log('Migração concluída com sucesso')
  } catch (error) {
    console.error('Erro na migração:', error)
    throw error
  }
}
