// server/utils/sheets-manager.ts
import { getGoogleSheetsClient, obterDadosSheet, adicionarLinhaSheet } from './sheets';
import { formatarData } from './extrator';
import configPadrao from '../../../config/keywords.json';

// Classe para gerenciar operações em planilhas
export class SheetManager {
  private spreadsheetId: string;
  
  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
  }
  
  // Método para adicionar um gasto na planilha
  async adicionarGasto(
    tipo: 'PJ' | 'PF',
    data: Date,
    descricao: string,
    valor: number,
    categoria: string,
    detalhes: Record<string, string> = {}
  ) {
    // Determinar qual aba/sheet usar
    const sheetName = tipo === 'PJ' ? 'PJ' : 'PF';
    const dataFormatada = formatarData(data);
    
    // Preparar linha baseada no tipo
    let linha: any[];
    
    if (tipo === 'PJ') {
      // Formato para gastos PJ
      linha = [
        dataFormatada,                // Data
        descricao,                    // Descrição
        valor.toFixed(2),             // Valor
        categoria,                    // Categoria
        detalhes.notaFiscal || '',    // Nota Fiscal
        detalhes.formaPagamento || '', // Forma de Pagamento
        detalhes.cnpj || '',          // CNPJ
        detalhes.nome || ''           // Nome do fornecedor/cliente
      ];
    } else {
      // Formato para gastos PF
      linha = [
        dataFormatada,                // Data
        descricao,                    // Descrição
        valor.toFixed(2),             // Valor
        categoria,                    // Categoria
        detalhes.formaPagamento || '', // Forma de Pagamento
        detalhes.nome || ''           // Nome da pessoa/estabelecimento
      ];
    }
    
    // Adicionar linha na planilha
    return await adicionarLinhaSheet(sheetName, linha);
  }
  
  // Método para adicionar um ganho na planilha
  async adicionarGanho(
    tipo: 'PJ' | 'PF',
    data: Date,
    descricao: string,
    valor: number,
    categoria: string,
    detalhes: Record<string, string> = {}
  ) {
    // Determinar qual aba/sheet usar
    const sheetName = tipo === 'PJ' ? 'GanhosPJ' : 'GanhosPF';
    const dataFormatada = formatarData(data);
    
    // Preparar linha baseada no tipo
    let linha: any[];
    
    if (tipo === 'PJ') {
      // Formato para ganhos PJ
      linha = [
        dataFormatada,                // Data
        descricao,                    // Descrição
        valor.toFixed(2),             // Valor
        categoria,                    // Categoria
        detalhes.notaFiscal || '',    // Nota Fiscal
        detalhes.formaPagamento || '', // Forma de Pagamento
        detalhes.cnpj || '',          // CNPJ
        detalhes.nome || ''           // Nome do cliente
      ];
    } else {
      // Formato para ganhos PF
      linha = [
        dataFormatada,                // Data
        descricao,                    // Descrição
        valor.toFixed(2),             // Valor
        categoria,                    // Categoria
        detalhes.formaPagamento || '', // Forma de Pagamento
        detalhes.fonte || ''          // Fonte do ganho
      ];
    }
    
    try {
      // Adicionar linha na planilha
      return await adicionarLinhaSheet(sheetName, linha);
    } catch (error) {
      // Se a aba não existir, tente criar e depois adicione
      console.error(`Erro ao adicionar ganho em ${sheetName}:`, error);
      console.log(`Tentando criar aba ${sheetName} e adicionar novamente...`);
      
      // Aqui poderia implementar a criação da aba se necessário
      // Por enquanto, adicionamos na aba padrão
      return await adicionarLinhaSheet(tipo, linha);
    }
  }
  
  // Método para obter total gasto em uma categoria no mês atual
  async obterTotalCategoriaMesAtual(tipo: 'PJ' | 'PF', categoria: string): Promise<number> {
    try {
      const sheetName = tipo;
      const hoje = new Date();
      const mes = hoje.getMonth() + 1; // JavaScript meses são 0-indexed
      const ano = hoje.getFullYear();
      
      // Obter todos os dados
      const todosDados = await obterDadosSheet(sheetName, 'A2:E1000');
      
      // Filtrar por data (formato DD/MM/AAAA) e categoria
      const gastosFiltrados = todosDados.filter(linha => {
        if (!linha[0] || !linha[3]) return false;
        const data = linha[0];
        const cat = linha[3];
        
        // Verificar se contém o mês/ano atual e a categoria certa
        const mesStr = mes < 10 ? `0${mes}` : `${mes}`;
        const anoStr = ano.toString();
        const matchData = data.includes(`/${mesStr}/${anoStr}`) || data.includes(`/${mesStr}/${anoStr.substring(2)}`);
        const matchCategoria = cat.toLowerCase() === categoria.toLowerCase();
        
        return matchData && matchCategoria;
      });
      
      // Somar os valores
      return gastosFiltrados.reduce((acc, item) => acc + Number(item[2] || 0), 0);
    } catch (error) {
      console.error(`Erro ao obter total da categoria:`, error);
      return 0;
    }
  }
  
  // Método para obter total de ganhos em uma categoria no mês atual
  async obterTotalGanhosCategoriaAtual(tipo: 'PJ' | 'PF', categoria: string): Promise<number> {
    try {
      const sheetName = tipo === 'PJ' ? 'GanhosPJ' : 'GanhosPF';
      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();
      
      // Tenta obter da aba específica, se falhar usa a aba genérica
      try {
        const todosDados = await obterDadosSheet(sheetName, 'A2:E1000');
        
        // Filtrar por data e categoria
        const ganhosFiltrados = todosDados.filter(linha => {
          if (!linha[0] || !linha[3]) return false;
          const data = linha[0];
          const cat = linha[3];
          
          const mesStr = mes < 10 ? `0${mes}` : `${mes}`;
          const anoStr = ano.toString();
          const matchData = data.includes(`/${mesStr}/${anoStr}`) || data.includes(`/${mesStr}/${anoStr.substring(2)}`);
          const matchCategoria = cat.toLowerCase() === categoria.toLowerCase();
          
          return matchData && matchCategoria;
        });
        
        // Somar os valores
        return ganhosFiltrados.reduce((acc, item) => acc + Number(item[2] || 0), 0);
      } catch (error) {
        // Se falhar, tenta na aba genérica
        console.warn(`Aba ${sheetName} não encontrada, buscando em ${tipo}`);
        return 0; // Por enquanto retorna 0
      }
    } catch (error) {
      console.error(`Erro ao obter total de ganhos da categoria:`, error);
      return 0;
    }
  }
  
  // Método para verificar se uma planilha precisa ser inicializada
  async verificarInicializarPlanilha() {
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Obter informações da planilha
      const response = await sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      
      const abas = response.data.sheets.map(sheet => sheet.properties.title);
      
      // Verificar se as abas necessárias existem
      const abasNecessarias = ['PJ', 'PF', 'GanhosPJ', 'GanhosPF', 'Configurações'];
      const abasFaltantes = abasNecessarias.filter(aba => !abas.includes(aba));
      
      if (abasFaltantes.length > 0) {
        console.log(`Abas faltantes: ${abasFaltantes.join(', ')}. Inicializando...`);
        await this.inicializarPlanilha(abasFaltantes);
      }
    } catch (error) {
      console.error('Erro ao verificar planilha:', error);
    }
  }
  
  // Método para inicializar a estrutura da planilha
  private async inicializarPlanilha(abasFaltantes: string[]) {
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Criar as abas faltantes
      for (const aba of abasFaltantes) {
        // Adicionar a aba
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: aba
                  }
                }
              }
            ]
          }
        });
        
        // Adicionar cabeçalhos de acordo com o tipo da aba
        let cabecalhos: string[] = [];
        
        if (aba === 'PJ') {
          cabecalhos = [
            'Data', 'Descrição', 'Valor', 'Categoria', 
            'Nota Fiscal', 'Forma Pagamento', 'CNPJ', 'Fornecedor'
          ];
        } else if (aba === 'PF') {
          cabecalhos = [
            'Data', 'Descrição', 'Valor', 'Categoria', 
            'Forma Pagamento', 'Local/Pessoa'
          ];
        } else if (aba === 'GanhosPJ') {
          cabecalhos = [
            'Data', 'Descrição', 'Valor', 'Categoria', 
            'Nota Fiscal', 'Forma Pagamento', 'CNPJ', 'Cliente'
          ];
        } else if (aba === 'GanhosPF') {
          cabecalhos = [
            'Data', 'Descrição', 'Valor', 'Categoria', 
            'Forma Pagamento', 'Fonte'
          ];
        } else if (aba === 'Configurações') {
          cabecalhos = ['Chave', 'Valor', 'Descrição'];
        }
        
        // Adicionar cabeçalhos
        await sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${aba}!A1:Z1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [cabecalhos]
          }
        });
        
        console.log(`Aba ${aba} criada com sucesso`);
      }
      
      // Se Configurações estava entre as abas faltantes, adicionar configurações padrão
      if (abasFaltantes.includes('Configurações')) {
        await this.inicializarConfiguracoes();
      }
    } catch (error) {
      console.error('Erro ao inicializar planilha:', error);
    }
  }
  
  // Método para inicializar a aba de configurações
  private async inicializarConfiguracoes() {
    try {
      // Configurações básicas para inicializar
      const configuracoes = [
        ['Modo', 'dual', 'Modo de operação: dual (PJ+PF) ou pessoal'],
        ['PalavrasChavePJ', configPadrao.classificacao.palavrasChavePJ.join(', '), 'Palavras que indicam gastos empresariais'],
        ['PalavrasChavePF', configPadrao.classificacao.palavrasChavePF.join(', '), 'Palavras que indicam gastos pessoais'],
        ['ConfigJSON', JSON.stringify(configPadrao), 'Configuração completa em formato JSON']
      ];
      
      // Adicionar configurações
      await adicionarLinhaSheet('Configurações', configuracoes[0]);
      await adicionarLinhaSheet('Configurações', configuracoes[1]);
      await adicionarLinhaSheet('Configurações', configuracoes[2]);
      await adicionarLinhaSheet('Configurações', configuracoes[3]);
      
      console.log('Configurações padrão adicionadas com sucesso');
    } catch (error) {
      console.error('Erro ao inicializar configurações:', error);
    }
  }
}