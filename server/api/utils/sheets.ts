// server/utils/sheets.ts
import { google } from 'googleapis'
import configPadrao from '../../../config/finzap.json'

// Função para autenticar no Google Sheets
export async function getGoogleSheetsClient() {
  const config = useRuntimeConfig()
  
  const auth = new google.auth.JWT(
    config.googleServiceAccountEmail,
    null,
    config.googlePrivateKey.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  )
  
  return google.sheets({ version: 'v4', auth })
}

// Função para adicionar linha na planilha
export async function adicionarLinhaSheet(
  sheetName: string, 
  valores: any[]
) {
  const config = useRuntimeConfig()
  const sheets = await getGoogleSheetsClient()
  
  // Obter última linha da planilha
  const rangeInfo = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${sheetName}!A:A`
  })
  
  const lastRow = rangeInfo.data.values ? rangeInfo.data.values.length + 1 : 1
  
  // Adicionar novo registro
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetId,
    range: `${sheetName}!A${lastRow}:E${lastRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [valores]
    }
  })
  
  return lastRow
}

// Função para obter dados da planilha
export async function obterDadosSheet(
  sheetName: string, 
  range: string
) {
  const config = useRuntimeConfig()
  const sheets = await getGoogleSheetsClient()
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: `${sheetName}!${range}`
  })
  
  return response.data.values || []
}

// Nova implementação que usa JSON como padrão, mas permite sobrescrever com valores da planilha
export async function obterConfiguracoes() {
  console.log("teste")
  try {
    // Inicializa com a configuração padrão do arquivo JSON
    const config = { ...configPadrao };
    
    // Tenta buscar configurações da planilha para sobrescrever as padrões
    const dados = await obterDadosSheet('Configurações', 'A1:C100');
    
    // Se houver uma célula JSON na planilha, usá-la como configuração completa
    // Procura por uma linha com chave "ConfigJSON"
    const jsonConfig = dados.find(linha => linha[0] === 'ConfigJSON');
    if (jsonConfig) {
      try {
        // Tenta fazer parse do JSON completo
        const planilhaConfig = JSON.parse(jsonConfig);
        // Mescla com configuração padrão, dando prioridade para a planilha
        Object.assign(config, planilhaConfig);
        console.log('Configuração JSON carregada da planilha.');
      } catch (e) {
        console.error('Erro ao processar JSON da planilha:', e);
      }
    } 
    // Se não tiver JSON completo, processa linha por linha (compatibilidade retroativa)
    else if (dados && dados.length > 0) {
      dados.forEach(linha => {
        if (linha[0] === 'PalavrasChavePJ' && linha[1]) {
          config.classificacao.palavrasChavePJ = linha[1].split(',').map(p => p.trim());
        } else if (linha[0] === 'PalavrasChavePF' && linha[1]) {
          config.classificacao.palavrasChavePF = linha[1].split(',').map(p => p.trim());
        } else if (linha[0] === 'NumerosAutorizados' && linha[1]) {
          config.usuarios.autorizados = linha[1].split(',').map(p => p.trim());
        }
        // Adicione mais mapeamentos conforme necessário
      });
      console.log('Configurações individuais carregadas da planilha.');
    } else {
      console.log('Aba de configurações não encontrada ou vazia. Usando configuração padrão.');
    }
    
    // Sempre garantir que o número do administrador está autorizado
    if (!config.usuarios.autorizados.includes('+5571992834144')) {
      config.usuarios.autorizados.push('+5571992834144');
    }
    
    // Adiciona método auxiliar para obter templates
    config.obterTemplate = (categoria, subcategoria, modo, id = null) => {
      try {
        // Para categorias com arrays diretos como "ajuda"
        if (!subcategoria && Array.isArray(config.templates[categoria])) {
          if (id) {
            const template = config.templates[categoria].find(t => t.id === id);
            return template ? template.template : null;
          }
          const template = config.templates[categoria].find(t => t.modo === modo || t.modo === 'todos');
          return template ? template.template : null;
        }
        
        // Para categorias com subcategorias (transacoes, relatorios, etc)
        if (id && config.templates[categoria]?.[subcategoria]) {
          const template = config.templates[categoria][subcategoria].find(t => t.id === id);
          return template ? template.template : null;
        }
        
        // Busca pelo modo
        if (config.templates[categoria]?.[subcategoria]) {
          const template = config.templates[categoria][subcategoria].find(
            t => t.modo === modo || t.modo === 'todos'
          );
          return template ? template.template : null;
        }
        
        return null;
      } catch (error) {
        console.error('Erro ao obter template:', error);
        return null;
      }
    };
    
    return config;
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    
    // Em caso de erro, retorna a configuração padrão do JSON
    const configSeguranca = { ...configPadrao };
    
    // Garantir que o número autorizado está incluído
    if (!configSeguranca.usuarios.autorizados.includes('+5571992834144')) {
      configSeguranca.usuarios.autorizados.push('+5571992834144');
    }
    
    return configSeguranca;
  }
}