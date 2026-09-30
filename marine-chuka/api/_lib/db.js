const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool, schemaOk = null;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000
    });
    pool.on('error', (e) => console.error('db pool error', e.message));
  }
  return pool;
}

/* Creates the tables if they are missing. Remembers success; if it fails, the next request tries again. */
function ensureSchema() {
  if (!schemaOk) {
    schemaOk = getPool().query(fs.readFileSync(path.join(__dirname, '..', '..', 'supabase.sql'), 'utf8'))
      .then(() => console.log('Database ready.'))
      .catch((e) => { schemaOk = null; console.error('!! Database setup failed:', e.message); throw e; });
  }
  return schemaOk;
}

const query = async (t, p) => { await ensureSchema(); return getPool().query(t, p); };
async function tx(fn) {
  await ensureSchema();
  const c = await getPool().connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { try { await c.query('rollback'); } catch (_) {} throw e; }
  finally { c.release(); }
}
module.exports = { query, tx, ensureSchema };
