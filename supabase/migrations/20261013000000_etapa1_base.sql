-- =============================================================================
-- CONTROLE FÁCIL — Etapa 1: base do aplicativo
--
-- Convenções:
--   * Todo valor monetário é armazenado em CENTAVOS (bigint). Nunca em float.
--   * Toda tabela de dados do usuário tem user_id e RLS habilitado.
--   * Chaves estrangeiras compostas (user_id, id) impedem que um usuário
--     referencie contas/categorias/metas de outro usuário.
--   * Limites de plano são aplicados no banco (triggers), não só na interface.
--   * Funções internas ficam no schema "private", que não é exposto pela API.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Utilitário: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- PLANOS (configuráveis sem alterar código)
-- NULL em um limite significa "ilimitado".
-- -----------------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 500),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_interval text not null default 'month' check (billing_interval in ('none', 'month')),
  max_accounts integer check (max_accounts is null or max_accounts >= 0),
  max_active_budgets integer check (max_active_budgets is null or max_active_budgets >= 0),
  max_active_goals integer check (max_active_goals is null or max_active_goals >= 0),
  ai_analyses_limit integer check (ai_analyses_limit is null or ai_analyses_limit >= 0),
  ai_limit_period text not null default 'month' check (ai_limit_period in ('lifetime', 'month')),
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

alter table public.plans enable row level security;
create policy "Planos ativos são públicos"
  on public.plans for select
  to anon, authenticated
  using (is_active);

-- Valores iniciais definidos pelo proprietário (alteráveis depois no painel admin).
insert into public.plans
  (id, name, description, price_cents, billing_interval, max_accounts, max_active_budgets,
   max_active_goals, ai_analyses_limit, ai_limit_period, features, sort_order)
values
  ('free', 'Controle Fácil Grátis',
   'Organize suas finanças básicas sem pagar nada e sem prazo de expiração.',
   0, 'none', 2, 1, 1, 3, 'lifetime',
   array['dashboard', 'transactions', 'categories', 'basic_charts', 'history', 'goals', 'budgets', 'export_data'],
   1),
  ('pro', 'Controle Fácil Pro',
   'Recursos completos: dívidas, cartões, importação de extratos e assistente com IA.',
   1990, 'month', null, null, null, 20, 'month',
   array['dashboard', 'transactions', 'categories', 'basic_charts', 'history', 'goals', 'budgets', 'export_data',
         'debts', 'debt_simulator', 'credit_cards', 'statement_import', 'auto_categorization', 'ai_assistant',
         'advanced_reports', 'detailed_charts', 'monthly_comparison', 'recurring_detection', 'projections',
         'bill_alerts', 'report_export'],
   2);

-- -----------------------------------------------------------------------------
-- CONFIGURAÇÕES GERAIS (ex.: teste Pro desativado até ser controlado corretamente)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

alter table public.app_settings enable row level security;
create policy "Configurações públicas são legíveis"
  on public.app_settings for select
  to anon, authenticated
  using (is_public);

insert into public.app_settings (key, value, is_public) values
  ('pro_trial', '{"enabled": false, "days": 7, "requires_card": false}'::jsonb, true);

-- -----------------------------------------------------------------------------
-- ASSINATURAS (preenchida somente pelo servidor/webhooks na Etapa 3)
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  provider text not null check (provider in ('mercadopago', 'trial', 'manual')),
  provider_subscription_id text,
  status text not null check (status in ('pending', 'trialing', 'active', 'past_due', 'canceled', 'expired')),
  started_at timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index subscriptions_user_idx on public.subscriptions (user_id);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

alter table public.subscriptions enable row level security;
create policy "Usuário vê as próprias assinaturas"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);
-- Sem políticas de escrita: apenas service_role (servidor) altera assinaturas.

-- Plano efetivo: Pro somente enquanto existir período efetivamente pago/vigente.
create or replace function private.plan_for_user(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.plan_id
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.user_id = p_user
      and s.status in ('trialing', 'active', 'past_due', 'canceled')
      and s.current_period_end is not null
      and s.current_period_end > now()
    order by s.current_period_end desc
    limit 1
  ), 'free');
$$;

revoke all on function private.plan_for_user(uuid) from public;

