// The server is the only source of truth for prices, offers and where to pay.
// (assets/js/config.js holds a copy for display only; the server never trusts it.)
const OFFER_ENDS = process.env.OFFER_ENDS || '2026-10-03T08:00:00+03:00';

module.exports = {
  EVENT_NAME: 'Afropiano Edition 1',
  OFFER_ENDS,
  STOCK_PER_OFFER: 10,
  MAX_BUNDLES_PER_ORDER: 2,
  MAX_TICKETS_PER_ORDER: 10,
  HOLD_MINUTES: 30,          // unpaid orders hold bundle stock this long
  PAY: { bank: 'Equity Bank', paybill: '247247', account: '1500184456952' },
  TIERS: {
    regular: { name: 'Regular', price: 500 },
    vip:     { name: 'VIP',     price: 1000 },
    vvip:    { name: 'VVIP',    price: 1500 }
  },
  OFFERS: {
    couple: { name: 'Couple',     people: 2, price: 800 },
    trio:   { name: 'Group of 3', people: 3, price: 1200 },
    quad:   { name: 'Group of 4', people: 4, price: 1600 }
  },
  offerLive() { return Date.now() < new Date(OFFER_ENDS).getTime(); }
};
