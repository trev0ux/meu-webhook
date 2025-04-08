// server/utils/openai.ts
import OpenAI from 'openai';

let openaiInstance: OpenAI | null = null;

export function getOpenAIClient() {
  if (openaiInstance) return openaiInstance;
  
  const config = useRuntimeConfig();
  
  // Novo método de inicialização para OpenAI v4+
  openaiInstance = new OpenAI({
    apiKey: config.openaiApiKey
  });
  
  return openaiInstance;
}

export async function classificarGasto(mensagem: string) {
  const openai = getOpenAIClient();
  
  // Palavras-chave padrão (sem depender da planilha)
  const palavrasChavePJ = ['cliente', 'fornecedor', 'cnpj', 'nota fiscal', 'empresa', 'reunião'];
  const palavrasChavePF = ['família', 'pessoal', 'filhos', 'casa', 'férias'];
  
  const prompt = `
    Você é um assistente financeiro especializado em classificar gastos para empresários individuais.
    
    Analise a seguinte mensagem e classifique como "PJ" (despesa empresarial) ou "PF" (despesa pessoal).
    
    Palavras-chave PJ: ${palavrasChavePJ.join(', ')}
    Palavras-chave PF: ${palavrasChavePF.join(', ')}
    
    Responda em formato JSON apenas com:
    {
      "tipo": "PJ" ou "PF",
      "categoria": "categoria específica como Alimentação PJ, Lazer PF, etc",
      "probabilidade": número entre 0 e 1 indicando sua confiança
    }
    
    Mensagem: "${mensagem}"
  `;
  
  try {
    // Novo método para criar completions na v4+
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Você é um assistente financeiro especializado." },
        { role: "user", content: prompt }
      ]
    });
    
    // Acesso ao conteúdo da resposta na v4+
    const resposta = response.choices[0].message?.content || '{}';
    return JSON.parse(resposta);
  } catch (error) {
    console.error('Erro ao classificar gasto:', error);
    return { 
      tipo: "Não classificado", 
      categoria: "Diversos", 
      probabilidade: 0 
    };
  }
}