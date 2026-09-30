// Returns the ticket for a paid order. Needs the order's secret token, so tickets cannot be guessed.
const { query } = require('./_lib/db');
const { send, wrap, fail, same, qrPayload } = require('./_lib/util');

module.exports = wrap(async (req, res) => {
  const { id, token } = req.query || {};
  const { rows: [r] } = await query(
    `select t.*, o.access_token, o.payment_status, o.order_id from tickets t join orders_v2 o on o.order_id = t.order_id
      where t.serial = $1 or o.order_id = $1`, [String(id || '').toUpperCase()]);
  if (!r || r.payment_status !== 'PAID' || !same(r.access_token, token || '')) throw fail(404, 'Ticket not found.');
  send(res, 200, {
    serial: r.serial, order_id: r.order_id, name: r.holder_name, names: String(r.holder_name || '').split('\n'), tier: r.tier, label: r.label, admits: r.admits,
    issued_at: r.issued_at, qr: qrPayload(r), checked_in: !!r.checked_in_at
  });
});
