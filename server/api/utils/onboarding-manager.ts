// server/utils/onboarding-manager.ts
import {
  buscarEstadoConversa,
  salvarEstadoConversa,
  limparEstadoConversa,
  atualizarUsuario
} from '../../../db/users'
import { obterCategoriasPadrao, salvarCategoriasPersonalizadas } from './categorias-service'

/**
 * Interface para representar o estado do onboarding
 */
interface EstadoOnboarding {
  etapa: string
  dados: Record<string, any>
  iniciado_em: Date
  ultima_atualizacao: Date
}

/**
 * Interface para o resultado do processamento de uma etapa
 */
interface ResultadoProcessamento {
  mensagem: string
  completo: boolean
}

/**
 * Processa cada etapa do onboarding do usuário no WhatsApp
 *
 * @param mensagem Mensagem recebida do usuário
 * @param usuarioId ID do usuário no sistema
 * @returns Objeto com a mensagem a ser enviada e flag indicando se o onboarding foi concluído
 */
export async function processarEtapaOnboarding(
  mensagem: string,
  usuarioId: number
): Promise<ResultadoProcessamento> {
  try {
    // Buscar informações do usuário (incluindo o perfil)
    const usuario = await buscarUsuario(usuarioId)

    // Verificar se há um estado de onboarding salvo
    let estado = (await buscarEstadoConversa(usuarioId, 'onboarding')) as EstadoOnboarding

    // Se não existir, iniciar um novo fluxo de onboarding
    if (!estado) {
      estado = iniciarNovoOnboarding(usuario)
      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: gerarMensagemBoasVindas(usuario),
        completo: false
      }
    }

    console.log(usuario)

    // Processar a etapa atual com base no perfil do usuário
    if (usuario.perfil === 'pessoa_fisica') {
      return await processarEtapaPessoaFisica(mensagem, usuarioId, estado, usuario)
    } else {
      return await processarEtapaEmpreendedor(mensagem, usuarioId, estado, usuario)
    }
  } catch (error) {
    console.error('Erro ao processar etapa de onboarding:', error)

    return {
      mensagem: `
Ocorreu um erro durante a configuração. Por favor, digite "reiniciar" para recomeçar ou entre em contato com o suporte.
      `,
      completo: false
    }
  }
}

/**
 * Inicializa um novo estado de onboarding
 */
function iniciarNovoOnboarding(usuario: any): EstadoOnboarding {
  return {
    etapa: 'nome_preferido',
    dados: {},
    iniciado_em: new Date(),
    ultima_atualizacao: new Date()
  }
}

/**
 * Busca informações do usuário do banco de dados
 */
async function buscarUsuario(usuarioId: number): Promise<any> {
  // Em uma implementação real, buscaríamos do banco de dados
  // Aqui retornamos um objeto simulado para testes
  return {
    id: usuarioId,
    nome: 'Usuário Teste',
    email: 'teste@exemplo.com',
    perfil: 'empresario_individual', // ou 'pessoa_fisica'
    spreadsheet_id: 'abc123',
    onboarding_completo: false
  }
}

/**
 * Gera a mensagem de boas-vindas para o onboarding
 */
function gerarMensagemBoasVindas(usuario: any): string {
  const mensagemBase = `
🌟 *Vamos personalizar seu assistente financeiro!* 🌟

Você já completou o cadastro no site, agora vamos ajustar alguns detalhes para melhorar sua experiência no WhatsApp.

Como você gostaria de ser chamado(a)?
  `

  if (usuario.perfil === 'pessoa_fisica') {
    return mensagemBase
  } else {
    return `
${mensagemBase}

No seu caso, como empreendedor(a), vamos personalizar tanto suas finanças pessoais quanto empresariais.
    `
  }
}

/**
 * Processa etapas de onboarding para perfil Pessoa Física
 */
