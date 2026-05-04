create table if not exists alpro_records (
  table_name text not null,
  record_id text not null,
  data jsonb not null,
  updated_at timestamptz default now(),
  updated_by text,
  primary key (table_name, record_id)
);

create table if not exists alpro_audit (
  id bigserial primary key,
  action text not null,
  table_name text,
  record_id text,
  actor text,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_alpro_records_table on alpro_records(table_name);
create index if not exists idx_alpro_audit_created on alpro_audit(created_at desc);


-- ===== V11.0 SERVER-SIDE PRICE HISTORY =====
create table if not exists public.metal_price_history (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  symbol text not null,
  price numeric not null,
  unit text,
  source text
);

create index if not exists idx_metal_price_history_symbol_created
on public.metal_price_history (symbol, created_at desc);

alter table public.metal_price_history enable row level security;

drop policy if exists "Allow read metal_price_history" on public.metal_price_history;
create policy "Allow read metal_price_history"
on public.metal_price_history
for select
using (true);

-- Insert işlemi server service role ile yapılacağı için public insert policy açılmadı.
-- Eğer anon ile insert yapılacaksa ayrıca policy gerekir; önerilen server/service role kullanımıdır.


-- ===== V11.1 FINANCE MODULE OPTIONAL TABLES =====
create table if not exists public.finance_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bank text,
  type text,
  party text,
  amount numeric,
  currency text,
  description text,
  tx_date date
);

create table if not exists public.payment_installments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id text,
  stage text,
  percent numeric,
  amount numeric,
  currency text,
  due_date date,
  status text
);

create table if not exists public.reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  party text,
  system_amount numeric,
  paid_amount numeric,
  currency text,
  difference numeric
);

create table if not exists public.tax_calculations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  party text,
  base_amount numeric,
  vat_amount numeric,
  withholding_amount numeric,
  net_payable numeric,
  currency text,
  tax_type text,
  vat_rate numeric,
  withholding_rate numeric
);
