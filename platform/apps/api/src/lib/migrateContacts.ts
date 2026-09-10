/**
 * Migration: Adicionar colunas no_automation e is_favorite aos contatos
 */
import { pool } from './db.js';

async function migrate() {
  console.log('Running migration: add contact automation flags...');

  // Adicionar no_automation
  try {
    await pool.query(`
      ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS no_automation BOOLEAN DEFAULT FALSE;
    `);
    console.log('✓ Column no_automation added');
  } catch (e: any) {
    if (e.code === '42701') console.log('- Column no_automation already exists');
    else console.error('Error adding no_automation:', e.message);
  }

  // Adicionar is_favorite
  try {
    await pool.query(`
      ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
    `);
    console.log('✓ Column is_favorite added');
  } catch (e: any) {
    if (e.code === '42701') console.log('- Column is_favorite already exists');
    else console.error('Error adding is_favorite:', e.message);
  }

  console.log('Migration complete!');
  await pool.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
