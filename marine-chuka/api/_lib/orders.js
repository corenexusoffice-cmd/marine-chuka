const C = require('./catalog');
const { rand } = require('./util');

const digits = (s) => String(s || '').replace(/\D/g, '');

/* Give bundle stock back for unpaid orders that sat too long. */
async function releaseStale(c) {
  const r = await c.query(
    `select order_id, item, quantity from orders_v2
      where payment_status = 'PENDING' and stock_held and kind = 'bundle'
        and created_at < now() - ($1 || ' minutes')::interval for update skip locked`, [String(C.HOLD_MINUTES)]);
  for (const o of r.rows) {
    await c.query('update offer_stock set claimed = greatest(claimed - $2, 0) where offer_id = $1', [o.item, o.quantity]);
    await c.query('update orders_v2 set stock_held = false where order_id = $1', [o.order_id]);
  }
}

async function tryReserve(c, item, qty) {
  const r = await c.query('update offer_stock set claimed = claimed + $2 where offer_id = $1 and claimed + $2 <= total', [item, qty]);
  return r.rowCount === 1;
}
async function release(c, o) {
  if (o.kind === 'bundle' && o.stock_held) {
    await c.query('update offer_stock set claimed = greatest(claimed - $2, 0) where offer_id = $1', [o.item, o.quantity]);
    await c.query('update orders_v2 set stock_held = false where order_id = $1', [o.order_id]);
  }
}

async function issueTicket(c, o) {
  const { rows: [{ n }] } = await c.query("select nextval('ticket_seq') as n");
  const serial = 'AFP-' + String(n).padStart(6, '0') + '-' + rand(3);
  const tier = o.kind === 'bundle' ? 'regular' : o.item;
  await c.query(
    `insert into tickets (serial, seq, order_id, holder_name, tier, label, admits) values ($1,$2,$3,$4,$5,$6,$7)`,
    [serial, n, o.order_id, o.customer_name, tier, o.label, o.admits]);
  return serial;
}

/*
 * The ONLY place an order becomes PAID. Runs on the server, inside a transaction.
 * It needs a matching row in bank_credits (money that really arrived) with:
 *   - the same transaction code, not used by any other order
 *   - an amount at least equal to the order total
 *   - the right account reference (when the feed provides one)
 */
async function settle(c, orderId) {
  const { rows: [o] } = await c.query('select * from orders_v2 where order_id = $1 for update', [orderId]);
  if (!o || o.payment_status !== 'AWAITING_VERIFICATION' || !o.txn_code) return { settled: false, reason: 'not_waiting' };

  const { rows: [cr] } = await c.query('select * from bank_credits where txn_code = $1 for update', [o.txn_code]);
  if (!cr) return { settled: false, reason: 'no_credit' };
  if (cr.matched_order && cr.matched_order !== o.order_id) {
    await c.query("update orders_v2 set note = 'code_already_used' where order_id = $1", [o.order_id]);
    return { settled: false, reason: 'used' };
  }
  if (Number(cr.amount) < o.total_amount) {
    await c.query('update orders_v2 set note = $2 where order_id = $1', [o.order_id, `amount_short: received ${cr.amount}, needed ${o.total_amount}`]);
    return { settled: false, reason: 'short' };
  }
  if (cr.account_ref && digits(cr.account_ref) !== digits(C.PAY.account)) {
    await c.query("update orders_v2 set note = 'wrong_account' where order_id = $1", [o.order_id]);
    return { settled: false, reason: 'account' };
  }
  if (o.kind === 'bundle' && !o.stock_held) {
    if (!(await tryReserve(c, o.item, o.quantity))) {
      await c.query("update orders_v2 set note = 'paid_but_bundle_sold_out: refund or approve manually' where order_id = $1", [o.order_id]);
      return { settled: false, reason: 'stock' };
    }
    await c.query('update orders_v2 set stock_held = true where order_id = $1', [o.order_id]);
  }
  const serial = await issueTicket(c, o);
  const overNote = Number(cr.amount) > o.total_amount ? 'overpaid: received ' + cr.amount + ', needed ' + o.total_amount : null;
  await c.query("update orders_v2 set payment_status = 'PAID', paid_at = now(), note = $2 where order_id = $1", [o.order_id, overNote]);
  await c.query('update bank_credits set matched_order = $2 where txn_code = $1', [o.txn_code, o.order_id]);
  return { settled: true, serial };
}

/* Admin override: approve without a bank credit (e.g. paid, feed is late, checked the statement by hand). */
async function forceApprove(c, orderId) {
  const { rows: [o] } = await c.query('select * from orders_v2 where order_id = $1 for update', [orderId]);
  if (!o) return { ok: false, error: 'Order not found' };
  if (o.payment_status === 'PAID') return { ok: true, already: true };
  if (o.kind === 'bundle' && !o.stock_held && (await tryReserve(c, o.item, o.quantity))) {
    await c.query('update orders_v2 set stock_held = true where order_id = $1', [o.order_id]);
  }
  const serial = await issueTicket(c, o);
  await c.query("update orders_v2 set payment_status = 'PAID', paid_at = now(), note = 'approved by admin' where order_id = $1", [o.order_id]);
  if (o.txn_code) await c.query('update bank_credits set matched_order = $2 where txn_code = $1 and matched_order is null', [o.txn_code, o.order_id]);
  return { ok: true, serial };
}

async function reject(c, orderId, reason) {
  const { rows: [o] } = await c.query('select * from orders_v2 where order_id = $1 for update', [orderId]);
  if (!o) return { ok: false, error: 'Order not found' };
  if (o.payment_status === 'PAID') return { ok: false, error: 'Order is already paid and has a ticket' };
  await release(c, o);
  await c.query("update orders_v2 set payment_status = 'REJECTED', note = $2 where order_id = $1", [orderId, reason || 'rejected by admin']);
  return { ok: true };
}

const publicOrder = (o, ticket) => ({
  order_id: o.order_id, status: o.payment_status, name: o.customer_name, names: String(o.customer_name || '').split('\n'), label: o.label, kind: o.kind, item: o.item,
  quantity: o.quantity, admits: o.admits, total: o.total_amount, txn_code: o.txn_code || null,
  ticket: ticket ? { serial: ticket.serial } : null
});

module.exports = { releaseStale, tryReserve, release, settle, forceApprove, reject, issueTicket, publicOrder };
