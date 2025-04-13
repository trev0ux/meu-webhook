// db/preferencias.ts
import db from './index'

/**
 * Interface para preferências do usuário
 */
export interface PreferenciasUsuario {
  id?: number
  usuario_id: number
  modo_aprendizado: 'assistido' | 'automatico' | 'hibrido'
  formato_resposta: 'detalhado' | 'simples' | 'emoji'
  confirmar_baixa_confianca: boolean
  formato_valor_preferido?: string
  formato_data_preferido?: string
  palavras_chave_pj?: string[]
  palavras_chave_pf?: string[]
  padroes?: any
  configuracoes_adicionais?: any
  criado_em?: Date
  atualizado_em?: Date
}

/**
 * Busca as preferências de um usuário
 *
 * @param usuario_id ID do usuário
 * @returns As preferências do usuário ou null se não encontradas
 */
export async function buscarPreferenciasUsuario(
  usuario_id: number
): Promise<PreferenciasUsuario | null> {
  try {
    const query = `
      SELECT * FROM preferencias_usuario
      WHERE usuario_id = $1
    `

    const resultado = await db.query(query, [usuario_id])

    if (resultado.rows.length === 0) {
      return null
    }

    const preferencias = resultado.rows[0]

    // Converter campos JSON para objetos
    if (typeof preferencias.palavras_chave_pj === 'string') {
      preferencias.palavras_chave_pj = JSON.parse(preferencias.palavras_chave_pj)
    }

    if (typeof preferencias.palavras_chave_pf === 'string') {
      preferencias.palavras_chave_pf = JSON.parse(preferencias.palavras_chave_pf)
    }

    if (typeof preferencias.padroes === 'string') {
      preferencias.padroes = JSON.parse(preferencias.padroes)
    }

    if (typeof preferencias.configuracoes_adicionais === 'string') {
      preferencias.configuracoes_adicionais = JSON.parse(preferencias.configuracoes_adicionais)
    }

    return preferencias
  } catch (error) {
    console.error(`Erro ao buscar preferências do usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Salva ou atualiza as preferências de um usuário
 *
 * @param preferencias Preferências a serem salvas
 * @returns As preferências salvas
 */
export async function salvarPreferenciasUsuario(
  preferencias: PreferenciasUsuario
): Promise<PreferenciasUsuario> {
  try {
    // Verificar se já existem preferências para este usuário
    const preferenciaExistente = await buscarPreferenciasUsuario(preferencias.usuario_id)

    // Preparar campos que são arrays ou objetos para armazenamento como JSON
    const palavrasChavePJ = preferencias.palavras_chave_pj
      ? JSON.stringify(preferencias.palavras_chave_pj)
      : null
    const palavrasChavePF = preferencias.palavras_chave_pf
      ? JSON.stringify(preferencias.palavras_chave_pf)
      : null
    const padroes = preferencias.padroes ? JSON.stringify(preferencias.padroes) : null
    const configuracoesAdicionais = preferencias.configuracoes_adicionais
      ? JSON.stringify(preferencias.configuracoes_adicionais)
      : null

    let resultado

    if (preferenciaExistente) {
      // Atualizar preferências existentes
      const query = `
        UPDATE preferencias_usuario
        SET 
          modo_aprendizado = $1,
          formato_resposta = $2,
          confirmar_baixa_confianca = $3,
          formato_valor_preferido = $4,
          formato_data_preferido = $5,
          palavras_chave_pj = $6,
          palavras_chave_pf = $7,
          padroes = $8,
          configuracoes_adicionais = $9,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE usuario_id = $10
        RETURNING *
      `

      resultado = await db.query(query, [
        preferencias.modo_aprendizado,
        preferencias.formato_resposta,
        preferencias.confirmar_baixa_confianca,
        preferencias.formato_valor_preferido || null,
        preferencias.formato_data_preferido || null,
        palavrasChavePJ,
        palavrasChavePF,
        padroes,
        configuracoesAdicionais,
        preferencias.usuario_id
      ])
    } else {
      // Inserir novas preferências
      const query = `
        INSERT INTO preferencias_usuario (
          usuario_id,
          modo_aprendizado,
          formato_resposta,
          confirmar_baixa_confianca,
          formato_valor_preferido,
          formato_data_preferido,
          palavras_chave_pj,
          palavras_chave_pf,
          padroes,
          configuracoes_adicionais,
          criado_em,
          atualizado_em
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `

      resultado = await db.query(query, [
        preferencias.usuario_id,
        preferencias.modo_aprendizado,
        preferencias.formato_resposta,
        preferencias.confirmar_baixa_confianca,
        preferencias.formato_valor_preferido || null,
        preferencias.formato_data_preferido || null,
        palavrasChavePJ,
        palavrasChavePF,
        padroes,
        configuracoesAdicionais
      ])
    }

    // Converter resultado para objeto com campos processados
    const prefSalva = resultado.rows[0]

    // Reconverter campos JSON para objetos
    if (prefSalva.palavras_chave_pj) {
      prefSalva.palavras_chave_pj = JSON.parse(prefSalva.palavras_chave_pj)
    }

    if (prefSalva.palavras_chave_pf) {
      prefSalva.palavras_chave_pf = JSON.parse(prefSalva.palavras_chave_pf)
    }

    if (prefSalva.padroes) {
      prefSalva.padroes = JSON.parse(prefSalva.padroes)
    }

    if (prefSalva.configuracoes_adicionais) {
      prefSalva.configuracoes_adicionais = JSON.parse(prefSalva.configuracoes_adicionais)
    }

    return prefSalva
  } catch (error) {
    console.error(`Erro ao salvar preferências do usuário ${preferencias.usuario_id}:`, error)
    throw error
  }
}

/**
 * Cria preferências padrão para um usuário com base no seu perfil
 *
 * @param usuario_id ID do usuário
 * @param perfil Perfil do usuário ('pessoa_fisica' ou 'empresario_individual')
 * @returns As preferências padrão criadas
 */
export async function criarPreferenciasPadrao(
  usuario_id: number,
  perfil: string
): Promise<PreferenciasUsuario> {
  try {
    // Definir preferências padrão
    const preferencias: PreferenciasUsuario = {
      usuario_id,
      modo_aprendizado: 'hibrido',
      formato_resposta: 'detalhado',
      confirmar_baixa_confianca: true,
      formato_valor_preferido: 'r$',
      formato_data_preferido: 'dd/mm/yyyy',
      // Palavras-chave específicas para cada perfil
      palavras_chave_pf: ['pessoal', 'casa', 'família', 'mercado', 'lazer']
    }

    // Adicionar palavras-chave PJ para empreendedores
    if (perfil === 'empresario_individual') {
      preferencias.palavras_chave_pj = ['cliente', 'empresa', 'negócio', 'fornecedor', 'projeto']
    }

    // Salvar preferências no banco
    return await salvarPreferenciasUsuario(preferencias)
  } catch (error) {
    console.error(`Erro ao criar preferências padrão para usuário ${usuario_id}:`, error)
    throw error
  }
}

/**
 * Cria a tabela de preferências de usuário, se não existir
 */
export async function criarTabelaPreferenciasUsuario(): Promise<void> {
  try {
    // Verificar se a tabela já existe
    const checkTableQuery = `
      SELECT to_regclass('public.preferencias_usuario') as table_exists;
    `

    const checkResult = await db.query(checkTableQuery)

    if (checkResult.rows[0].table_exists) {
      console.log('Tabela preferencias_usuario já existe')
      return
    }

    // Criar tabela
    const createTableQuery = `
      CREATE TABLE preferencias_usuario (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE,
        modo_aprendizado VARCHAR(20) NOT NULL,
        formato_resposta VARCHAR(20) NOT NULL,
        confirmar_baixa_confianca BOOLEAN NOT NULL DEFAULT TRUE,
        formato_valor_preferido VARCHAR(20),
        formato_data_preferido VARCHAR(20),
        palavras_chave_pj JSONB,
        palavras_chave_pf JSONB,
        padroes JSONB,
        configuracoes_adicionais JSONB,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_usuario
          FOREIGN KEY(usuario_id) 
          REFERENCES usuarios(id)
          ON DELETE CASCADE
      );
    `

    await db.query(createTableQuery)

    console.log('Tabela preferencias_usuario criada com sucesso')
  } catch (error) {
    console.error('Erro ao criar tabela preferencias_usuario:', error)
    throw error
  }
}

// Script de migração para adicionar a tabela ao banco
export async function executarMigracao(): Promise<void> {
  try {
    await criarTabelaPreferenciasUsuario()
    console.log('Migração concluída com sucesso')
  } catch (error) {
    console.error('Erro na migração:', error)
    throw error
  }
}
