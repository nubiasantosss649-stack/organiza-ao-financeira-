-- =============================================================================
-- CONTROLE FÁCIL — Etapa 3: assinaturas, cobranças, webhooks e painel admin
--
-- Princípios:
--   * O Pro só é liberado por um PAGAMENTO APROVADO confirmado no servidor
--     (webhook validado + consulta ao provedor), nunca pelo retorno do checkout.
--   * Toda escrita de cobrança é feita pelo servidor (service_role), de forma
--     idempotente: notificações repetidas não duplicam efeitos.
--   * Cancelar mantém o acesso até o fim do período pago; depois a conta volta
--     ao Grátis sem excluir dados.
--   * Administradores veem apenas números agregados, nunca os dados
--     financeiros privados dos clientes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assinaturas: novos campos e status
-- -----------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired'));

alter table public.subscriptions
  add column price_cents integer check (price_cents is null or price_cents >= 0),
  add column provider_status text check (char_length(provider_status) <= 40),
  add column next_charge_at timestamptz,
  add column last_payment_at timestamptz,
  add column promotion_id uuid;

-- Uma assinatura "em andamento" por usuário (evita checkout duplo).
create unique index subscriptions_one_open_per_user
  on public.subscriptions (user_id)
  where status in ('pending', 'active', 'past_due', 'paused');

-- Plano efetivo: período vigente em qualquer status que não seja "pendente".
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
      and s.status in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'expired')
      and s.current_period_end is not null
      and s.current_period_end > now()
    order by s.current_period_end desc
    limit 1
  ), 'free');
$$;

-- -----------------------------------------------------------------------------
-- Histórico de alterações da assinatura
-- -----------------------------------------------------------------------------
create table public.subscription_events (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'checkout_started', 'status_changed', 'payment_approved', 'payment_rejected', 'payment_refunded',
    'cancel_requested', 'reactivated', 'trial_started', 'period_extended'
  )),
  from_status text,
  to_status text,
  -- Somente metadados não sensíveis (ids do provedor, valores da assinatura).
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index subscription_events_sub_idx on public.subscription_events (subscription_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Histórico de cobranças
-- -----------------------------------------------------------------------------
create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  provider text not null,
  provider_payment_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null check (status in ('approved', 'rejected', 'pending', 'refunded', 'cancelled')),
  status_detail text check (char_length(status_detail) <= 80),
  paid_at timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index billing_payments_user_idx on public.billing_payments (user_id, created_at desc);
create trigger billing_payments_updated_at before update on public.billing_payments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Notificações recebidas (idempotência e logs operacionais, sem dados sensíveis)
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  request_id text not null check (char_length(request_id) <= 120),
  topic text check (char_length(topic) <= 60),
  resource_id text check (char_length(resource_id) <= 120),
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed', 'invalid_signature')),
  error text check (char_length(error) <= 200),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, request_id)
);
create index webhook_events_received_idx on public.webhook_events (received_at desc);

-- -----------------------------------------------------------------------------
-- Promoções (ofertas com prazo real)
-- -----------------------------------------------------------------------------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 300),
  plan_id text not null references public.plans(id),
  price_cents integer not null check (price_cents >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.subscriptions
  add constraint subscriptions_promotion_fk foreign key (promotion_id) references public.promotions(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Administradores e auditoria
-- -----------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) <= 60),
  target text check (char_length(target) <= 120),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.subscription_events enable row level security;
create policy "Usuário vê o histórico da própria assinatura" on public.subscription_events
  for select to authenticated using ((select auth.uid()) = user_id);

alter table public.billing_payments enable row level security;
create policy "Usuário vê as próprias cobranças" on public.billing_payments
  for select to authenticated using ((select auth.uid()) = user_id);

alter table public.promotions enable row level security;
create policy "Promoções vigentes são públicas" on public.promotions
  for select to anon, authenticated using (is_active and now() between starts_at and ends_at);

