// Step 1: customer sends names (one per person admitted), item, quantity. Server prices it and creates a PENDING order.
const C = require('./_lib/catalog');
const { tx } = require('./_lib/db');
const { releaseStale, tryReserve } = require('./_lib/orders');
const { send, readBody, wrap, fail, orderRef, accessToken, ip } = require('./_lib/util');

module.exports = wrap(async (req, res) => {
  if (req.method !== 'POST') throw fail(405, 'Method not allowed');
  const b = await readBody(req);
  const qty = parseInt(b.quantity, 10);
  if (!Number.isInteger(qty) || qty < 1) throw fail(400, 'Choose how many you want.');
  // Names are printed on the ticket exactly as typed. We only make sure none is blank.
  const clean = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const names = (Array.isArray(b.names) ? b.names : []).map(clean);
  // no phone number is collected any more; the column stays filled with a hidden anti-abuse key
  const phone = 'ip:' + ip(req);

  let kind, item, label, unit, people;
  if (C.TIERS[b.item]) {
    kind = 'tier'; item = b.item; label = C.TIERS[item].name; unit = C.TIERS[item].price; people = 1;
    if (qty > C.MAX_TICKETS_PER_ORDER) throw fail(400, `You can buy up to ${C.MAX_TICKETS_PER_ORDER} tickets per order.`);
  } else if (C.OFFERS[b.item]) {
    kind = 'bundle'; item = b.item; label = C.OFFERS[item].name; unit = C.OFFERS[item].price; people = C.OFFERS[item].people;
    if (!C.offerLive()) throw fail(409, 'This offer has ended. Regular tickets are still on sale.');
    if (qty > C.MAX_BUNDLES_PER_ORDER) throw fail(400, `You can buy up to ${C.MAX_BUNDLES_PER_ORDER} bundles per order.`);
  } else throw fail(400, 'Unknown ticket type.');

  const admits = people * qty;
  if (names.length !== admits || names.some((n) => !n)) throw fail(400, admits > 1 ? `Enter a name for each of the ${admits} people.` : 'Enter the name for the ticket.');
  const holders = names.join('\n');   // stored as one text, one name per line

  const order = await tx(async (c) => {
    await releaseStale(c);
    // stop people hoarding: at most 10 unpaid orders per connection in 30 minutes (generous, phones share networks)
    const { rows: [{ n }] } = await c.query(
      "select count(*)::int n from orders_v2 where phone = $1 and payment_status = 'PENDING' and created_at > now() - interval '30 minutes'", [phone]);
    if (n >= 10) throw fail(429, 'You already have unpaid orders open. Finish one of them or try again in a few minutes.');
    if (kind === 'bundle' && !(await tryReserve(c, item, qty))) throw fail(409, 'Those bundles just sold out. Try a smaller quantity or another offer.');
    const o = { order_id: orderRef(), token: accessToken(), total: unit * qty };
    await c.query(
      `insert into orders_v2 (order_id, customer_name, phone, kind, item, label, quantity, admits, total_amount, payment_status, access_token, stock_held)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10,$11)`,
      [o.order_id, holders, phone, kind, item, label, qty, admits, o.total, o.token, kind === 'bundle']);
    return o;
  });
  send(res, 200, {
    order_id: order.order_id, token: order.token, total: order.total, label, quantity: qty, admits, kind, item, pay: C.PAY
  });
});