async function processarEtapaPessoaFisica(
  mensagem: string,
  usuarioId: number,
  estado: EstadoOnboarding,
  usuario: any
): Promise<ResultadoProcessamento> {
  const { etapa, dados } = estado

  switch (etapa) {
    case 'nome_preferido':
      // Salvar nome preferido
      dados.nome_preferido = mensagem.trim()
      estado.etapa = 'exemplo_despesa'
      estado.ultima_atualizacao = new Date()

      // Atualizar nome do usuário no banco
      await atualizarUsuario(usuarioId, { nome: dados.nome_preferido })

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
Ótimo, ${dados.nome_preferido}! 👋 

Para personalizar melhor o Finia, preciso entender como você costuma registrar suas transações.

💸 *Me dê um exemplo de como você registraria um gasto:*
_(Escreva exatamente como costuma anotar quando gasta dinheiro)_

Exemplo: "Mercado R$ 150" ou "Paguei R$ 35 no Uber"
        `,
        completo: false
      }

    case 'exemplo_despesa':
      // Salvar exemplo de despesa
      dados.exemplo_despesa = mensagem.trim()
      estado.etapa = 'exemplo_receita'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
Perfeito! Agora, me dê um exemplo de como você registraria uma receita:

💰 *Como você anotaria quando recebe dinheiro?*
_(Escreva naturalmente, como faria no dia a dia)_

Exemplo: "Recebi salário R$ 3000" ou "Pagamento freelance R$ 500"
        `,
        completo: false
      }

    case 'exemplo_receita':
      // Salvar exemplo de receita
      dados.exemplo_receita = mensagem.trim()
      estado.etapa = 'confirmacao_categorias'
      estado.ultima_atualizacao = new Date()

      // Analisar exemplos para extrair padrões (implementação simplificada)
      dados.padroes = analisarPadroes(dados.exemplo_despesa, dados.exemplo_receita)

      // Buscar categorias padrão para pessoa física
      const categoriasPadrao = await obterCategoriasPadrao('pessoa_fisica')
      dados.categorias = categoriasPadrao

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      // Montar lista de categorias para exibição
      const listaCategorias = dados.categorias.map((cat) => `• ${cat.nome}`).join('\n')

      return {
        mensagem: `
Obrigado pelos exemplos! Baseado no seu perfil, sugerimos as seguintes categorias:

📋 *Categorias sugeridas:*
${listaCategorias}

Estas categorias estão boas para você? 
Responda com "sim" para confirmar ou "não" para personalizá-las.
        `,
        completo: false
      }

    case 'confirmacao_categorias':
      const respostaLower = mensagem.toLowerCase().trim()

      if (['sim', 's', 'yes', 'y', '1'].includes(respostaLower)) {
        // Usuário aceitou as categorias padrão
        estado.etapa = 'modo_aprendizado'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
Ótimo! Agora, como você prefere que o Finia aprenda com você?

1️⃣ *Modo Assistido* - Te pergunta antes de cada classificação
2️⃣ *Modo Automático* - Classifica automaticamente e aprende com correções
3️⃣ *Modo Híbrido* - Pergunta apenas quando não tem certeza

Responda com o número da sua preferência.
          `,
          completo: false
        }
      } else if (['não', 'nao', 'n', 'no', '2'].includes(respostaLower)) {
        // Usuário quer personalizar categorias
        estado.etapa = 'personalizacao_categorias'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
Sem problemas! Vamos personalizar suas categorias.

📝 *Digite suas categorias preferidas*, separadas por vírgula.
Exemplo: "Mercado, Restaurantes, Transporte, Moradia, Lazer, Educação"

Suas categorias atuais podem ser usadas como base:
${dados.categorias.map((cat) => cat.nome).join(', ')}
          `,
          completo: false
        }
      } else {
        // Resposta não reconhecida
        return {
          mensagem: `
Não entendi sua resposta. Por favor, responda com "sim" para aceitar as categorias sugeridas ou "não" para personalizá-las.
          `,
          completo: false
        }
      }

    case 'personalizacao_categorias':
      // Processar categorias personalizadas
      const categoriasPersonalizadas = mensagem
        .split(',')
        .map((cat) => cat.trim())
        .filter((cat) => cat.length > 0)
        .map((nome) => ({
          nome,
          tipo: 'despesa',
          icone: obterIconePadrao(nome)
        }))

      if (categoriasPersonalizadas.length === 0) {
        return {
          mensagem: `
Por favor, digite pelo menos uma categoria válida, separada por vírgula.
Exemplo: "Alimentação, Transporte, Lazer"
          `,
          completo: false
        }
      }

      // Salvar novas categorias
      dados.categorias = categoriasPersonalizadas
      estado.etapa = 'modo_aprendizado'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
✅ Categorias personalizadas salvas!

Agora, como você prefere que o Finia aprenda com você?

1️⃣ *Modo Assistido* - Te pergunta antes de cada classificação
2️⃣ *Modo Automático* - Classifica automaticamente e aprende com correções
3️⃣ *Modo Híbrido* - Pergunta apenas quando não tem certeza

