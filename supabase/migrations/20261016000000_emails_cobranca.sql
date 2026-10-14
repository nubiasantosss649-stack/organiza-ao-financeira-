-- =============================================================================
-- CONTROLE FÁCIL — E-mails transacionais de cobrança
--
-- Fila (outbox) preenchida pelas próprias funções de cobrança, na mesma
-- transação do evento: cada e-mail é enviado no máximo uma vez (dedupe_key)
-- e reenviado automaticamente em caso de falha temporária.
-- O conteúdo do e-mail NÃO é armazenado; só os metadados necessários.
-- =============================================================================

create table public.email_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('payment_receipt', 'payment_failed', 'subscription_canceled')),
  dedupe_key text not null unique check (char_length(dedupe_key) <= 200),
  -- Dados para montar o e-mail (valores e datas; sem dados de cartão).
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 200),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_pending_idx on public.email_outbox (next_attempt_at) where status in ('pending', 'sending');

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

create or replace function private.enqueue_email(p_user uuid, p_kind text, p_key text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox (user_id, kind, dedupe_key, payload)
  values (p_user, p_kind, p_key, p_payload)
  on conflict (dedupe_key) do nothing;
$$;
revoke all on function private.enqueue_email(uuid, text, text, jsonb) from public;

-- Enfileira a partir dos eventos de assinatura (pagamento aprovado/recusado, cancelamento).
create or replace function private.enqueue_billing_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where id = new.subscription_id;
  if new.event_type = 'payment_approved' then
    perform private.enqueue_email(new.user_id, 'payment_receipt', 'receipt:' || new.id,
      jsonb_build_object('amount_cents', new.details -> 'amount_cents', 'period_end', new.details -> 'period_end',
                         'paid_at', new.created_at));
  elsif new.event_type = 'payment_rejected' then
    perform private.enqueue_email(new.user_id, 'payment_failed', 'failed:' || new.id,
      jsonb_build_object('amount_cents', new.details -> 'amount_cents', 'access_until', v_sub.current_period_end));
  elsif ((new.event_type = 'status_changed' and new.to_status = 'canceled') or new.event_type = 'cancel_requested')
        and v_sub.current_period_end is not null then
    -- Só para assinaturas que chegaram a ser pagas (checkout abandonado não gera e-mail).
    -- Um único e-mail por cancelamento: o pedido e a confirmação do provedor geram a mesma chave;
    -- se a assinatura for reativada e cancelada de novo, a chave muda.
    perform private.enqueue_email(new.user_id, 'subscription_canceled', 'canceled:' || new.subscription_id || ':' ||
      (select count(*) from public.subscription_events e
        where e.subscription_id = new.subscription_id and e.event_type = 'reactivated'),
      jsonb_build_object('access_until', v_sub.current_period_end));
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_billing_email() from public;

create trigger subscription_events_enqueue_email after insert on public.subscription_events
  for each row execute function private.enqueue_billing_email();

-- Pega um lote de e-mails para enviar (com trava: dois processos não enviam o mesmo).
create or replace function public.email_claim_batch(p_limit integer default 20)
returns setof public.email_outbox
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1,
         -- se o processo cair no meio, volta a ficar disponível em 10 minutos
         next_attempt_at = now() + interval '10 minutes'
   where o.id in (
     select id from public.email_outbox
      where status in ('pending', 'sending') and next_attempt_at <= now() and attempts < 6
      order by next_attempt_at
      limit least(p_limit, 100)
      for update skip locked)
  returning o.*;
$$;

create or replace function public.email_mark(p_id bigint, p_status text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped', 'retry') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;
  update public.email_outbox
     set status = case when p_status = 'retry' then (case when attempts >= 6 then 'failed' else 'pending' end) else p_status end,
         last_error = left(p_error, 200),
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         -- espera crescente entre tentativas: 2, 4, 8, 16, 32 minutos
         next_attempt_at = case when p_status = 'retry' then now() + make_interval(mins => power(2, attempts)::int) else next_attempt_at end
   where id = p_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.email_claim_batch(integer)', 'public.email_mark(bigint, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- Painel admin: contagem de e-mails por status (sem destinatários).
create or replace function public.admin_email_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_object_agg(status, n) from (
    select status, count(*) as n from public.email_outbox where created_at > now() - interval '30 days' group by status) s), '{}'::jsonb);
end;
$$;
revoke all on function public.admin_email_stats() from public, anon;
grant execute on function public.admin_email_stats() to authenticated;
