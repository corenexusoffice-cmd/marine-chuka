const { Pool } = require('pg');
let pool;
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
const query = (t, p) => getPool().query(t, p);
async function tx(fn) {
  const c = await getPool().connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { try { await c.query('rollback'); } catch (_) {} throw e; }
  finally { c.release(); }
}
module.exports = { query, tx, getPool };