Responda com o número da sua preferência.
        `,
        completo: false
      }

    case 'modo_aprendizado':
      // Processar escolha do modo de aprendizado
      const opcaoModo = mensagem.trim()

      if (!['1', '2', '3'].includes(opcaoModo)) {
        return {
          mensagem: `
Por favor, escolha uma opção válida (1, 2 ou 3) para o modo de aprendizado.
          `,
          completo: false
        }
      }

      const modosAprendizado = ['assistido', 'automatico', 'hibrido']
      dados.modo_aprendizado = modosAprendizado[parseInt(opcaoModo) - 1]

      // Salvar preferências do usuário
      const preferencias = {
        modo_aprendizado: dados.modo_aprendizado,
        categorias: dados.categorias,
        padroes: dados.padroes
      }

      // Em uma implementação real, salvaríamos no banco de dados
      await salvarPreferenciasUsuario(usuarioId, preferencias)

      // Salvar categorias personalizadas (se houver)
      if (dados.categorias && dados.categorias.length > 0) {
        await salvarCategoriasPersonalizadas(usuarioId, dados.categorias)
      }

      // Marcar onboarding como concluído
      estado.etapa = 'concluido'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)
      await limparEstadoConversa(usuarioId, 'onboarding')

      // Atualizar status do usuário
      await atualizarUsuario(usuarioId, { onboarding_completo: true })

      return {
        mensagem: `
🎉 *Configuração concluída com sucesso!* 🎉

Olá, ${dados.nome_preferido}! Seu assistente financeiro está pronto para uso.

*Modo de aprendizado:* ${traduzirModoAprendizado(dados.modo_aprendizado)}
*Categorias configuradas:* ${dados.categorias.length}

*Como usar:*
• Para registrar gastos, envie mensagens como: "${dados.exemplo_despesa}"
• Para registrar receitas, envie mensagens como: "${dados.exemplo_receita}"
• Para corrigir uma classificação: "Corrigir: categoria X"
• Para relatórios: Digite "!relatorio"
• Para ajuda: Digite "!ajuda"

Vamos começar? Registre sua primeira transação agora! 💪
        `,
        completo: true
      }

    default:
      // Estado desconhecido, reiniciar onboarding
      await limparEstadoConversa(usuarioId, 'onboarding')

      return {
        mensagem: `
Parece que houve um problema com sua configuração. Vamos recomeçar.

Como você gostaria de ser chamado(a)?
        `,
        completo: false
      }
  }
}

/**
 * Processa etapas de onboarding para perfil Empreendedor
 */
async function processarEtapaEmpreendedor(
  mensagem: string,
  usuarioId: number,
  estado: EstadoOnboarding,
  usuario: any
): Promise<ResultadoProcessamento> {
  const { etapa, dados } = estado
  console.log(estado)

  switch (etapa) {
    case 'nome_preferido':
      // Salvar nome preferido
      dados.nome_preferido = mensagem.trim()
      estado.etapa = 'descricao_negocio'
      estado.ultima_atualizacao = new Date()

      // Atualizar nome do usuário no banco
      await atualizarUsuario(usuarioId, { nome: dados.nome_preferido })

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
Ótimo, ${dados.nome_preferido}! 👋 

Para personalizar melhor o Finia, me conte um pouco sobre seu negócio ou atividade profissional.

💼 *O que você faz?*
_(Exemplo: "Sou designer freelancer", "Tenho uma loja de roupas", "Trabalho como consultor")_
        `,
        completo: false
      }

    case 'descricao_negocio':
      // Salvar descrição do negócio
      dados.descricao_negocio = mensagem.trim()
      estado.etapa = 'exemplo_despesa_pj'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
Entendi que você ${dados.descricao_negocio}. Vamos configurar suas categorias.

Primeiro, me dê um exemplo de como você registraria um *gasto empresarial (PJ)*:

💼 *Como você anotaria uma despesa do seu negócio?*
_(Escreva naturalmente, como faria no dia a dia)_

