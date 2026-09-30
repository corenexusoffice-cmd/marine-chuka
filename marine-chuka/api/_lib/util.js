const crypto = require('crypto');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const rand = (n) => { const b = crypto.randomBytes(n); let s = ''; for (const x of b) s += ALPHA[x % ALPHA.length]; return s; };
const orderRef = () => 'AFR-' + rand(6);
const accessToken = () => crypto.randomBytes(18).toString('base64url');
const secret = () => process.env.TICKET_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('TICKET_SECRET is not set'); })() : 'dev-secret');
const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex').slice(0, 10).toUpperCase();
const qrPayload = (t) => `AFP1|${t.serial}|${t.tier}|${t.admits}|${sign(t.serial + '|' + t.tier + '|' + t.admits)}`;
const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };

function normPhone(v) {
  let d = String(v || '').replace(/[\s\-().]/g, '');
  if (/^\+?254/.test(d)) d = d.replace(/^\+?254/, '0'); else if (/^[71]\d{8}$/.test(d)) d = '0' + d;
  return /^0(7\d{8}|1[01]\d{7})$/.test(d) ? '254' + d.slice(1) : null;
}
const normCode = (v) => String(v || '').toUpperCase().replace(/[\s\-_.]/g, '');
const validCode = (c) => /^[A-Z0-9]{8,20}$/.test(c);

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 100000) throw new Error('too large'); }
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
}
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { if (!e.status) console.error(e); if (e.code === '23505') e = fail(409, 'This transaction code has already been used on another order.'); send(res, e.status || 500, { error: e.status ? e.message : 'Our server could not save this just now. Your payment page is still valid. Try again in a moment.', retry: !e.status }); }
};
const fail = (status, message) => Object.assign(new Error(message), { status });
const ip = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

/* Read pasted lines: "SJK7X2P9QR, 2000" or a full M-Pesa / bank SMS containing a code and "Ksh 2,000.00". */
function parseCredits(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue;
    let code, amount;
    const csv = t.split(/[,;\t]/).map((x) => x.trim());
    if (csv.length >= 2 && validCode(normCode(csv[0])) && Number(csv[1].replace(/,/g, '')) > 0) { code = normCode(csv[0]); amount = Number(csv[1].replace(/,/g, '')); }
    else {
      const m = t.match(/\b([A-Z0-9]{10})\b/) || t.match(/\b([A-Z0-9]{8,20})\b/);
      const a = t.match(/(?:ksh|kes)\.?\s*([\d,]+(?:\.\d+)?)/i);
      if (m && a && /[0-9]/.test(m[1]) && /[A-Z]/.test(m[1])) { code = m[1]; amount = Number(a[1].replace(/,/g, '')); }
    }
    if (code && amount > 0) out.push({ code, amount, payer: t.length > 60 ? null : t });
  }
  return out;
}

module.exports = { parseCredits, orderRef, accessToken, sign, qrPayload, same, normPhone, normCode, validCode, send, readBody, wrap, fail, ip, rand };