-- -----------------------------------------------------------------------------
-- PERFIS
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
create policy "Usuário vê o próprio perfil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);
create policy "Usuário atualiza o próprio perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Somente colunas seguras podem ser alteradas pelo usuário.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, onboarding_completed_at) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- CONTAS E CARTEIRAS
-- -----------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null default 'checking'
    check (type in ('checking', 'savings', 'cash', 'digital_wallet', 'investment', 'other')),
  initial_balance_cents bigint not null default 0
    check (initial_balance_cents between -100000000000 and 100000000000),
  color text not null default '#0B2545' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index accounts_user_idx on public.accounts (user_id);
create trigger accounts_updated_at before update on public.accounts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- CATEGORIAS
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'tag' check (icon ~ '^[a-z0-9-]{1,40}$'),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create unique index categories_user_kind_name_uidx
  on public.categories (user_id, kind, lower(btrim(name)));
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- LANÇAMENTOS (receitas e despesas)
-- -----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  kind text not null check (kind in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  occurred_on date not null,
  status text not null default 'paid' check (status in ('paid', 'pending')),
  paid_on date,
  notes text check (char_length(notes) <= 500),
  recurrence_id uuid,
  installment_group_id uuid,
  installment_number smallint,
  installment_total smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete restrict,
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete set null (category_id),
  check (status = 'paid' or paid_on is null),
  check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (installment_group_id is not null and installment_total between 2 and 120
        and installment_number between 1 and installment_total)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_user_status_idx on public.transactions (user_id, status, occurred_on)
  where status = 'pending';
create index transactions_account_idx on public.transactions (account_id);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_recurrence_idx on public.transactions (recurrence_id) where recurrence_id is not null;
create index transactions_installment_idx on public.transactions (installment_group_id)
  where installment_group_id is not null;

create trigger transactions_updated_at before update on public.transactions
  for each row execute function private.set_updated_at();

-- A categoria precisa ser do mesmo tipo do lançamento (receita/despesa).
create or replace function private.check_transaction_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  if new.category_id is not null then
    select c.kind into v_kind from public.categories c
      where c.id = new.category_id and c.user_id = new.user_id;
    if v_kind is distinct from new.kind then
      raise exception using errcode = 'P0001', message = 'CATEGORY_KIND_MISMATCH';
    end if;
  end if;
  if new.status = 'paid' and new.paid_on is null then
    new.paid_on := new.occurred_on;
  end if;
  return new;
end;
$$;

create trigger transactions_check_category before insert or update on public.transactions
  for each row execute function private.check_transaction_category();

-- -----------------------------------------------------------------------------
-- ORÇAMENTOS MENSAIS (category_id NULL = orçamento geral de despesas)
-- -----------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete cascade
);

create unique index budgets_one_active_per_category_uidx
  on public.budgets (user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;
create trigger budgets_updated_at before update on public.budgets
  for each row execute function private.set_updated_at();

create or replace function private.check_budget_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.user_id = new.user_id and c.kind = 'expense'
  ) then
    raise exception using errcode = 'P0001', message = 'BUDGET_CATEGORY_NOT_EXPENSE';
  end if;
  return new;
end;
$$;

create trigger budgets_check_category before insert or update on public.budgets
  for each row execute function private.check_budget_category();

-- -----------------------------------------------------------------------------
-- METAS DE ECONOMIA
-- -----------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null default 'savings'
    check (kind in ('savings', 'emergency', 'travel', 'purchase', 'education', 'other')),
  target_cents bigint not null check (target_cents > 0 and target_cents <= 100000000000),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index goals_user_idx on public.goals (user_id);
create trigger goals_updated_at before update on public.goals
  for each row execute function private.set_updated_at();

create table public.goal_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null,
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000000),
  deposited_on date not null default current_date,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete cascade
);

create index goal_deposits_goal_idx on public.goal_deposits (goal_id);

-- -----------------------------------------------------------------------------
-- RLS: cada usuário acessa somente os próprios registros
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'budgets', 'goals', 'goal_deposits']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Dono seleciona" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Dono insere" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Dono atualiza" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "Dono exclui" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.plans from anon, authenticated;
revoke insert, update, delete on public.app_settings from anon, authenticated;
revoke all on public.profiles from anon;