Exemplo: "Marketing facebook R$ 200" ou "Material para cliente R$ 150"
        `,
        completo: false
      }

    case 'exemplo_despesa_pj':
      // Salvar exemplo de despesa PJ
      dados.exemplo_despesa_pj = mensagem.trim()
      estado.etapa = 'exemplo_receita_pj'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
Perfeito! Agora, me dê um exemplo de como você registraria uma *receita empresarial (PJ)*:

💰 *Como você anotaria quando seu negócio recebe dinheiro?*
_(Escreva naturalmente, como faria no dia a dia)_

Exemplo: "Cliente João pagou R$ 1000" ou "Venda loja R$ 500"
        `,
        completo: false
      }

    case 'exemplo_receita_pj':
      // Salvar exemplo de receita PJ
      dados.exemplo_receita_pj = mensagem.trim()
      estado.etapa = 'exemplo_despesa_pf'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
Ótimo! Agora vamos para sua vida pessoal.

Me dê um exemplo de como você registraria um *gasto pessoal (PF)*:

👤 *Como você anotaria uma despesa pessoal?*
_(Escreva naturalmente, como faria no dia a dia)_

Exemplo: "Mercado R$ 200" ou "Cinema R$ 50"
        `,
        completo: false
      }

    case 'exemplo_despesa_pf':
      // Salvar exemplo de despesa PF
      dados.exemplo_despesa_pf = mensagem.trim()
      estado.etapa = 'confirmacao_categorias'
      estado.ultima_atualizacao = new Date()

      // Analisar exemplos para extrair padrões
      dados.padroes = {
        pj: analisarPadroes(dados.exemplo_despesa_pj, dados.exemplo_receita_pj),
        pf: analisarPadroes(dados.exemplo_despesa_pf, '')
      }

      // Buscar categorias padrão para empreendedor
      const categoriasPJ = await obterCategoriasPadrao('empresario_individual', 'PJ')
      const categoriasPF = await obterCategoriasPadrao('empresario_individual', 'PF')

      dados.categorias = {
        pj: categoriasPJ,
        pf: categoriasPF
      }

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      // Montar listas de categorias para exibição
      const listaCategoriasEmpresas = dados.categorias.pj.map((cat) => `• ${cat.nome}`).join('\n')

      const listaCategoriasPessoais = dados.categorias.pf.map((cat) => `• ${cat.nome}`).join('\n')

      return {
        mensagem: `
Baseado no seu perfil e atividade, sugerimos as seguintes categorias:

💼 *Categorias Empresariais (PJ):*
${listaCategoriasEmpresas}

👤 *Categorias Pessoais (PF):*
${listaCategoriasPessoais}

