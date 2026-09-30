// Back-office for the team: check money, approve/reject orders, scan tickets at the gate.
// Protected by ADMIN_KEY (sent as "Authorization: Bearer <key>").
const { query, tx } = require('./_lib/db');
const { settle, forceApprove, reject, releaseStale } = require('./_lib/orders');
const { send, readBody, wrap, fail, same, sign, parseCredits } = require('./_lib/util');

module.exports = wrap(async (req, res) => {
  if (req.method !== 'POST') throw fail(405, 'Method not allowed');
  const key = process.env.ADMIN_KEY;
  if (!key) throw fail(503, 'Admin is not configured');
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!same(key, auth)) throw fail(401, 'Wrong admin key');
  const b = await readBody(req);

  switch (b.action) {
    case 'list': {
      await tx(releaseStale);
      const st = ['PENDING', 'AWAITING_VERIFICATION', 'PAID', 'REJECTED'].includes(b.status) ? b.status : 'AWAITING_VERIFICATION';
      const { rows } = await query(
        `select o.order_id, o.created_at, o.customer_name, o.label, o.quantity, o.admits, o.total_amount, o.payment_status, o.txn_code, o.note, o.submitted_at,
                t.serial, c.amount as credit_amount
           from afr_orders o left join afr_tickets t on t.order_id = o.order_id left join afr_credits c on c.txn_code = o.txn_code
          where o.payment_status = $1 order by o.created_at desc limit 200`, [st]);
      const { rows: counts } = await query('select payment_status s, count(*)::int n, coalesce(sum(total_amount),0)::int amt from afr_orders group by 1');
      const { rows: [tk] } = await query('select count(*)::int n, coalesce(sum(admits),0)::int admits, count(checked_in_at)::int inside from afr_tickets');
      send(res, 200, { orders: rows, counts, tickets: tk });
      return;
    }
    case 'approve': { const r = await tx((c) => forceApprove(c, String(b.order_id))); send(res, r.ok ? 200 : 400, r); return; }
    case 'reject': { const r = await tx((c) => reject(c, String(b.order_id), String(b.reason || '').slice(0, 200))); send(res, r.ok ? 200 : 400, r); return; }
    case 'add_credits': {
      const items = parseCredits(b.text); let added = 0, settled = 0;
      for (const it of items) {
        await tx(async (c) => {
          const r = await c.query(`insert into afr_credits (txn_code, amount, payer, source) values ($1,$2,$3,'admin') on conflict (txn_code) do nothing`, [it.code, it.amount, it.payer]);
          added += r.rowCount;
          const { rows: [o] } = await c.query("select order_id from afr_orders where txn_code = $1 and payment_status = 'AWAITING_VERIFICATION'", [it.code]);
          if (o && (await settle(c, o.order_id)).settled) settled++;
        });
      }
      send(res, 200, { read: items.length, added, settled });
      return;
    }
    case 'rescan': {
      const { rows } = await query("select order_id from afr_orders where payment_status = 'AWAITING_VERIFICATION'");
      let settled = 0;
      for (const o of rows) if ((await tx((c) => settle(c, o.order_id))).settled) settled++;
      send(res, 200, { checked: rows.length, settled });
      return;
    }
    case 'scan': {
      let serial = String(b.code || '').trim().toUpperCase(), valid = true;
      if (serial.startsWith('AFP1|')) {
        const [, s, tier, admits, sig] = serial.split('|');
        serial = s; valid = same(sign(`${s}|${String(tier).toLowerCase()}|${admits}`), sig || '') || same(sign(`${s}|${tier}|${admits}`), sig || '');
      }
      const { rows: [t] } = await query('select * from afr_tickets where serial = $1', [serial]);
      if (!t || !valid) { send(res, 200, { result: 'INVALID', serial }); return; }
      if (t.checked_in_at) { send(res, 200, { result: 'ALREADY_USED', serial, name: t.holder_name, label: t.label, admits: t.admits, at: t.checked_in_at }); return; }
      if (b.checkin) await query('update afr_tickets set checked_in_at = now() where serial = $1 and checked_in_at is null', [serial]);
      send(res, 200, { result: b.checkin ? 'CHECKED_IN' : 'VALID', serial, name: t.holder_name, label: t.label, admits: t.admits });
      return;
    }
    default: throw fail(400, 'Unknown action');
  }
});
