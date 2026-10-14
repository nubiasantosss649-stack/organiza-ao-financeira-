-- =============================================================================
-- CONTROLE FÁCIL — Etapa 2: recursos Pro
--   * Cartões de crédito, faturas e pagamentos (sem contar gasto em dobro)
--   * Organizador de dívidas e pagamentos
--   * Importação de extratos (CSV/OFX) com detecção de duplicatas
--   * Uso do assistente de IA com limites por plano
--   * Recursos Pro protegidos no banco (RLS + triggers)
--
-- Regra geral de permissões: criar/alterar itens Pro exige o recurso no plano;
-- LER e EXCLUIR dados próprios é sempre permitido (nunca bloqueamos o acesso a
-- informações já cadastradas, inclusive após o fim da assinatura).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Verificação de recurso do plano
-- -----------------------------------------------------------------------------
create or replace function private.has_feature(p_user uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plans p
    where p.id = private.plan_for_user(p_user)
      and p_feature = any (p.features)
  );
$$;
revoke all on function private.has_feature(uuid, text) from public;

-- Versão para políticas RLS: só consulta o próprio usuário logado.
create or replace function private.i_have_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_feature(auth.uid(), p_feature);
$$;
revoke all on function private.i_have_feature(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.i_have_feature(text) to authenticated;

-- -----------------------------------------------------------------------------
-- CARTÕES DE CRÉDITO
-- -----------------------------------------------------------------------------
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  limit_cents bigint not null check (limit_cents > 0 and limit_cents <= 100000000000),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  color text not null default '#0B2545' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create index credit_cards_user_idx on public.credit_cards (user_id);
create trigger credit_cards_updated_at before update on public.credit_cards
  for each row execute function private.set_updated_at();

/**
 * Vencimento da fatura em que cai uma compra.
 * Compras feitas ANTES do dia de fechamento entram na fatura que fecha naquele
 * mês; compras no dia do fechamento ou depois vão para a fatura seguinte.
 * Se o vencimento é maior que o fechamento, vence no mesmo mês do fechamento;
 * senão, no mês seguinte. Dias inexistentes (ex.: 31/02) usam o último dia do mês.
 */
create or replace function private.card_invoice_due(p_closing int, p_due int, p_date date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_date)::date;
  v_closing date;
  v_close_month date;
  v_due_month date;
begin
  v_closing := v_month + (least(p_closing, extract(day from (v_month + interval '1 month - 1 day'))::int) - 1);
  v_close_month := case when p_date < v_closing then v_month else (v_month + interval '1 month')::date end;
  v_due_month := case when p_due > p_closing then v_close_month else (v_close_month + interval '1 month')::date end;
  return v_due_month + (least(p_due, extract(day from (v_due_month + interval '1 month - 1 day'))::int) - 1);
end;
$$;

-- Pagamentos de fatura: saem de uma conta, mas NÃO são despesa (a despesa é a compra).
create table public.card_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null,
  invoice_due_on date not null,
  account_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  paid_on date not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, card_id) references public.credit_cards (user_id, id) on delete cascade,
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete restrict
);
create index card_invoice_payments_card_idx on public.card_invoice_payments (card_id, invoice_due_on);
create index card_invoice_payments_account_idx on public.card_invoice_payments (account_id);