Estas categorias estão boas para você?
Responda com "sim" para confirmar ou "não" para personalizá-las.
        `,
        completo: false
      }

    case 'confirmacao_categorias':
      const respostaLower = mensagem.toLowerCase().trim()

      if (['sim', 's', 'yes', 'y', '1'].includes(respostaLower)) {
        // Usuário aceitou as categorias padrão
        estado.etapa = 'palavras_chave'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
Ótimo! Para melhorar a classificação automática:

🔍 *Quais palavras você associa com GASTOS EMPRESARIAIS?*
Digite algumas palavras separadas por vírgula.

Exemplos: cliente, empresa, fornecedor, serviço, projeto
          `,
          completo: false
        }
      } else if (['não', 'nao', 'n', 'no', '2'].includes(respostaLower)) {
        // Usuário quer personalizar categorias
        estado.etapa = 'escolha_personalizacao'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
O que você gostaria de personalizar?

1️⃣ Categorias Empresariais (PJ)
2️⃣ Categorias Pessoais (PF)
3️⃣ Ambas

Responda com o número da sua escolha.
          `,
          completo: false
        }
      } else {
        // Resposta não reconhecida
        return {
          mensagem: `
Não entendi sua resposta. Por favor, responda com "sim" para aceitar as categorias sugeridas ou "não" para personalizá-las.
          `,
          completo: false
        }
      }

    case 'escolha_personalizacao':
      // Processar escolha de personalização
      const opcao = mensagem.trim()

      if (opcao === '1') {
        // Personalizar categorias PJ
        estado.etapa = 'personalizacao_pj'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
📝 *Digite suas categorias empresariais (PJ) preferidas*, separadas por vírgula.
Exemplo: "Marketing, Materiais, Software, Equipamentos, Impostos"

Suas categorias atuais podem ser usadas como base:
${dados.categorias.pj.map((cat) => cat.nome).join(', ')}
          `,
          completo: false
        }
      } else if (opcao === '2') {
        // Personalizar categorias PF
        estado.etapa = 'personalizacao_pf'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
📝 *Digite suas categorias pessoais (PF) preferidas*, separadas por vírgula.
Exemplo: "Alimentação, Moradia, Transporte, Lazer, Saúde"

Suas categorias atuais podem ser usadas como base:
${dados.categorias.pf.map((cat) => cat.nome).join(', ')}
          `,
          completo: false
        }
      } else if (opcao === '3') {
        // Personalizar ambas
        estado.etapa = 'personalizacao_pj'
        dados.personalizar_ambas = true
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
Vamos personalizar as duas! Comecemos pelas empresariais:

📝 *Digite suas categorias empresariais (PJ) preferidas*, separadas por vírgula.
Exemplo: "Marketing, Materiais, Software, Equipamentos, Impostos"

Suas categorias atuais podem ser usadas como base:
${dados.categorias.pj.map((cat) => cat.nome).join(', ')}
          `,
          completo: false
        }
      } else {
        return {
          mensagem: `
Por favor, responda com 1, 2 ou 3 para escolher o que deseja personalizar.
          `,
          completo: false
        }
      }

    case 'personalizacao_pj':
      // Processar categorias PJ personalizadas
      const categoriasPJPersonalizadas = mensagem
        .split(',')
        .map((cat) => cat.trim())
        .filter((cat) => cat.length > 0)
        .map((nome) => ({
          nome,
          tipo: 'PJ',
          icone: obterIconePadrao(nome)
        }))

      if (categoriasPJPersonalizadas.length === 0) {
        return {
          mensagem: `
Por favor, digite pelo menos uma categoria válida, separada por vírgula.
Exemplo: "Marketing, Materiais, Software"
          `,
          completo: false
        }
      }

      // Salvar novas categorias PJ
      dados.categorias.pj = categoriasPJPersonalizadas

      // Se estiver personalizando ambas, ir para PF depois
      if (dados.personalizar_ambas) {
        estado.etapa = 'personalizacao_pf'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
✅ Categorias empresariais (PJ) atualizadas!

Agora, vamos personalizar suas categorias pessoais:

📝 *Digite suas categorias pessoais (PF) preferidas*, separadas por vírgula.
Exemplo: "Alimentação, Moradia, Transporte, Lazer, Saúde"

Suas categorias atuais podem ser usadas como base:
${dados.categorias.pf.map((cat) => cat.nome).join(', ')}
          `,
          completo: false
        }
      } else {
        // Ir para palavras-chave
        estado.etapa = 'palavras_chave'
        estado.ultima_atualizacao = new Date()

        await salvarEstadoConversa(usuarioId, 'onboarding', estado)

        return {
          mensagem: `
✅ Categorias empresariais (PJ) atualizadas!

Para melhorar a classificação automática:

🔍 *Quais palavras você associa com GASTOS EMPRESARIAIS?*
Digite algumas palavras separadas por vírgula.

Exemplos: cliente, empresa, fornecedor, serviço, projeto
          `,
          completo: false
        }
      }

    case 'personalizacao_pf':
      // Processar categorias PF personalizadas
      const categoriasPFPersonalizadas = mensagem
        .split(',')
        .map((cat) => cat.trim())
        .filter((cat) => cat.length > 0)
        .map((nome) => ({
          nome,
          tipo: 'PF',
          icone: obterIconePadrao(nome)
        }))

      if (categoriasPFPersonalizadas.length === 0) {
        return {
          mensagem: `
Por favor, digite pelo menos uma categoria válida, separada por vírgula.
Exemplo: "Alimentação, Moradia, Transporte"
          `,
          completo: false
        }
      }

      // Salvar novas categorias PF
      dados.categorias.pf = categoriasPFPersonalizadas
      estado.etapa = 'palavras_chave'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
✅ Categorias pessoais (PF) atualizadas!

Para melhorar a classificação automática:

🔍 *Quais palavras você associa com GASTOS EMPRESARIAIS?*
Digite algumas palavras separadas por vírgula.

Exemplos: cliente, empresa, fornecedor, serviço, projeto
        `,
        completo: false
      }

    case 'palavras_chave':
      // Salvar palavras-chave PJ
      dados.palavras_chave_pj = mensagem
        .split(',')
        .map((palavra) => palavra.trim())
        .filter((palavra) => palavra.length > 0)

      estado.etapa = 'palavras_chave_pf'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
✅ Palavras-chave empresariais salvas!

🔍 *Agora, quais palavras você associa com GASTOS PESSOAIS?*
Digite algumas palavras separadas por vírgula.

