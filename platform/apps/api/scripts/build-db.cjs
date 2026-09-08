const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(ROOT, 'src/lib/schema.sql'), 'utf-8');

// O adapter foi migrado de node:sqlite para pg (Postgres/Supabase).
// O db.ts agora é escrito à mão em src/lib/db.ts. Este script legado NÃO
// deve mais sobrescrever o db.ts; deixamos apenas o schema.sql como referência.
console.log('⚠ build-db.cjs é obsoleto. O schema Postgres está em src/lib/schema.sql');
console.log('  e o adapter em src/lib/db.ts. Nada foi sobrescrito.');
console.log('  (schema.sql atual:', schema.length, 'bytes)');