-- -----------------------------------------------------------------------------
-- IMPORTAÇÕES DE EXTRATO
-- -----------------------------------------------------------------------------
create table public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  format text not null check (format in ('csv', 'ofx')),
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete restrict
);
create index statement_imports_user_idx on public.statement_imports (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- LANÇAMENTOS: compras no cartão e importações
-- -----------------------------------------------------------------------------
alter table public.transactions alter column account_id drop not null;
alter table public.transactions
  add column card_id uuid,
  add column invoice_due_on date,
  add column import_id uuid,
  add column import_hash text check (import_hash is null or import_hash ~ '^[0-9a-f]{64}$'),
  add constraint transactions_card_fk foreign key (user_id, card_id)
    references public.credit_cards (user_id, id) on delete restrict,
  add constraint transactions_import_fk foreign key (user_id, import_id)
    references public.statement_imports (user_id, id) on delete cascade,
  -- Todo lançamento sai de UMA origem: conta OU cartão.
  add constraint transactions_one_source check ((account_id is null) <> (card_id is null)),
  add constraint transactions_card_is_expense check (card_id is null or kind = 'expense'),
  add constraint transactions_invoice_only_card check ((card_id is null) = (invoice_due_on is null));

-- Impede importar duas vezes a mesma linha (NULLs não conflitam entre si).
alter table public.transactions add constraint transactions_import_hash_unique unique (user_id, import_hash);

create index transactions_card_invoice_idx on public.transactions (card_id, invoice_due_on) where card_id is not null;
create index transactions_import_idx on public.transactions (import_id) where import_id is not null;

create or replace function private.prepare_card_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.credit_cards;
begin
  if new.card_id is null then
    new.invoice_due_on := null;
    return new;
  end if;

  if tg_op = 'INSERT' or new.card_id is distinct from old.card_id then
    if not private.has_feature(new.user_id, 'credit_cards') then
      raise exception using errcode = 'P0001', message = 'FEATURE_REQUIRED:credit_cards';
    end if;
  end if;

  select c.* into v_card from public.credit_cards c where c.id = new.card_id and c.user_id = new.user_id;
  if not found then
    raise exception using errcode = '23503', message = 'CARD_NOT_FOUND';
  end if;

  -- Compra no cartão é despesa reconhecida na data da compra; o dinheiro sai da
  -- conta somente quando a fatura é paga (card_invoice_payments).
  new.status := 'paid';
  new.paid_on := new.occurred_on;
  new.invoice_due_on := private.card_invoice_due(v_card.closing_day, v_card.due_day, new.occurred_on);
  return new;
end;
$$;
revoke all on function private.prepare_card_transaction() from public;

create trigger transactions_prepare_card before insert or update on public.transactions
  for each row execute function private.prepare_card_transaction();

-- Recalcula as faturas se o fechamento/vencimento do cartão mudar.
create or replace function private.recompute_card_invoices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.closing_day <> old.closing_day or new.due_day <> old.due_day then
    update public.transactions t
       set invoice_due_on = private.card_invoice_due(new.closing_day, new.due_day, t.occurred_on)
     where t.card_id = new.id and t.user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function private.recompute_card_invoices() from public;
create trigger credit_cards_recompute after update of closing_day, due_day on public.credit_cards
  for each row execute function private.recompute_card_invoices();

-- -----------------------------------------------------------------------------
-- DÍVIDAS
-- -----------------------------------------------------------------------------
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  creditor text check (char_length(creditor) <= 60),
  kind text not null default 'loan'
    check (kind in ('loan', 'credit_card', 'overdraft', 'financing', 'personal', 'other')),
  -- Saldo devedor informado pelo usuário na data de referência.
  balance_cents bigint not null check (balance_cents > 0 and balance_cents <= 100000000000),
  balance_date date not null,
  -- Juros mensais em pontos-base: 1% a.m. = 100; 2,99% a.m. = 299.
  monthly_rate_bp integer not null default 0 check (monthly_rate_bp between 0 and 100000),
  installment_cents bigint check (installment_cents is null or (installment_cents > 0 and installment_cents <= 100000000000)),
  installments_total smallint check (installments_total is null or installments_total between 1 and 600),
  due_day smallint check (due_day is null or due_day between 1 and 31),
  status text not null default 'active' check (status in ('active', 'paid', 'archived')),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create index debts_user_idx on public.debts (user_id);
create trigger debts_updated_at before update on public.debts
  for each row execute function private.set_updated_at();

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  paid_on date not null,
  note text check (char_length(note) <= 200),
  -- Lançamento de despesa gerado junto (opcional), para não registrar em dobro.
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (user_id, debt_id) references public.debts (user_id, id) on delete cascade
);
create index debt_payments_debt_idx on public.debt_payments (debt_id, paid_on);

-- Saldo restante: saldo informado − pagamentos a partir da data de referência.
create view public.debt_summaries
with (security_invoker = true)
as
select
  d.*,
  coalesce((select sum(p.amount_cents) from public.debt_payments p
             where p.debt_id = d.id and p.user_id = d.user_id and p.paid_on >= d.balance_date), 0)::bigint as paid_since_cents,
  greatest(0, d.balance_cents - coalesce((select sum(p.amount_cents) from public.debt_payments p
             where p.debt_id = d.id and p.user_id = d.user_id and p.paid_on >= d.balance_date), 0))::bigint as remaining_cents,
  (select count(*) from public.debt_payments p where p.debt_id = d.id and p.user_id = d.user_id)::integer as payments_count
from public.debts d;

-- -----------------------------------------------------------------------------
-- Saldos: pagamentos de fatura reduzem a conta (sem virar despesa).
-- -----------------------------------------------------------------------------
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.color,
  a.archived_at,
  a.initial_balance_cents,
  (a.initial_balance_cents
    + coalesce((select sum(case when t.kind = 'income' then t.amount_cents else -t.amount_cents end)
                  from public.transactions t
                 where t.account_id = a.id and t.user_id = a.user_id and t.status = 'paid'), 0)
    - coalesce((select sum(p.amount_cents) from public.card_invoice_payments p
                 where p.account_id = a.id and p.user_id = a.user_id), 0))::bigint as balance_cents
from public.accounts a;

