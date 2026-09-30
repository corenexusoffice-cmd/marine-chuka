# Afropiano Edition 1 Chuka: deploy on Render + Supabase

The site is plain HTML, CSS and JS (folder `public/`). One small Node server (`server.js`) shows the pages and runs the payment code (`api/`). Supabase is only the database. Nothing else to build.

## Deploy (about 10 minutes)

**1. Supabase (database)**
1. Create a project at supabase.com.
2. Click **Connect** at the top, choose **Session pooler**, copy the connection string, put your database password in it. (Do not use "Direct connection": Render cannot reach it.)
3. You do NOT need to run any SQL. The server creates the tables the first time it starts. (If you prefer, you can still paste `supabase.sql` in the SQL Editor.)

**2. GitHub**
Put this whole folder in a new GitHub repository.

**3. Render**
1. Render > **New > Blueprint** > pick the repository. Render reads `render.yaml`.
2. It asks for `DATABASE_URL`: paste the Supabase string. `TICKET_SECRET`, `ADMIN_KEY` and `IPN_SECRET` are generated for you.
3. When it is live, open the service > **Environment**, copy `ADMIN_KEY`. That is your password for `https://YOUR-SITE.onrender.com/admin`.

(Without Blueprint: New > Web Service, Build `npm install`, Start `node server.js`, and add the four variables from `.env.example`.)

**4. Check it works**
- `https://YOUR-SITE.onrender.com/healthz?db=1` must show `{"ok":true,"db":true}`. If `db` is false it prints the reason (usually the wrong connection string).
- Open Render > Logs. You should see `Database ready.` or `Database tables created.`

## Before the event
- Free Render sleeps after 15 minutes without visitors and takes about a minute to wake. Switch to the **Starter** plan (about $7/month) before tickets go on sale, or the first buyer may wait.
- Test one real KES 10 payment with your own phone (change the price temporarily in `api/_lib/catalog.js`), then approve it in /admin and confirm the ticket shows.
- Fill `CONTACT_WHATSAPP` in `public/assets/js/config.js`.

## How payment works
1. Customer picks a ticket, types one name per person, taps **Book your ticket**.
2. Server creates the order (`AFR-XXXXXX`) and works out the price itself. Customer sees the payment screen: **Paybill 247247, Account 1500184456952**, amount and order reference.
3. Customer pays by M-Pesa and enters the transaction code from the SMS.
4. The ticket is only issued when a real payment with that same code and at least that amount is in the `bank_credits` table. Each code works once. Until then the customer sees "confirming" and the page keeps checking.

**How the real payments get into the list.** Paybill 247247 belongs to Equity Bank, so Safaricom's automatic callbacks are not available. Two options:
- **Manual, works today:** open `/admin`, paste your Equity statement lines or the bank SMS messages into "Add received payments". Matching orders are approved instantly. Use "Re-check all waiting" any time.
- **Automatic:** ask Equity for payment notifications (IPN) and point them to `POST https://YOUR-SITE/api/ipn` with header `x-ipn-secret: <IPN_SECRET>`.
- You can also approve or reject any waiting order by hand in `/admin`.

## Prices and offers
Edit `api/_lib/catalog.js` (real values) and keep `public/assets/js/config.js` the same (display only). The offer end can also be set with the `OFFER_ENDS` variable in Render.

## Gate
`/admin` > Gate scanner: paste what the QR scanner reads. It says VALID, CHECKED IN, ALREADY USED or INVALID.
