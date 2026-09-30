const C = require('./_lib/catalog');
const { query, tx } = require('./_lib/db');
const { releaseStale } = require('./_lib/orders');
const { send, wrap } = require('./_lib/util');

module.exports = wrap(async (req, res) => {
  await tx(releaseStale);
  const { rows } = await query('select offer_id, total, claimed from offer_stock');
  const stock = {}; rows.forEach((r) => { stock[r.offer_id] = Math.max(0, r.total - r.claimed); });
  res.setHeader('Cache-Control', 'no-store');
  send(res, 200, {
    now: Date.now(), offerEnds: C.OFFER_ENDS, offerLive: C.offerLive(), stockPerOffer: C.STOCK_PER_OFFER,
    maxBundles: C.MAX_BUNDLES_PER_ORDER, maxTickets: C.MAX_TICKETS_PER_ORDER,
    tiers: C.TIERS, offers: C.OFFERS, stock, pay: C.PAY
  });
});