Exemplos: casa, pessoal, família, mercado, lazer
        `,
        completo: false
      }

    case 'palavras_chave_pf':
      // Salvar palavras-chave PF
      dados.palavras_chave_pf = mensagem
        .split(',')
        .map((palavra) => palavra.trim())
        .filter((palavra) => palavra.length > 0)

      estado.etapa = 'modo_aprendizado'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)

      return {
        mensagem: `
✅ Palavras-chave pessoais salvas!

Por fim, como você prefere que o Finia aprenda com você?

1️⃣ *Modo Assistido* - Te pergunta antes de cada classificação
2️⃣ *Modo Automático* - Classifica automaticamente e aprende com correções
3️⃣ *Modo Híbrido* - Pergunta apenas quando não tem certeza

Responda com o número da sua preferência.
        `,
        completo: false
      }

    case 'modo_aprendizado':
      // Processar escolha do modo de aprendizado
      const opcaoModo = mensagem.trim()

      if (!['1', '2', '3'].includes(opcaoModo)) {
        return {
          mensagem: `
Por favor, escolha uma opção válida (1, 2 ou 3) para o modo de aprendizado.
          `,
          completo: false
        }
      }

      const modosAprendizado = ['assistido', 'automatico', 'hibrido']
      dados.modo_aprendizado = modosAprendizado[parseInt(opcaoModo) - 1]

      // Salvar preferências completas do usuário
      const preferencias = {
        modo_aprendizado: dados.modo_aprendizado,
        categorias: dados.categorias,
        padroes: dados.padroes,
        palavras_chave: {
          pj: dados.palavras_chave_pj,
          pf: dados.palavras_chave_pf
        }
      }

      // Em uma implementação real, salvaríamos no banco de dados
      await salvarPreferenciasUsuario(usuarioId, preferencias)

      // Salvar categorias personalizadas (se houver)
      if (dados.categorias) {
        if (dados.categorias.pj && dados.categorias.pj.length > 0) {
          await salvarCategoriasPersonalizadas(usuarioId, dados.categorias.pj, 'PJ')
        }
        if (dados.categorias.pf && dados.categorias.pf.length > 0) {
          await salvarCategoriasPersonalizadas(usuarioId, dados.categorias.pf, 'PF')
        }
      }

      // Marcar onboarding como concluído
      estado.etapa = 'concluido'
      estado.ultima_atualizacao = new Date()

      await salvarEstadoConversa(usuarioId, 'onboarding', estado)
      await limparEstadoConversa(usuarioId, 'onboarding')

      // Atualizar status do usuário
      await atualizarUsuario(usuarioId, { onboarding_completo: true })

      return {
        mensagem: `
🎉 *Configuração concluída com sucesso!* 🎉

Olá, ${dados.nome_preferido}! Seu assistente financeiro está pronto para uso.

*Modo de aprendizado:* ${traduzirModoAprendizado(dados.modo_aprendizado)}
*Categorias empresariais:* ${dados.categorias.pj.length}
*Categorias pessoais:* ${dados.categorias.pf.length}

*Como usar:*
• Para gastos empresariais: "${dados.exemplo_despesa_pj}"
• Para receitas empresariais: "${dados.exemplo_receita_pj}"
• Para gastos pessoais: "${dados.exemplo_despesa_pf}"
• Para corrigir uma classificação: "Corrigir: categoria X"
• Para relatórios: Digite "!relatorio"
• Para ajuda: Digite "!ajuda"

O Finia aprenderá e se adaptará ao seu estilo conforme você o utiliza.
Vamos começar? Registre sua primeira transação agora! 💪
        `,
        completo: true
      }

    default:
      // Estado desconhecido, reiniciar onboarding
      await limparEstadoConversa(usuarioId, 'onboarding')

      return {
        mensagem: `
Parece que houve um problema com sua configuração. Vamos recomeçar.