-- Sem políticas: somente service_role/funções de admin acessam.
alter table public.webhook_events enable row level security;
alter table public.admins enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.subscription_events, public.billing_payments from anon;
revoke insert, update, delete on public.subscription_events, public.billing_payments from authenticated;
revoke insert, update, delete on public.promotions from anon, authenticated;
revoke all on public.webhook_events, public.admins, public.admin_audit_log from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Preço vigente (promoção com prazo real ou preço do plano)
-- -----------------------------------------------------------------------------
create or replace function public.current_price(p_plan text default 'pro')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('price_cents', pr.price_cents, 'promotion_id', pr.id, 'promotion_name', pr.name,
                               'ends_at', pr.ends_at, 'regular_price_cents', p.price_cents)
       from public.promotions pr join public.plans p on p.id = pr.plan_id
      where pr.plan_id = p_plan and pr.is_active and now() between pr.starts_at and pr.ends_at
      order by pr.price_cents asc limit 1),
    (select jsonb_build_object('price_cents', p.price_cents, 'promotion_id', null, 'promotion_name', null,
                               'ends_at', null, 'regular_price_cents', p.price_cents)
       from public.plans p where p.id = p_plan)
  );
$$;
grant execute on function public.current_price(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- TESTE PRO (sem cartão, sem cobrança automática; só se habilitado no admin)
-- -----------------------------------------------------------------------------
create or replace function public.start_pro_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg jsonb;
  v_days int;
  v_sub uuid;
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;
  select value into v_cfg from public.app_settings where key = 'pro_trial';
  if coalesce((v_cfg ->> 'enabled')::boolean, false) is not true then
    raise exception using errcode = 'P0001', message = 'TRIAL_DISABLED';
  end if;
  v_days := least(greatest(coalesce((v_cfg ->> 'days')::int, 7), 1), 30);

  perform pg_advisory_xact_lock(hashtextextended('subscription:' || v_uid::text, 0));
  -- Um teste por pessoa, e nunca para quem já assinou.
  if exists (select 1 from public.subscriptions s where s.user_id = v_uid and (s.provider = 'trial' or s.status <> 'pending')) then
    raise exception using errcode = 'P0001', message = 'TRIAL_NOT_ELIGIBLE';
  end if;

  v_end := now() + make_interval(days => v_days);
  insert into public.subscriptions (user_id, plan_id, provider, status, started_at, current_period_end, price_cents)
  values (v_uid, 'pro', 'trial', 'trialing', now(), v_end, 0)
  returning id into v_sub;
  insert into public.subscription_events (subscription_id, user_id, event_type, to_status, details)
  values (v_sub, v_uid, 'trial_started', 'trialing', jsonb_build_object('days', v_days));
  return jsonb_build_object('ends_at', v_end, 'days', v_days);
end;
$$;
revoke all on function public.start_pro_trial() from public, anon;
grant execute on function public.start_pro_trial() to authenticated;

-- -----------------------------------------------------------------------------
-- FUNÇÕES DE COBRANÇA (somente service_role, chamadas pelo servidor)
-- -----------------------------------------------------------------------------

-- Registra uma assinatura recém-criada no provedor (checkout iniciado).
create or replace function public.billing_register_checkout(
  p_user uuid, p_provider text, p_provider_subscription_id text, p_price_cents integer, p_promotion_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || p_user::text, 0));
  -- Checkout pendente anterior é substituído (o usuário pode ter desistido).
  update public.subscriptions set status = 'expired', provider_status = 'abandoned'
   where user_id = p_user and status = 'pending';
  insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, price_cents, promotion_id)
  values (p_user, 'pro', p_provider, p_provider_subscription_id, 'pending', p_price_cents, p_promotion_id)
  returning id into v_sub;
  insert into public.subscription_events (subscription_id, user_id, event_type, to_status, details)
  values (v_sub, p_user, 'checkout_started', 'pending', jsonb_build_object('price_cents', p_price_cents));
  return v_sub;
end;
$$;

