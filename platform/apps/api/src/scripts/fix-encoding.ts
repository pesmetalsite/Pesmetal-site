/**
 * Script de Migração: Corrigir encoding UTF-8 corrompido no SQLite.
 *
 * Background: Durante o desenvolvimento inicial, requisições com acentos
 * (ex: "José") foram gravadas no SQLite como Latin-1 e exibidas como
 * "Jos�" (U+FFFD REPLACEMENT CHARACTER). Este script varre todas as
 * tabelas e substitui essas sequências corrompidas pelos acentos corretos.
 *
 * Uso:
 *   npm run fix:encoding
 *   npm run fix:encoding:dry
 */

import { db } from '../lib/db.js';

// Mapeamento de caracteres Latin-1 (lidos como UTF-8) → UTF-8 correto
// Estes pares foram identificados empiricamente nos dados
const REPLACEMENTS: Array<[string, string]> = [
  // Padrões específicos de palavras comuns corrompidas
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
  // Replacement char (U+FFFD) que aparece sozinho → remove
  ['�', ''],
  // Padrões genéricos de 2 bytes UTF-8 mal interpretados como Latin-1
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
  // Outros símbolos
  ['Â§', '§'],
  ['Â°', '°'],
];

function getTextualColumns(table: string): string[] {
  const info = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; type: string }>;
  return info
    .filter(c => /TEXT|VARCHAR|CHAR/i.test(c.type))
    .map(c => c.name);
}

function getAllTables(): string[] {
  const rows = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
  ).all() as Array<{ name: string }>;
  return rows.map(r => r.name);
}

function getPrimaryKeyColumn(table: string): string {
  // Tenta achar coluna 'id', senão 'key', senão primeira coluna
  const info = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
  if (info.some(c => c.name === 'id')) return 'id';
  if (info.some(c => c.name === 'key')) return 'key';
  return info[0]?.name || 'rowid';
}

function fixTable(table: string, dryRun = false): { updated: number; cols: number } {
  const cols = getTextualColumns(table);
  if (cols.length === 0) return { updated: 0, cols: 0 };

  const pk = getPrimaryKeyColumn(table);
  let totalUpdated = 0;

  for (const col of cols) {
    const rows = db.prepare(`SELECT "${pk}" AS id, "${col}" AS v FROM "${table}"`).all() as Array<{ id: any; v: any }>;
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
          db.prepare(`UPDATE "${table}" SET "${col}" = ? WHERE "${pk}" = ?`).run(newV, row.id);
        }
        totalUpdated++;
      }
    }
  }
  return { updated: totalUpdated, cols: cols.length };
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  Migration: Corrigir encoding UTF-8 no SQLite');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

const dryRun = process.argv.includes('--dry-run');
const tables = getAllTables();

console.log(`Modo: ${dryRun ? 'DRY RUN (sem alterar nada)' : 'EXECUTAR'}`);
console.log(`Tabelas encontradas: ${tables.length}`);
console.log('');

let totalUpdates = 0;
for (const t of tables) {
  const result = fixTable(t, dryRun);
  if (result.updated > 0) {
    console.log(`  ✓ ${t}: ${result.updated} correções em ${result.cols} colunas`);
    totalUpdates += result.updated;
  }
}

console.log('');
console.log(`Total de correções: ${totalUpdates}`);
console.log('');
console.log(dryRun ? 'DRY RUN completo. Sem alterações aplicadas.' : 'Migration aplicada com sucesso!');
