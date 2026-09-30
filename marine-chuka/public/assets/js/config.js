/* ------------------------------------------------------------------
   AFROPIANO: display settings for the browser.
   PRICES, OFFERS AND THE OFFER END DATE ARE SET ON THE SERVER in api/_lib/catalog.js
   (the page loads them from /api/catalog). Keep this copy the same, it is only a fallback for display.
------------------------------------------------------------------- */
window.AF = {
  EVENT_NAME: "Afropiano Edition 1",
  EVENT_DATE_LABEL: "03 OCT 2026",
  VENUE: "Marine Park Resort",

  TIERS: {
    regular: { name: "Regular", tagline: "Good vibes. All night.",    price: 500,  perks: ["General entry", "Full night access", "The full Afropiano experience"] },
    vip:     { name: "VIP",     tagline: "Closer to the action.",     price: 1000, perks: ["Priority access", "Closer to the stage", "Better spot for the night"] },
    vvip:    { name: "VVIP",    tagline: "The night, elevated.",      price: 1500, perks: ["Premium experience", "Exclusive vibes", "The best side of Afropiano"] }
  },
  OFFER_ENDS: "2026-10-03T08:00:00+03:00",
  STOCK_PER_OFFER: 10,
  MAX_BUNDLES_PER_ORDER: 2,
  MAX_TICKETS_PER_ORDER: 10,
  OFFERS: [
    { id: "couple", name: "Couple",     people: 2, price: 800  },
    { id: "trio",   name: "Group of 3", people: 3, price: 1200 },
    { id: "quad",   name: "Group of 4", people: 4, price: 1600 }
  ],
  PAY: { bank: "Equity Bank", paybill: "247247", account: "1500184456952" },

  CONTACT_EMAIL: "",           // shown in the footer if set
  CONTACT_WHATSAPP: ""         // e.g. "254712345678"
};