-- -----------------------------------------------------------------------------
-- LIMITES DE PLANO aplicados no banco.
-- Nunca apagam nem escondem dados existentes: só impedem criar NOVOS itens
-- acima do limite (ex.: após cancelamento do Pro, tudo continua visível).
-- -----------------------------------------------------------------------------
create or replace function private.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_limit integer;
  v_count integer;
  v_resource text;
begin
  -- Serializa verificações concorrentes do mesmo usuário.
  perform pg_advisory_xact_lock(hashtextextended('plan_limits:' || new.user_id::text, 0));

  select p.* into v_plan from public.plans p where p.id = private.plan_for_user(new.user_id);
  if not found then
    select p.* into v_plan from public.plans p where p.id = 'free';
  end if;

  if tg_table_name = 'accounts' then
    if new.archived_at is not null then return new; end if;
    if tg_op = 'UPDATE' and old.archived_at is null then return new; end if;
    v_resource := 'accounts';
    v_limit := v_plan.max_accounts;
    select count(*) into v_count from public.accounts a
      where a.user_id = new.user_id and a.archived_at is null and a.id <> new.id;
  elsif tg_table_name = 'budgets' then
    if not new.is_active then return new; end if;
    if tg_op = 'UPDATE' and old.is_active then return new; end if;
    v_resource := 'budgets';
    v_limit := v_plan.max_active_budgets;
    select count(*) into v_count from public.budgets b
      where b.user_id = new.user_id and b.is_active and b.id <> new.id;
  elsif tg_table_name = 'goals' then
    if new.status <> 'active' then return new; end if;
    if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
    v_resource := 'goals';
    v_limit := v_plan.max_active_goals;
    select count(*) into v_count from public.goals g
      where g.user_id = new.user_id and g.status = 'active' and g.id <> new.id;
  else
    return new;
  end if;

  if v_limit is not null and v_count >= v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_LIMIT:' || v_resource,
      detail = format('Limite do plano %s: %s', v_plan.id, v_limit);
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_plan_limits() from public;

create trigger accounts_plan_limits before insert or update of archived_at on public.accounts
  for each row execute function private.enforce_plan_limits();
create trigger budgets_plan_limits before insert or update of is_active on public.budgets
  for each row execute function private.enforce_plan_limits();
create trigger goals_plan_limits before insert or update of status on public.goals
  for each row execute function private.enforce_plan_limits();

-- -----------------------------------------------------------------------------
-- Direitos do usuário logado (plano + uso), para a interface.
-- -----------------------------------------------------------------------------
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
      'active_goals', (select count(*) from public.goals g where g.user_id = v_uid and g.status = 'active')
    )
  );
end;
$$;

revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;

-- -----------------------------------------------------------------------------
-- NOVO USUÁRIO: cria perfil e categorias padrão (sem lançamentos fictícios).
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), ''));

  insert into public.categories (user_id, name, kind, color, icon, is_default)
  select new.id, c.name, c.kind, c.color, c.icon, true
  from (values
    ('Alimentação',        'expense', '#F97316', 'utensils'),
    ('Mercado',            'expense', '#EA580C', 'shopping-cart'),
    ('Restaurantes',       'expense', '#F59E0B', 'chef-hat'),
    ('Moradia',            'expense', '#0EA5E9', 'house'),
    ('Contas da casa',     'expense', '#0284C7', 'lightbulb'),
    ('Transporte',         'expense', '#6366F1', 'car'),
    ('Saúde',              'expense', '#EF4444', 'heart-pulse'),
    ('Educação',           'expense', '#8B5CF6', 'graduation-cap'),
    ('Lazer',              'expense', '#EC4899', 'gamepad-2'),
    ('Compras',            'expense', '#D946EF', 'shopping-bag'),
    ('Assinaturas',        'expense', '#14B8A6', 'repeat'),
    ('Cuidados pessoais',  'expense', '#F43F5E', 'sparkles'),
    ('Pets',               'expense', '#A16207', 'paw-print'),
    ('Impostos e taxas',   'expense', '#475569', 'landmark'),
    ('Outras despesas',    'expense', '#64748B', 'tag'),
    ('Salário',            'income',  '#16A34A', 'briefcase'),
    ('Renda extra',        'income',  '#22C55E', 'hand-coins'),
    ('Rendimentos',        'income',  '#059669', 'trending-up'),
    ('Reembolsos',         'income',  '#10B981', 'undo-2'),
    ('Outras receitas',    'income',  '#4ADE80', 'tag')
  ) as c(name, kind, color, icon);

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- CONSULTAS DO DASHBOARD (security invoker => RLS continua valendo)
-- -----------------------------------------------------------------------------
create view public.account_balances
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
  (a.initial_balance_cents + coalesce(sum(
    case when t.kind = 'income' then t.amount_cents else -t.amount_cents end
  ) filter (where t.status = 'paid'), 0))::bigint as balance_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id and t.user_id = a.user_id
