import pg from 'pg'
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const r1 = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='automations' ORDER BY ordinal_position")
console.log('AUTOMATIONS COLUMNS:', r1.rows.map(x => x.column_name).join(','))
const r2 = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='whatsapp_messages' AND column_name='client_id'")
console.log('WHATSAPP_MESSAGES HAS client_id:', r2.rows.length > 0)
const r3 = await p.query("SELECT steps, step_options FROM automations WHERE id='auto_5f15c3bd-3e6e-4f'")
console.log('OUR AUTOMATION:', r3.rows)
await p.end()
