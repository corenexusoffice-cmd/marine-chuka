// Step 2: customer enters the transaction code from their payment confirmation.
// This NEVER makes a ticket by itself. It saves the code and asks the server to check it against real credits.
const C = require('./_lib/catalog');
const { tx, query } = require('./_lib/db');
const { settle, publicOrder } = require('./_lib/orders');
const { send, readBody, wrap, fail, same, normCode, validCode } = require('./_lib/util');

module.exports = wrap(async (req, res) => {
  if (req.method !== 'POST') throw fail(405, 'Method not allowed');
  const b = await readBody(req);
  const code = normCode(b.txn_code);
  if (!validCode(code)) throw fail(400, 'That code does not look right. It is 8 to 20 letters and numbers, in your payment confirmation message.');

  const out = await tx(async (c) => {
    const { rows: [o] } = await c.query('select * from orders_v2 where order_id = $1 for update', [String(b.order_id || '')]);
    if (!o || !same(o.access_token, b.token || '')) throw fail(404, 'Order not found.');
    if (o.payment_status === 'PAID') return { o, settled: false };
    if (o.payment_status === 'REJECTED') throw fail(409, 'This order was closed. Please start a new order.');
    if (o.payment_status === 'AWAITING_VERIFICATION') {
      if (o.txn_code === code) return { o, settled: false };
      throw fail(409, 'A code is already being verified for this order. If it was wrong, contact us with your order reference.');
    }
    if (o.code_attempts >= 5) throw fail(429, 'Too many attempts on this order. Contact us with your order reference and payment message.');
    await c.query('update orders_v2 set code_attempts = code_attempts + 1 where order_id = $1', [o.order_id]);

    const { rows: [dup] } = await c.query('select order_id from orders_v2 where txn_code = $1', [code]);
    if (dup) throw Object.assign(fail(409, 'This transaction code has already been used on another order.'), { keepAttempt: true });

    await c.query("update orders_v2 set txn_code = $2, payment_status = 'AWAITING_VERIFICATION', submitted_at = now(), note = null where order_id = $1", [o.order_id, code]);
    const s = await settle(c, o.order_id);       // instant match if the bank credit already arrived
    const { rows: [n] } = await c.query('select * from orders_v2 where order_id = $1', [o.order_id]);
    return { o: n, settled: s.settled };
  }).catch(async (e) => {
    // the failed duplicate attempt must still count, otherwise people could guess codes forever
    if (e.keepAttempt) { try { await query('update orders_v2 set code_attempts = code_attempts + 1 where order_id = $1 and payment_status = \'PENDING\'', [String(b.order_id || '')]); } catch (_) {} }
    throw e;
  });
  const { rows: [t] } = await query('select serial from tickets where order_id = $1', [out.o.order_id]);
  send(res, 200, publicOrder(out.o, t));
});
