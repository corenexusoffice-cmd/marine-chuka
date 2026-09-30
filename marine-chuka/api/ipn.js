// Feed of REAL incoming payments. Point your bank / M-Pesa notification service at:
//   POST https://YOUR-SITE/api/ipn      header:  x-ipn-secret: <IPN_SECRET>
// Body: one payment or a list. Field names are flexible (Daraja C2B names work too):
//   { "txn_code": "SJK7X2P9QR", "amount": 2000, "account": "1500184456952", "payer": "JOHN D" }
const { tx } = require('./_lib/db');
const { settle } = require('./_lib/orders');
const { send, readBody, wrap, fail, same, normCode, validCode } = require('./_lib/util');

const pick = (o, keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; };

module.exports = wrap(async (req, res) => {
  if (req.method !== 'POST') throw fail(405, 'Method not allowed');
  const key = process.env.IPN_SECRET;
  if (!key) throw fail(503, 'IPN is not configured');
  const given = req.headers['x-ipn-secret'] || (req.query && req.query.key) || '';
  if (!same(key, given)) throw fail(401, 'Unauthorized');

  const body = await readBody(req);
  const list = Array.isArray(body) ? body : (Array.isArray(body.payments) ? body.payments : [body]);
  let saved = 0, settled = 0;
  for (const p of list) {
    const code = normCode(pick(p, ['txn_code', 'transaction_code', 'TransID', 'transactionId', 'reference', 'transactionReference']));
    const amount = Number(String(pick(p, ['amount', 'TransAmount', 'transAmount']) || '').replace(/,/g, ''));
    if (!validCode(code) || !(amount > 0)) continue;
    const account = String(pick(p, ['account', 'BillRefNumber', 'account_ref', 'billRefNumber']) || '');
    const payer = String(pick(p, ['payer', 'name', 'FirstName', 'customerName']) || '').slice(0, 80);
    await tx(async (c) => {
      const r = await c.query(
        `insert into bank_credits (txn_code, amount, account_ref, payer, source) values ($1,$2,$3,$4,'ipn') on conflict (txn_code) do nothing`,
        [code, amount, account || null, payer || null]);
      saved += r.rowCount;
      const { rows: [o] } = await c.query("select order_id from orders_v2 where txn_code = $1 and payment_status = 'AWAITING_VERIFICATION'", [code]);
      if (o && (await settle(c, o.order_id)).settled) settled++;
    });
  }
  send(res, 200, { ResultCode: 0, ResultDesc: 'Accepted', saved, settled });
});