-- Limite usado = compras no cartão (inclusive parcelas futuras) − faturas pagas.
create view public.card_summaries
with (security_invoker = true)
as
select
  c.id, c.user_id, c.name, c.limit_cents, c.closing_day, c.due_day, c.color, c.archived_at, c.created_at,
  greatest(0,
    coalesce((select sum(t.amount_cents) from public.transactions t where t.card_id = c.id and t.user_id = c.user_id), 0)
    - coalesce((select sum(p.amount_cents) from public.card_invoice_payments p where p.card_id = c.id and p.user_id = c.user_id), 0)
  )::bigint as used_cents
from public.credit_cards c;

-- Faturas de um cartão (agrupadas pelo vencimento).
create or replace function public.card_invoices(p_card uuid)
returns table (invoice_due_on date, total_cents bigint, paid_cents bigint, purchases integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with purchases as (
    select t.invoice_due_on as due, sum(t.amount_cents)::bigint as total, count(*)::integer as n
      from public.transactions t
     where t.card_id = p_card and t.user_id = (select auth.uid())
     group by t.invoice_due_on
  ), payments as (
    select p.invoice_due_on as due, sum(p.amount_cents)::bigint as paid
      from public.card_invoice_payments p
     where p.card_id = p_card and p.user_id = (select auth.uid())
     group by p.invoice_due_on
  )
  select coalesce(pu.due, pa.due), coalesce(pu.total, 0), coalesce(pa.paid, 0), coalesce(pu.n, 0)
    from purchases pu full outer join payments pa on pa.due = pu.due
   order by 1;
$$;

-- Faturas em aberto de todos os cartões até uma data (para "contas a pagar").
create or replace function public.open_card_invoices(p_until date)
returns table (card_id uuid, card_name text, invoice_due_on date, remaining_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with purchases as (
    select t.card_id, t.invoice_due_on as due, sum(t.amount_cents)::bigint as total
      from public.transactions t
     where t.user_id = (select auth.uid()) and t.card_id is not null and t.invoice_due_on <= p_until
     group by t.card_id, t.invoice_due_on
  ), payments as (
    select p.card_id, p.invoice_due_on as due, sum(p.amount_cents)::bigint as paid
      from public.card_invoice_payments p
     where p.user_id = (select auth.uid()) and p.invoice_due_on <= p_until
     group by p.card_id, p.invoice_due_on
  )
  select pu.card_id, c.name, pu.due, (pu.total - coalesce(pa.paid, 0))::bigint
    from purchases pu
    join public.credit_cards c on c.id = pu.card_id
    left join payments pa on pa.card_id = pu.card_id and pa.due = pu.due
   where pu.total - coalesce(pa.paid, 0) > 0
   order by pu.due;
$$;

-- -----------------------------------------------------------------------------
-- ASSISTENTE DE IA: consentimento e uso (sem armazenar perguntas/respostas)
-- -----------------------------------------------------------------------------
alter table public.profiles add column ai_consent_at timestamptz;
grant update (ai_consent_at) on public.profiles to authenticated;

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preset', 'chat')),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'failed')),
  model text check (char_length(model) <= 80),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  -- Custo estimado em milionésimos de dólar (US$ 1 = 1.000.000).
  cost_micro_usd bigint check (cost_micro_usd >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy "Usuário vê o próprio uso de IA" on public.ai_usage
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.ai_usage from anon;
revoke insert, update, delete on public.ai_usage from authenticated;

-- Reserva 1 análise antes de chamar o provedor. Reservas sem conclusão em 10 min
-- deixam de contar (ex.: falha do servidor).
create or replace function public.ai_reserve(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans;
  v_since timestamptz;
  v_used integer;
  v_id bigint;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;
  if p_kind not in ('preset', 'chat') then
    raise exception using errcode = '22023', message = 'INVALID_KIND';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and ai_consent_at is not null) then
    raise exception using errcode = 'P0001', message = 'AI_CONSENT_REQUIRED';
  end if;
  if p_kind = 'chat' and not private.has_feature(v_uid, 'ai_assistant') then
    raise exception using errcode = 'P0001', message = 'FEATURE_REQUIRED:ai_assistant';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || v_uid::text, 0));
  select p.* into v_plan from public.plans p where p.id = private.plan_for_user(v_uid);

  v_since := case when v_plan.ai_limit_period = 'month'
                  then date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
                  else '-infinity'::timestamptz end;

  select count(*) into v_used from public.ai_usage u
   where u.user_id = v_uid and u.created_at >= v_since
     and (u.status = 'completed' or (u.status = 'reserved' and u.created_at > now() - interval '10 minutes'));

  if v_plan.ai_analyses_limit is not null and v_used >= v_plan.ai_analyses_limit then
    raise exception using errcode = 'P0001', message = 'AI_LIMIT_REACHED';
  end if;

  insert into public.ai_usage (user_id, kind) values (v_uid, p_kind) returning id into v_id;
  return jsonb_build_object(
    'usage_id', v_id,
    'used', v_used + 1,
    'limit', v_plan.ai_analyses_limit,
    'period', v_plan.ai_limit_period
  );
end;
$$;
revoke all on function public.ai_reserve(text) from public, anon;
grant execute on function public.ai_reserve(text) to authenticated;

-- Conclusão da reserva: SOMENTE o servidor (service_role) chama, para que o
-- usuário não consiga "estornar" uma análise já entregue.
create or replace function public.ai_finish(
  p_usage_id bigint, p_success boolean, p_model text, p_input_tokens integer, p_output_tokens integer, p_cost_micro_usd bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
     set status = case when p_success then 'completed' else 'failed' end,
         model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
         cost_micro_usd = p_cost_micro_usd, finished_at = now()
   where id = p_usage_id and status = 'reserved';
$$;
revoke all on function public.ai_finish(bigint, boolean, text, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.ai_finish(bigint, boolean, text, integer, integer, bigint) to service_role;

-- Uso no período atual (para a interface).
create or replace function public.my_ai_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans;
  v_since timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;
  select p.* into v_plan from public.plans p where p.id = private.plan_for_user(v_uid);
  v_since := case when v_plan.ai_limit_period = 'month'
                  then date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
                  else '-infinity'::timestamptz end;
  return jsonb_build_object(
    'used', (select count(*) from public.ai_usage u where u.user_id = v_uid and u.created_at >= v_since
              and (u.status = 'completed' or (u.status = 'reserved' and u.created_at > now() - interval '10 minutes'))),
    'limit', v_plan.ai_analyses_limit,
    'period', v_plan.ai_limit_period,
    'consented', exists (select 1 from public.profiles where id = v_uid and ai_consent_at is not null)
  );
end;
$$;
revoke all on function public.my_ai_usage() from public, anon;
grant execute on function public.my_ai_usage() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS das novas tabelas
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  gated record;
begin
  -- Tabelas cujo cadastro/alteração exige recurso Pro.
  for gated in
    select * from (values
      ('credit_cards', 'credit_cards'),
      ('debts', 'debts'),
      ('statement_imports', 'statement_import')
    ) as v(tbl, feature)
  loop
    execute format('alter table public.%I enable row level security', gated.tbl);
    execute format('revoke all on public.%I from anon', gated.tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', gated.tbl);
    execute format('create policy "Dono seleciona" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', gated.tbl);
    execute format('create policy "Dono com recurso insere" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and private.i_have_feature(%L))', gated.tbl, gated.feature);
    execute format('create policy "Dono com recurso atualiza" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and private.i_have_feature(%L))', gated.tbl, gated.feature);
    execute format('create policy "Dono exclui" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', gated.tbl);
  end loop;

  -- Registros de movimentação de itens já existentes (pagar fatura, pagar dívida):
  -- permitidos mesmo após o fim do Pro, para manter saldos corretos.
  foreach t in array array['card_invoice_payments', 'debt_payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "Dono seleciona" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "Dono insere" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Dono atualiza" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Dono exclui" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

revoke all on public.debt_summaries, public.card_summaries from anon;
grant select on public.debt_summaries, public.card_summaries, public.account_balances to authenticated;

revoke all on function public.card_invoices(uuid) from public, anon;
grant execute on function public.card_invoices(uuid) to authenticated;
revoke all on function public.open_card_invoices(date) from public, anon;
grant execute on function public.open_card_invoices(date) to authenticated;

-- Direitos do usuário passam a incluir o uso de recursos Pro.
create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.plans;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;

  select p.* into v_plan from public.plans p where p.id = private.plan_for_user(v_uid);

  return jsonb_build_object(
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'price_cents', v_plan.price_cents,
    'features', to_jsonb(v_plan.features),
    'limits', jsonb_build_object(
      'accounts', v_plan.max_accounts,
      'active_budgets', v_plan.max_active_budgets,
      'active_goals', v_plan.max_active_goals,
      'ai_analyses', v_plan.ai_analyses_limit,
      'ai_limit_period', v_plan.ai_limit_period
    ),
    'usage', jsonb_build_object(
      'accounts', (select count(*) from public.accounts a where a.user_id = v_uid and a.archived_at is null),
      'active_budgets', (select count(*) from public.budgets b where b.user_id = v_uid and b.is_active),
      'active_goals', (select count(*) from public.goals g where g.user_id = v_uid and g.status = 'active'),
      'cards', (select count(*) from public.credit_cards c where c.user_id = v_uid),
      'debts', (select count(*) from public.debts d where d.user_id = v_uid)
    )
  );
end;
$$;
