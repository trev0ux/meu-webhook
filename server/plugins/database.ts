// server/plugins/database.ts
import { initializeDatabase } from '../../db';

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  initializeDatabase(config);
  console.log('Database initialized');
});