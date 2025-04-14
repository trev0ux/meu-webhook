// server/jobs/process-reports.ts
import { obterSolicitacoesNaoProcessadas } from '../../../db/report-requests'
import { findUserById } from '../../../db/users'
import { gerarEEnviarRelatorio } from '../../api/utils/relatorio-service'

/**
 * Job para processar solicitações de relatórios pendentes
 * Este script pode ser executado via cron job a cada X minutos
 */
export async function processarRelatoriosPendentes() {
  try {
    console.log('Iniciando processamento de relatórios pendentes...')

    // Processar cada tipo de relatório
    await processarTipoRelatorio('diario')
    await processarTipoRelatorio('semanal')
    await processarTipoRelatorio('mensal')
    await processarTipoRelatorio('sob_demanda')

    console.log('Processamento de relatórios concluído.')
  } catch (error) {
    console.error('Erro no processamento de relatórios pendentes:', error)
  }
}

/**
 * Processa solicitações pendentes de um tipo específico de relatório
 *
 * @param tipo Tipo de relatório a processar
 */
async function processarTipoRelatorio(tipo: 'diario' | 'semanal' | 'mensal' | 'sob_demanda') {
  try {
    console.log(`Processando relatórios pendentes do tipo: ${tipo}`)

    // Obter todas as solicitações não processadas deste tipo
    const solicitacoes = await obterSolicitacoesNaoProcessadas(tipo)

    if (solicitacoes.length === 0) {
      console.log(`Nenhuma solicitação pendente do tipo ${tipo}.`)
      return
    }

    console.log(`Encontradas ${solicitacoes.length} solicitações pendentes do tipo ${tipo}.`)

    // Processar cada solicitação
    for (const solicitacao of solicitacoes) {
      try {
        // Obter dados do usuário
        const usuario = await findUserById(solicitacao.usuario_id)

        if (!usuario) {
          console.error(
            `Usuário ${solicitacao.usuario_id} não encontrado para solicitação ${solicitacao.id}.`
          )
          continue
        }

        // Preparar dados para geração do relatório
        const dadosRelatorio = {
          usuario_id: solicitacao.usuario_id,
          telefone: usuario.telefone,
          tipo: solicitacao.tipo as 'diario' | 'semanal' | 'mensal' | 'sob_demanda',
          periodo_referencia: solicitacao.periodo_referencia || '',
          solicitacao_id: solicitacao.id
        }

        // Gerar e enviar relatório
        const sucesso = await gerarEEnviarRelatorio(dadosRelatorio)

        if (sucesso) {
          console.log(`Relatório ${tipo} gerado e enviado com sucesso para usuário ${usuario.id}.`)
        } else {
          console.error(`Falha ao gerar relatório ${tipo} para usuário ${usuario.id}.`)
        }
      } catch (error) {
        console.error(`Erro ao processar solicitação ${solicitacao.id}:`, error)
      }
    }
  } catch (error) {
    console.error(`Erro ao processar relatórios do tipo ${tipo}:`, error)
  }
}

// Se este arquivo for executado diretamente (via CLI ou cro
