const { query } = require('./_lib/db');
const { publicOrder } = require('./_lib/orders');
const { send, wrap, fail, same } = require('./_lib/util');

module.exports = wrap(async (req, res) => {
  const { id, token } = req.query || {};
  const { rows: [o] } = await query('select * from orders_v2 where order_id = $1', [String(id || '')]);
  if (!o || !same(o.access_token, token || '')) throw fail(404, 'Order not found.');
  const { rows: [t] } = await query('select serial from tickets where order_id = $1', [o.order_id]);
  send(res, 200, publicOrder(o, t));
});
