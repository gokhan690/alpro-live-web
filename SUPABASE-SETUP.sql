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
