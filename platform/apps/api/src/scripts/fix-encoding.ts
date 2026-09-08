/**
 * Script de Migração: Corrigir encoding UTF-8 corrompido (Postgres/Supabase).
 *
 * Background: Durante o desenvolvimento inicial, requisições com acentos
 * (ex: "José") foram gravadas como Latin-1 e exibidas como "Jos�". Este
 * script varre as colunas textuais e substitui essas sequências corrompidas
 * pelos acentos corretos.
 *
 * Uso:
 *   npm run fix:encoding
 *   npm run fix:encoding:dry
 */

import { q, q1, qe } from '../lib/db.js';

// Mapeamento de caracteres Latin-1 (lidos como UTF-8) → UTF-8 correto
const REPLACEMENTS: Array<[string, string]> = [
  ['Jo�o', 'José'],
  ['Ind�stria', 'Indústria'],
  ['Ind�strias', 'Indústrias'],
  ['A�ai', 'Açaí'],
  ['Ol�', 'Olá'],
  ['In�cio', 'Início'],
  ['Fun��es', 'Funções'],
  ['Informa��es', 'Informações'],
  ['Configura��es', 'Configurações'],
  ['Conex�o', 'Conexão'],
  ['N�o', 'Não'],
  ['Voc�', 'Você'],
  ['Descri��o', 'Descrição'],
  ['Caldeiraria��es', 'Caldeirariações'],
  ['poss�vel', 'possível'],
  ['pr�ximo', 'próximo'],
  ['s�o', 'são'],
  ['Est�o', 'Estão'],
  ['�', ''],
  ['Ã¡', 'á'],
  ['Ã©', 'é'],
  ['Ã­', 'í'],
  ['Ã³', 'ó'],
  ['Ãº', 'ú'],
  ['Ã ', 'à'],
  ['Ã¢', 'â'],
  ['Ã£', 'ã'],
  ['Ã§', 'ç'],
  ['Ãµ', 'õ'],
  ['Ã', 'Á'],
  ['Ã', 'É'],
  ['Ã', 'Í'],
  ['Ã', 'Ó'],
  ['Ã', 'Ú'],
  ['Ã', 'À'],
  ['Ã', 'Â'],
  ['Ã', 'Ã'],
  ['Ã', 'Ç'],
  ['Ã', 'Õ'],
  ['Â§', '§'],
  ['Â°', '°'],
];

async function getTextualColumns(table: string): Promise<Array<{ name: string }>> {
  const info = (await q(
    `SELECT column_name as name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )) as Array<{ name: string; data_type: string }>;
  return info
    .filter(c => /text|varchar|char/i.test(c.data_type))
    .map(c => ({ name: c.name }));
}

async function getAllTables(): Promise<string[]> {
  const rows = (await q(
    `SELECT table_name as name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  )) as Array<{ name: string }>;
  return rows.map(r => r.name);
}

async function getPrimaryKeyColumn(table: string): Promise<string> {
  const info = (await q(
    `SELECT column_name as name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  )) as Array<{ name: string }>;
  if (info.some(c => c.name === 'id')) return 'id';
  if (info.some(c => c.name === 'key')) return 'key';
  return info[0]?.name || 'rowid';
}

async function fixTable(table: string, dryRun = false): Promise<{ updated: number; cols: number }> {
  const cols = await getTextualColumns(table);
  if (cols.length === 0) return { updated: 0, cols: 0 };

  const pk = await getPrimaryKeyColumn(table);
  let totalUpdated = 0;

  for (const col of cols) {
    const rows = (await q(`SELECT "${pk}" AS id, "${col}" AS v FROM "${table}"`)) as Array<{ id: any; v: any }>;
    for (const row of rows) {
      if (typeof row.v !== 'string') continue;
      let newV = row.v;
      for (const [bad, good] of REPLACEMENTS) {
        if (bad === '') continue;
        if (newV.includes(bad)) {
          newV = newV.split(bad).join(good);
        }
      }
      if (newV !== row.v) {
        if (!dryRun) {
          await qe(`UPDATE "${table}" SET "${col}" = $1 WHERE "${pk}" = $2`, [newV, row.id]);
        }
        totalUpdated++;
      }
    }
  }
  return { updated: totalUpdated, cols: cols.length };
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Migration: Corrigir encoding UTF-8 (Postgres)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const dryRun = process.argv.includes('--dry-run');
  const tables = await getAllTables();

  console.log(`Modo: ${dryRun ? 'DRY RUN (sem alterar nada)' : 'EXECUTAR'}`);
  console.log(`Tabelas encontradas: ${tables.length}`);
  console.log('');

  let totalUpdates = 0;
  for (const t of tables) {
    const result = await fixTable(t, dryRun);
    if (result.updated > 0) {
      console.log(`  ✓ ${t}: ${result.updated} correções em ${result.cols} colunas`);
      totalUpdates += result.updated;
    }
  }

  console.log('');
  console.log(`Total de correções: ${totalUpdates}`);
  console.log('');
  console.log(dryRun ? 'DRY RUN completo. Sem alterações aplicadas.' : 'Migration aplicada com sucesso!');
  process.exit(0);
})();