group by a.id;

revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;

create view public.goal_progress
with (security_invoker = true)
as
select
  g.id,
  g.user_id,
  g.name,
  g.kind,
  g.target_cents,
  g.target_date,
  g.status,
  g.created_at,
  coalesce(sum(d.amount_cents), 0)::bigint as saved_cents,
  count(d.id)::integer as deposits_count
from public.goals g
left join public.goal_deposits d on d.goal_id = g.id and d.user_id = g.user_id
group by g.id;

revoke all on public.goal_progress from anon;
grant select on public.goal_progress to authenticated;

-- Totais por mês (competência = occurred_on).
create or replace function public.monthly_summary(p_from date, p_to date)
returns table (
  month date,
  income_paid_cents bigint,
  expense_paid_cents bigint,
  income_pending_cents bigint,
  expense_pending_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    gs.m::date as month,
    coalesce(sum(t.amount_cents) filter (where t.kind = 'income' and t.status = 'paid'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.kind = 'expense' and t.status = 'paid'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.kind = 'income' and t.status = 'pending'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.kind = 'expense' and t.status = 'pending'), 0)::bigint
  from generate_series(
    date_trunc('month', p_from)::date,
    date_trunc('month', p_to)::date,
    interval '1 month'
  ) as gs(m)
  left join public.transactions t
    on t.user_id = (select auth.uid())
   and t.occurred_on >= gs.m::date
   and t.occurred_on < (gs.m + interval '1 month')::date
  where (p_to - p_from) <= 3700
  group by gs.m
  order by gs.m;
$$;

revoke all on function public.monthly_summary(date, date) from public, anon;
grant execute on function public.monthly_summary(date, date) to authenticated;

-- Gastos por categoria num intervalo (inclui despesas pendentes = comprometido).
create or replace function public.category_totals(p_from date, p_to date, p_kind text default 'expense')
returns table (
  category_id uuid,
  name text,
  color text,
  icon text,
  total_cents bigint,
  paid_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    coalesce(c.name, 'Sem categoria'),
    coalesce(c.color, '#94A3B8'),
    coalesce(c.icon, 'tag'),
    sum(t.amount_cents)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.status = 'paid'), 0)::bigint
  from public.transactions t
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.user_id = (select auth.uid())
    and t.kind = p_kind
    and t.occurred_on between p_from and p_to
  group by c.id, c.name, c.color, c.icon
  order by 5 desc;
$$;

revoke all on function public.category_totals(date, date, text) from public, anon;
grant execute on function public.category_totals(date, date, text) to authenticated;

-- Totais de um período com os mesmos filtros da tela de lançamentos.
create or replace function public.transaction_totals(
  p_from date,
  p_to date,
  p_kind text default null,
  p_status text default null,
  p_account uuid default null,
  p_category uuid default null,
  p_search text default null
)
returns table (
  income_paid_cents bigint,
  expense_paid_cents bigint,
  income_pending_cents bigint,
  expense_pending_cents bigint,
  tx_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(t.amount_cents) filter (where t.kind = 'income' and t.status = 'paid'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.kind = 'expense' and t.status = 'paid'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.kind = 'income' and t.status = 'pending'), 0)::bigint,
    coalesce(sum(t.amount_cents) filter (where t.kind = 'expense' and t.status = 'pending'), 0)::bigint,
    count(*)::bigint
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.occurred_on between p_from and p_to
    and (p_kind is null or t.kind = p_kind)
    and (p_status is null or t.status = p_status)
    and (p_account is null or t.account_id = p_account)
    and (p_category is null or t.category_id = p_category)
    and (p_search is null or t.description ilike '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%');
$$;

revoke all on function public.transaction_totals(date, date, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.transaction_totals(date, date, text, text, uuid, uuid, text) to authenticated;
