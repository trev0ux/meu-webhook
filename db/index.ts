// db/index.ts
import { Pool } from 'pg';


const config = useRuntimeConfig();

const pool = new Pool({
  user: config.postgresUser,
  host: config.postgresHost,
  database: config.postgresDb,
  password: config.postgresPassword,
  port: parseInt(config.postgresPort || '5432'),
});

export default {
  query: (text: string, params?: any[]) => pool.query(text, params),
};