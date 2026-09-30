// "I've paid" button. The customer's browser already showed the payment page (no server needed for that).
// This one call: saves the order (if the server has not seen it yet), saves the M-Pesa code, and checks whether the money has arrived.
// A ticket is only ever issued when real money with that same code and enough amount is in afr_credits.
const C = require('./_lib/catalog');
const { tx, query } = require('./_lib/db');
const { settle, tryReserve, publicOrder } = require('./_lib/orders');
const { send, readBody, wrap, fail, same, normCode, validCode } = require('./_lib/util');

const clean = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

module.exports = wrap(async (req, res) => {
  if (req.method !== 'POST') throw fail(405, 'Method not allowed');
  const b = await readBody(req);
  const ref = String(b.ref || '').toUpperCase(), token = String(b.token || '');
  const code = normCode(b.txn_code);
  if (!/^AFR-[A-Z0-9]{6}$/.test(ref) || token.length < 16 || token.length > 80) throw fail(400, 'Order details are missing. Please start again.');
  if (!validCode(code)) throw fail(400, 'That code does not look right. It has 8 to 20 letters and numbers and is in your M-Pesa message.');

  const out = await tx(async (c) => {
    let { rows: [o] } = await c.query('select * from afr_orders where order_id = $1 for update', [ref]);

    if (!o) {   // first time the server hears about this order: build it from OUR prices, never the browser's
      const qty = parseInt(b.quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) throw fail(400, 'Choose how many you want.');
      let kind, item, label, unit, people;
      if (C.TIERS[b.item]) {
        kind = 'tier'; item = b.item; label = C.TIERS[item].name; unit = C.TIERS[item].price; people = 1;
        if (qty > C.MAX_TICKETS_PER_ORDER) throw fail(400, `You can buy up to ${C.MAX_TICKETS_PER_ORDER} tickets per order.`);
      } else if (C.OFFERS[b.item]) {
        kind = 'bundle'; item = b.item; label = C.OFFERS[item].name; unit = C.OFFERS[item].price; people = C.OFFERS[item].people;
        if (qty > C.MAX_BUNDLES_PER_ORDER) throw fail(400, `You can buy up to ${C.MAX_BUNDLES_PER_ORDER} bundles per order.`);
      } else throw fail(400, 'Unknown ticket type.');
      const names = (Array.isArray(b.names) ? b.names : []).map(clean);
      const admits = people * qty;
      if (names.length !== admits || names.some((n) => !n)) throw fail(400, 'A name is missing for one of the people. Please go back and fill every name.');
      const held = kind === 'bundle' ? await tryReserve(c, item, qty) : false;
      await c.query(
        `insert into afr_orders (order_id, customer_name, kind, item, label, quantity, admits, total_amount, payment_status, access_token, stock_held)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'AWAITING_VERIFICATION',$9,$10)`,
        [ref, names.join('\n'), kind, item, label, qty, admits, unit * qty, token, held]);
      ({ rows: [o] } = await c.query('select * from afr_orders where order_id = $1', [ref]));
    } else if (!same(o.access_token, token)) throw fail(404, 'Order not found.');

    if (o.payment_status === 'PAID') return { o, known: true };
    if (o.payment_status === 'REJECTED') throw fail(409, 'This order was closed. Please start a new order.');

    if (o.txn_code !== code) {
      if (o.code_attempts >= 5) throw fail(429, 'Too many codes tried on this order. Contact us with your order reference and M-Pesa message.');
      const { rows: [dup] } = await c.query('select order_id from afr_orders where txn_code = $1 and order_id <> $2', [code, ref]);
      if (dup) throw fail(409, 'This M-Pesa code is already used on another order.');
      await c.query("update afr_orders set txn_code = $2, code_attempts = code_attempts + 1, submitted_at = now(), note = null where order_id = $1", [ref, code]);
    }
    await settle(c, ref);
    const { rows: [n] } = await c.query('select * from afr_orders where order_id = $1', [ref]);
    return { o: n };
  });
  const { rows: [t] } = await query('select serial from afr_tickets where order_id = $1', [ref]);
  send(res, 200, publicOrder(out.o, t));
});