-- Aplica o status da assinatura consultado NO PROVEDOR. Idempotente.
-- Não libera acesso por si só: o acesso vem de billing_record_payment.
create or replace function public.billing_apply_subscription_status(
  p_provider text, p_provider_subscription_id text, p_status text, p_provider_status text, p_next_charge_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  if p_status not in ('pending', 'active', 'past_due', 'paused', 'canceled') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;
  select * into v_sub from public.subscriptions
   where provider = p_provider and provider_subscription_id = p_provider_subscription_id
   for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'unknown_subscription');
  end if;

  if v_sub.status = p_status and v_sub.provider_status is not distinct from p_provider_status
     and v_sub.next_charge_at is not distinct from p_next_charge_at then
    return jsonb_build_object('applied', false, 'reason', 'unchanged');
  end if;

  update public.subscriptions
     set status = p_status,
         provider_status = p_provider_status,
         next_charge_at = p_next_charge_at,
         started_at = coalesce(started_at, case when p_status = 'active' then now() end),
         canceled_at = case when p_status = 'canceled' then coalesce(canceled_at, now()) else null end
   where id = v_sub.id;

  if v_sub.status is distinct from p_status then
    insert into public.subscription_events (subscription_id, user_id, event_type, from_status, to_status, details)
    values (v_sub.id, v_sub.user_id,
            case when p_status = 'active' and v_sub.status in ('canceled', 'paused') then 'reactivated' else 'status_changed' end,
            v_sub.status, p_status, jsonb_build_object('provider_status', p_provider_status));
  end if;
  return jsonb_build_object('applied', true, 'user_id', v_sub.user_id);
end;
$$;

-- Registra uma cobrança consultada NO PROVEDOR. Idempotente por id do pagamento.
-- Pagamento aprovado estende o acesso até o fim do período pago.
create or replace function public.billing_record_payment(
  p_provider text, p_provider_subscription_id text, p_provider_payment_id text, p_amount_cents integer,
  p_status text, p_status_detail text, p_paid_at timestamptz, p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_prev public.billing_payments;
  v_period_end timestamptz;
begin
  if p_status not in ('approved', 'rejected', 'pending', 'refunded', 'cancelled') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;
  select * into v_sub from public.subscriptions
   where provider = p_provider and provider_subscription_id = p_provider_subscription_id
   for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'unknown_subscription');
  end if;

  select * into v_prev from public.billing_payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if found and v_prev.status = p_status then
    return jsonb_build_object('applied', false, 'reason', 'duplicate');
  end if;

  v_period_end := case when p_status = 'approved'
                       then coalesce(p_period_end, coalesce(p_paid_at, now()) + interval '1 month')
                       else null end;

  insert into public.billing_payments (user_id, subscription_id, provider, provider_payment_id, amount_cents, status, status_detail, paid_at, period_end)
  values (v_sub.user_id, v_sub.id, p_provider, p_provider_payment_id, p_amount_cents, p_status, p_status_detail,
          case when p_status = 'approved' then coalesce(p_paid_at, now()) end, v_period_end)
  on conflict (provider, provider_payment_id) do update
     set status = excluded.status, status_detail = excluded.status_detail,
         paid_at = coalesce(public.billing_payments.paid_at, excluded.paid_at),
         period_end = coalesce(excluded.period_end, public.billing_payments.period_end);

  if p_status = 'approved' then
    update public.subscriptions
       set status = case when status in ('pending', 'past_due') then 'active' else status end,
           started_at = coalesce(started_at, now()),
           last_payment_at = coalesce(p_paid_at, now()),
           current_period_end = greatest(coalesce(current_period_end, '-infinity'::timestamptz), v_period_end)
     where id = v_sub.id;
    insert into public.subscription_events (subscription_id, user_id, event_type, from_status, to_status, details)
    values (v_sub.id, v_sub.user_id, 'payment_approved', v_sub.status,
            case when v_sub.status in ('pending', 'past_due') then 'active' else v_sub.status end,
            jsonb_build_object('amount_cents', p_amount_cents, 'period_end', v_period_end));
  elsif p_status = 'rejected' then
    update public.subscriptions set status = case when status = 'active' then 'past_due' else status end where id = v_sub.id;
    insert into public.subscription_events (subscription_id, user_id, event_type, from_status, to_status, details)
    values (v_sub.id, v_sub.user_id, 'payment_rejected', v_sub.status,
            case when v_sub.status = 'active' then 'past_due' else v_sub.status end,
            jsonb_build_object('amount_cents', p_amount_cents, 'status_detail', p_status_detail));
  elsif p_status = 'refunded' and v_prev.status = 'approved' then
    -- Estorno: remove o período que aquele pagamento havia liberado.
    update public.subscriptions
       set current_period_end = coalesce((select max(b.period_end) from public.billing_payments b
                                           where b.subscription_id = v_sub.id and b.status = 'approved'), now())
     where id = v_sub.id;
    insert into public.subscription_events (subscription_id, user_id, event_type, details)
    values (v_sub.id, v_sub.user_id, 'payment_refunded', jsonb_build_object('amount_cents', p_amount_cents));
  end if;
  return jsonb_build_object('applied', true, 'user_id', v_sub.user_id);