Como você gostaria de ser chamado(a)?
        `,
        completo: false
      }
  }
}

/**
 * Analisa padrões nos exemplos fornecidos pelo usuário
 */
function analisarPadroes(exemploGasto: string, exemploReceita: string): any {
  // Detectar padrões nos exemplos
  const padroesDetectados = {
    // Formato de valor
    formato_valor: detectarFormatoValor(exemploGasto, exemploReceita),

    // Posição do valor
    valor_posicao: detectarPosicaoValor(exemploGasto, exemploReceita),

    // Estilo de descrição (detalhado, curto)
    estilo_descricao: exemploGasto.split(' ').length > 3 ? 'detalhado' : 'curto',

    // Usa data explicitamente?
    usa_data: detectarUsoData(exemploGasto, exemploReceita),

    // Palavras-chave específicas
    palavras_chave: extrairPalavrasChave(exemploGasto, exemploReceita)
  }

  return padroesDetectados
}

/**
 * Detecta o formato de valor usado nos exemplos
 */
function detectarFormatoValor(exemploGasto: string, exemploReceita: string): string {
  const exemplos = [exemploGasto, exemploReceita].filter((ex) => ex.length > 0)
  const texto = exemplos.join(' ').toLowerCase()

  // Verificar formatos comuns
  if (texto.includes('r$')) return 'r$'
  if (texto.includes('reais')) return 'reais'

  // Verificar formato numérico (com vírgula, ponto, etc)
  if (texto.match(/\d+,\d{2}/)) return 'virgula'
  if (texto.match(/\d+\.\d{2}/)) return 'ponto'

  return 'numerico'
}

/**
 * Detecta a posição do valor na mensagem
 */
function detectarPosicaoValor(exemploGasto: string, exemploReceita: string): string {
  const exemplos = [exemploGasto, exemploReceita].filter((ex) => ex.length > 0)

  for (const exemplo of exemplos) {
    const palavras = exemplo.split(' ')

    // Procura por "R$" ou números
    for (let i = 0; i < palavras.length; i++) {
      if (palavras[i].toLowerCase().includes('r$') || palavras[i].match(/\d+/)) {
        if (i <= 1) return 'inicio'
        if (i >= palavras.length - 2) return 'fim'
        return 'meio'
      }
    }
  }

  return 'indeterminado'
}

/**
 * Detecta se o usuário inclui data nos exemplos
 */
function detectarUsoData(exemploGasto: string, exemploReceita: string): boolean {
  const exemplos = [exemploGasto, exemploReceita].filter((ex) => ex.length > 0)
  const texto = exemplos.join(' ').toLowerCase()

  // Verificar formatos de data comuns
  const regexData = /\d{1,2}[\/\-\.]\d{1,2}([\/\-\.]\d{2,4})?/

  // Verificar menções a tempo
  const palavrasTempo = ['hoje', 'ontem', 'anteontem', 'semana passada', 'mês passado']

  return regexData.test(texto) || palavrasTempo.some((p) => texto.includes(p))
}

/**
 * Extrai palavras-chave potenciais dos exemplos
 */
function extrairPalavrasChave(exemploGasto: string, exemploReceita: string): string[] {
  const exemplos = [exemploGasto, exemploReceita].filter((ex) => ex.length > 0)
  const texto = exemplos.join(' ').toLowerCase()

  // Remover palavras comuns e focar em substantivos e verbos específicos
  const palavrasIgnoradas = [
    'o',
    'a',
    'os',
    'as',
    'de',
    'da',
    'do',
    'das',
    'dos',
    'em',
    'no',
    'na',
    'para',
    'por',
    'com',
    'r$',
    'rs',
    'reais'
  ]

  const palavras = texto
    .replace(/[^\w\s]/gi, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 3 && !palavrasIgnoradas.includes(p) && isNaN(Number(p)))
    .filter((v, i, a) => a.indexOf(v) === i) // unique

  return palavras.slice(0, 5) // Retornar até 5 palavras-chave
}

/**
 * Obtém um ícone padrão para uma categoria
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
    medic: '💊',
    hospital: '🏥',
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
    comiss: '💹'
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

  return '📋' // Ícone genérico
}

/**
 * Salva as preferências do usuário no banco de dados
 */
async function salvarPreferenciasUsuario(usuarioId: number, preferencias: any): Promise<void> {
  // Em uma implementação real, salvaríamos no banco de dados
  console.log(`Salvando preferências do usuário ${usuarioId}:`, preferencias)

  // Simular sucesso
  return Promise.resolve()
}

/**
 * Traduz o modo de aprendizado para texto amigável
 */
function traduzirModoAprendizado(modo: string): string {
  switch (modo) {
    case 'assistido':
      return 'Assistido (confirmar antes de salvar)'
    case 'automatico':
      return 'Automático (classificação inteligente)'
    case 'hibrido':
      return 'Híbrido (confirmar apenas quando necessário)'
    default:
      return 'Padrão'
  }
}
