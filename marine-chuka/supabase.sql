-- AFROPIANO database (safe to run many times). The server also runs this by itself on start-up.
create table if not exists afr_stock (
  offer_id text primary key,
  total    int  not null,
  claimed  int  not null default 0 check (claimed >= 0)
);
insert into afr_stock (offer_id, total, claimed) values ('couple',10,0),('trio',10,0),('quad',10,0)
on conflict (offer_id) do nothing;

-- One row per order. The order reference (AFR-XXXXXX) is made in the customer's browser, so the payment page opens instantly.
create table if not exists afr_orders (
  order_id       text primary key,
  created_at     timestamptz not null default now(),
  customer_name  text not null,
  kind           text not null,
  item           text not null,
  label          text not null,
  quantity       int  not null,
  admits         int  not null,
  total_amount   int  not null,
  payment_status text not null default 'AWAITING_VERIFICATION',
  access_token   text not null,
  txn_code       text unique,
  code_attempts  int  not null default 0,
  stock_held     boolean not null default false,
  note           text,
  submitted_at   timestamptz,
  paid_at        timestamptz
);
create index if not exists afr_orders_status on afr_orders (payment_status, created_at);

-- Money that really arrived (from the bank/SMS feed or pasted by admin). One row per M-Pesa code.
create table if not exists afr_credits (
  txn_code      text primary key,
  amount        numeric(12,2) not null,
  account_ref   text,
  payer         text,
  received_at   timestamptz not null default now(),
  source        text not null default 'ipn',
  matched_order text unique
);

create sequence if not exists afr_ticket_seq start 1001;
create table if not exists afr_tickets (
  serial        text primary key,
  seq           bigint not null unique default nextval('afr_ticket_seq'),
  order_id      text not null unique,
  issued_at     timestamptz not null default now(),
  holder_name   text not null,
  tier          text not null,
  label         text not null,
  admits        int  not null,
  checked_in_at timestamptz
);

alter table afr_stock    enable row level security;
alter table afr_orders   enable row level security;
alter table afr_credits  enable row level security;
alter table afr_tickets  enable row level security;
