// The page asks this every few seconds while waiting. It also re-checks the money each time, so a payment that just arrived is picked up.
const { tx, query } = require('./_lib/db');
const { settle, publicOrder } = require('./_lib/orders');
const { send, wrap, fail, same } = require('./_lib/util');

module.exports = wrap(async (req, res) => {
  const ref = String((req.query || {}).ref || '').toUpperCase(), token = String((req.query || {}).token || '');
  let { rows: [o] } = await query('select * from afr_orders where order_id = $1', [ref]);
  if (!o || !same(o.access_token, token)) throw fail(404, 'Order not found.');
  if (o.payment_status === 'AWAITING_VERIFICATION' && o.txn_code) {
    await tx((c) => settle(c, ref));
    ({ rows: [o] } = await query('select * from afr_orders where order_id = $1', [ref]));
  }
  const { rows: [t] } = await query('select serial from afr_tickets where order_id = $1', [ref]);
  send(res, 200, publicOrder(o, t));
});
