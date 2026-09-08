/**
 * Migração inicial + seed (Postgres/Supabase).
 */
import { migrate, seedDefaults } from './db.js';

await migrate();
await seedDefaults();

console.log('✓ Migração e seed concluídos (Postgres/Supabase)');
process.exit(0);