end;
$$;

-- Pedido de cancelamento do próprio usuário (após confirmação no provedor).
create or replace function public.billing_mark_cancel_requested(p_subscription uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.subscription_events (subscription_id, user_id, event_type, from_status, details)
  select s.id, s.user_id, 'cancel_requested', s.status, jsonb_build_object('access_until', s.current_period_end)
    from public.subscriptions s where s.id = p_subscription;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.billing_register_checkout(uuid, text, text, integer, uuid)',
    'public.billing_apply_subscription_status(text, text, text, text, timestamptz)',
    'public.billing_record_payment(text, text, text, integer, text, text, timestamptz, timestamptz)',
    'public.billing_mark_cancel_requested(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- PAINEL ADMINISTRATIVO (somente agregados; nenhuma leitura de dados financeiros dos clientes)
-- -----------------------------------------------------------------------------
create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
end;
$$;
revoke all on function private.require_admin() from public;

create or replace function public.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_users int;
  v_paying int;
  v_trial int;
begin
  perform private.require_admin();
  select count(*) into v_users from auth.users;
  select count(distinct user_id) into v_paying from public.subscriptions
   where provider <> 'trial' and current_period_end > now() and status in ('active', 'past_due', 'paused', 'canceled');
  select count(distinct user_id) into v_trial from public.subscriptions
   where provider = 'trial' and status = 'trialing' and current_period_end > now();

  return jsonb_build_object(
    'users_total', v_users,
    'subscribers_active', v_paying,
    'trials_active', v_trial,
    'free_users', greatest(v_users - v_paying - v_trial, 0),
    'conversion_pct', case when v_users > 0 then round(v_paying * 100.0 / v_users, 1) else 0 end,
    'new_users_month', (select count(*) from auth.users where created_at >= v_month),
    -- Faturamento CONFIRMADO: pagamentos aprovados no mês.
    'revenue_confirmed_month_cents', coalesce((select sum(amount_cents) from public.billing_payments
                                                where status = 'approved' and paid_at >= v_month), 0),
    -- Faturamento PROJETADO: assinaturas que renovam (não canceladas) × preço contratado.
    'mrr_projected_cents', coalesce((select sum(coalesce(price_cents, 0)) from public.subscriptions
                                      where provider <> 'trial' and status in ('active', 'past_due')), 0),
    'payments_pending', (select count(*) from public.billing_payments where status = 'pending'),
    'payments_rejected_month', (select count(*) from public.billing_payments where status = 'rejected' and created_at >= v_month),
    'subscriptions_past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'checkouts_pending', (select count(*) from public.subscriptions where status = 'pending'),
    'cancellations_month', (select count(*) from public.subscription_events where event_type = 'cancel_requested' and created_at >= v_month),
    'ai_cost_month_micro_usd', coalesce((select sum(cost_micro_usd) from public.ai_usage where status = 'completed' and created_at >= v_month), 0),
    'ai_analyses_month', (select count(*) from public.ai_usage where status = 'completed' and created_at >= v_month),
    'revenue_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'confirmed_cents', coalesce(r.total, 0)) order by m)
        from generate_series(v_month - interval '5 months', v_month, interval '1 month') m
        left join (select date_trunc('month', paid_at at time zone 'America/Sao_Paulo') as mm, sum(amount_cents) as total
                     from public.billing_payments where status = 'approved' group by 1) r on r.mm = m at time zone 'America/Sao_Paulo'
    ), '[]'::jsonb)
  );
