-- AFROPIANO: run this whole file once in Supabase > SQL Editor.
-- The browser never talks to the database. Only the /api functions do, using DATABASE_URL.
-- Row Level Security is ON with no policies, so the public anon key can read and write nothing.

create table if not exists offer_stock (
  offer_id text primary key,
  total    int  not null,
  claimed  int  not null default 0 check (claimed >= 0 and claimed <= total)
);
insert into offer_stock (offer_id, total, claimed) values
  ('couple', 10, 0), ('trio', 10, 0), ('quad', 10, 0)
on conflict (offer_id) do nothing;

-- Orders. Only the server ever sets payment_status to PAID.
create table if not exists orders_v2 (
  order_id       text primary key,                         -- AFR-8K4X2P
  created_at     timestamptz not null default now(),
  customer_name  text not null,
  phone          text not null,
  kind           text not null check (kind in ('tier','bundle')),
  item           text not null,                            -- regular | vip | vvip | couple | trio | quad
  label          text not null,
  quantity       int  not null check (quantity > 0),
  admits         int  not null check (admits > 0),
  total_amount   int  not null check (total_amount > 0),
  payment_status text not null default 'PENDING'
                 check (payment_status in ('PENDING','AWAITING_VERIFICATION','PAID','REJECTED')),
  access_token   text not null,                            -- secret the customer's browser keeps
  txn_code       text unique,                              -- one code can only ever belong to one order
  code_attempts  int  not null default 0,
  stock_held     boolean not null default false,
  note           text,
  submitted_at   timestamptz,
  paid_at        timestamptz
);
create index if not exists orders_v2_status on orders_v2 (payment_status, created_at);
create index if not exists orders_v2_phone  on orders_v2 (phone, created_at);

-- Money that really arrived on paybill 247247 / account 1500184456952.
-- Filled by /api/ipn (bank or M-Pesa feed) or by the admin page. One row per transaction code.
create table if not exists bank_credits (
  txn_code    text primary key,
  amount      numeric(12,2) not null check (amount > 0),
  account_ref text,
  payer       text,
  received_at timestamptz not null default now(),
  source      text not null default 'ipn',
  matched_order text unique references orders_v2(order_id)
);

-- Tickets. serial comes from a sequence, so a number is never issued twice, even after deletes.
create sequence if not exists ticket_seq start 1001;
create table if not exists tickets (
  serial       text primary key,                           -- AFP-001001-K7Q
  seq          bigint not null unique default nextval('ticket_seq'),
  order_id     text not null unique references orders_v2(order_id),
  issued_at    timestamptz not null default now(),
  holder_name  text not null,
  tier         text not null,
  label        text not null,
  admits       int  not null,
  checked_in_at timestamptz
);

alter table offer_stock  enable row level security;
alter table orders_v2    enable row level security;
alter table bank_credits enable row level security;
alter table tickets      enable row level security;

-- Only on Supabase (the anon / authenticated roles exist there): make sure the public key can touch nothing.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on offer_stock, orders_v2, bank_credits, tickets from anon, authenticated';
    execute 'revoke all on sequence ticket_seq from anon, authenticated';
  end if;
end $$;
