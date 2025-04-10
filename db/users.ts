// db/usuarios.ts
import db from './index';

// Tipos
export interface Usuario {
  id: number;
  telefone: string;
  nome: string | null;
  email: string | null;
  perfil: 'pessoa_fisica' | 'empresario_individual';
  data_criacao: Date;
  ultimo_acesso: Date;
}

export interface EstadoConversa {
  id: number;
  usuario_id: number;
  tipo: string;
  dados: any; // JSON
  criado_em: Date;
  atualizado_em: Date;
}

// Buscar usuário por telefone
// server/utils/usuarios.ts

export async function findUser(telefone: string): Promise<Usuario | null> {


  try {
    const resultado = await db.query('SELECT * FROM usuarios WHERE telefone = $1', [telefone.replace(/^whatsapp:/, '')]);

    
    if (resultado.rows.length > 0) {
      // Atualizar último acesso
      await db.query(
        'UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1',
        [resultado.rows[0].id]
      );
      return resultado.rows[0] as Usuario;
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    throw error;
  }
}

// Criar novo usuário
export async function criarUsuario(
  telefone: string,
  perfil: 'pessoa_fisica' | 'empresario_individual',
  nome?: string,
  email?: string
): Promise<Usuario> {
  const resultado = await db.query(
    'INSERT INTO usuarios (telefone, perfil, nome, email) VALUES ($1, $2, $3, $4) RETURNING *',
    [telefone, perfil, nome || null, email || null]
  );
  
  return resultado.rows[0];
}

export async function atualizarUsuario(
  usuario_id: number, 
  dados: Partial<Usuario>
): Promise<Usuario> {
  const campos = Object.keys(dados);
  const valores = Object.values(dados);
  
  const setString = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
  
  const resultado = await db.query(
    `UPDATE usuarios SET ${setString} WHERE id = $1 RETURNING *`,
    [usuario_id, ...valores]
  );
  
  return resultado.rows[0];
}

export async function buscarEstadoConversa(usuario_id: number): Promise<EstadoConversa | null> {
  const resultado = await db.query(
    'SELECT * FROM estados_conversa WHERE usuario_id = $1 ORDER BY atualizado_em DESC LIMIT 1',
    [usuario_id]
  );
  
  return resultado.rows[0] || null;
}

export async function salvarEstadoConversa(
  usuario_id: number,
  tipo: string,
  dados: any
): Promise<EstadoConversa> {
  const estadoExistente = await buscarEstadoConversa(usuario_id);
  
  if (estadoExistente) {
    const resultado = await db.query(
      'UPDATE estados_conversa SET tipo = $1, dados = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [tipo, JSON.stringify(dados), estadoExistente.id]
    );
    return resultado.rows[0];
  } else {
    const resultado = await db.query(
      'INSERT INTO estados_conversa (usuario_id, tipo, dados) VALUES ($1, $2, $3) RETURNING *',
      [usuario_id, tipo, JSON.stringify(dados)]
    );
    return resultado.rows[0];
  }
}

export async function limparEstadoConversa(usuario_id: number): Promise<void> {
  await db.query(
    'DELETE FROM estados_conversa WHERE usuario_id = $1',
    [usuario_id]
  );
}