end;
$$;

-- Logs operacionais: notificações e eventos de assinatura SEM identificar o cliente.
create or replace function public.admin_logs(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'webhooks', coalesce((select jsonb_agg(w order by w.received_at desc) from (
        select provider, topic, status, error, received_at, processed_at
          from public.webhook_events order by received_at desc limit least(p_limit, 200)) w), '[]'::jsonb),
    'subscription_events', coalesce((select jsonb_agg(e order by e.created_at desc) from (
        select event_type, from_status, to_status, created_at
          from public.subscription_events order by created_at desc limit least(p_limit, 200)) e), '[]'::jsonb),
    'admin_actions', coalesce((select jsonb_agg(a order by a.created_at desc) from (
        select action, target, details, created_at
          from public.admin_audit_log order by created_at desc limit least(p_limit, 200)) a), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_update_plan(
  p_plan text, p_price_cents integer, p_max_accounts integer, p_max_active_budgets integer, p_max_active_goals integer,
  p_ai_limit integer, p_ai_period text, p_features text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.plans;
begin
  perform private.require_admin();
  select * into v_old from public.plans where id = p_plan for update;
  if not found then
    raise exception using errcode = '22023', message = 'UNKNOWN_PLAN';
  end if;
  update public.plans
     set price_cents = p_price_cents, max_accounts = p_max_accounts, max_active_budgets = p_max_active_budgets,
         max_active_goals = p_max_active_goals, ai_analyses_limit = p_ai_limit, ai_limit_period = p_ai_period,
         features = p_features
   where id = p_plan;
  insert into public.admin_audit_log (admin_id, action, target, details)
  values (auth.uid(), 'update_plan', p_plan, jsonb_build_object(
    'before', jsonb_build_object('price_cents', v_old.price_cents, 'ai_limit', v_old.ai_analyses_limit, 'max_accounts', v_old.max_accounts),
    'after', jsonb_build_object('price_cents', p_price_cents, 'ai_limit', p_ai_limit, 'max_accounts', p_max_accounts)));
end;
$$;

create or replace function public.admin_set_trial(p_enabled boolean, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_days < 1 or p_days > 30 then
    raise exception using errcode = '22023', message = 'INVALID_DAYS';
  end if;
  update public.app_settings
     set value = jsonb_build_object('enabled', p_enabled, 'days', p_days, 'requires_card', false)
   where key = 'pro_trial';
  insert into public.admin_audit_log (admin_id, action, target, details)
  values (auth.uid(), 'set_trial', 'pro_trial', jsonb_build_object('enabled', p_enabled, 'days', p_days));
end;
$$;

create or replace function public.admin_save_promotion(
  p_id uuid, p_name text, p_description text, p_price_cents integer, p_starts_at timestamptz, p_ends_at timestamptz, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_id is null then
    insert into public.promotions (name, description, plan_id, price_cents, starts_at, ends_at, is_active)
    values (p_name, p_description, 'pro', p_price_cents, p_starts_at, p_ends_at, p_active) returning id into v_id;
  else
    update public.promotions set name = p_name, description = p_description, price_cents = p_price_cents,
           starts_at = p_starts_at, ends_at = p_ends_at, is_active = p_active
     where id = p_id returning id into v_id;
  end if;
  insert into public.admin_audit_log (admin_id, action, target, details)
  values (auth.uid(), 'save_promotion', v_id::text, jsonb_build_object('price_cents', p_price_cents, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'active', p_active));
  return v_id;
end;
$$;

create or replace function public.admin_list_promotions()
returns setof public.promotions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from public.promotions order by starts_at desc;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_metrics()',
    'public.admin_logs(integer)',
    'public.admin_update_plan(text, integer, integer, integer, integer, integer, text, text[])',
    'public.admin_set_trial(boolean, integer)',
    'public.admin_save_promotion(uuid, text, text, integer, timestamptz, timestamptz, boolean)',
    'public.admin_list_promotions()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Pro em teste também conta como Pro nas funções de IA (plan_for_user já cobre 'trialing').
