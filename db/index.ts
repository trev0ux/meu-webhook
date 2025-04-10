// db/index.ts
import pkg from 'pg';
const { Pool } = pkg;

let pool: pkg.Pool | null = null;

export function initializeDatabase(config: any) {
    pool = new Pool({
      user: config.postgresUser || 'postgres',
      host: config.postgresHost || 'localhost',
      database: config.postgresDb || 'postgres',
      password: config.postgresPassword || '7894',
      port: parseInt(config.postgresPort || '5432'),
    });
  
  return pool;
}

export default {
  query: async (text: string, params?: any[]) => {
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    return pool.query(text, params);
  }
};