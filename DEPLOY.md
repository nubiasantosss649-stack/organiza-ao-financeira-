# Implantação em produção — Controle Fácil

Guia passo a passo para publicar o Controle Fácil com domínio próprio. Recomendação: **Vercel** (hospedagem
do Next.js, região São Paulo `gru1`, já configurada em `vercel.json`) + **Supabase** (banco/Auth, região
São Paulo `sa-east-1`). Qualquer hospedagem Node.js 22 que rode `npm run build && npm start` também serve.

> Nada aqui pode ser feito sem as suas contas: este guia descreve exatamente o que configurar em cada uma.

## 1. Supabase (produção)

1. Crie um projeto novo em supabase.com → região **South America (São Paulo)**. Guarde a senha do banco.
2. Plano: para produção, prefira um plano pago com **backups diários** (e, se possível, PITR).
3. Aplique as migrações (na ordem): `supabase/migrations/*.sql`
   - CLI: `npx supabase link --project-ref <ref>` e `npx supabase db push`; ou
   - SQL Editor: cole cada arquivo, em ordem de data.
4. **Authentication → Providers → Email**: confirmação de e-mail **ligada**; senha mínima 8 com letras e
   números; ative a proteção contra senhas vazadas, se disponível no plano.
5. **Authentication → URL Configuration**: Site URL `https://SEU-DOMINIO`; Redirect URLs `https://SEU-DOMINIO/**`.
6. **Authentication → Email Templates**: use `supabase/templates/confirmation.html` (Confirm signup) e
   `supabase/templates/recovery.html` (Reset password). Os links apontam para `/auth/confirm?token_hash=...`.
7. **SMTP próprio** (Authentication → SMTP): o envio padrão do Supabase tem limite baixo. Use um provedor
   (ex.: Resend, Amazon SES, Brevo) com domínio verificado (SPF, DKIM e DMARC no seu DNS).
8. Copie: **Project URL**, **publishable key** (ou anon) e **secret key** (ou service_role).
9. Crie o primeiro administrador depois do seu cadastro no app:
   `insert into public.admins (user_id) select id from auth.users where email = 'voce@seudominio.com.br';`

## 2. Vercel

1. Importe o repositório `organiza-ao-financeira-` (branch de produção: `main` após o merge).
2. **Environment Variables** (Production):

| Variável | Valor | Visível no navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | sim (público) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable/anon key | sim (público, protegido por RLS) |
| `SUPABASE_SECRET_KEY` | secret/service_role key | **não** — só servidor |
| `NEXT_PUBLIC_SITE_URL` | `https://SEU-DOMINIO` (com https) | sim |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | e-mail de suporte | sim |
| `NEXT_PUBLIC_COMPANY_NAME` | razão social/nome | sim |
| `ANTHROPIC_API_KEY` | chave da API da Anthropic | **não** |
| `AI_MODEL` | `claude-opus-5-5` (padrão) | não |
| `MERCADOPAGO_ACCESS_TOKEN` | token de **produção** (após validar o de teste) | **não** |
| `MERCADOPAGO_WEBHOOK_SECRET` | assinatura secreta do webhook | **não** |
| `BILLING_ENABLED` | `false` até validar no sandbox; depois `true` | não |

3. Faça o deploy e verifique `https://SEU-DOMINIO/api/health` → `{"status":"ok","database":"ok"}`.
4. Use um ambiente **Preview** separado (outro projeto Supabase de homologação + credenciais de teste do
   Mercado Pago) para testar mudanças antes da produção.

## 3. Domínio (ex.: comprado no Registro.br)

1. Na Vercel: Project → Settings → **Domains** → adicione `seudominio.com.br` e `www.seudominio.com.br`.
2. No DNS do seu domínio (Registro.br → "Editar zona", ou o provedor de DNS que você usa), crie os registros
   **exatamente como a Vercel mostrar** na tela de Domains. Normalmente:
   - domínio raiz (`@`): registro **A** apontando para o IP indicado pela Vercel;
   - `www`: registro **CNAME** apontando para o alvo `*.vercel-dns.com` indicado pela Vercel.
3. Aguarde a propagação (minutos a algumas horas). O certificado HTTPS é emitido automaticamente.
4. Escolha o domínio principal (com ou sem `www`) e redirecione o outro para ele (opção da própria Vercel).
5. Atualize `NEXT_PUBLIC_SITE_URL`, a Site URL/Redirect URLs do Supabase e a URL do webhook do Mercado Pago
   para o domínio final.
6. Depois de tudo funcionando em HTTPS por alguns dias, você pode enviar o domínio para a lista de HSTS
   preload (o cabeçalho já é enviado).

## 4. Mercado Pago

Siga a seção "Configurar o Mercado Pago" do README. Ordem obrigatória:
1. credenciais de **teste** + webhook apontando para o ambiente de homologação;
2. ciclo completo com usuários de teste (aprovação, recusa, cancelamento, estorno);
3. só então credenciais de **produção**, webhook para o domínio final e `BILLING_ENABLED=true`.

## 5. Assistente de IA

Crie a chave em console.anthropic.com, defina **limites de gasto** na própria conta da Anthropic e
acompanhe o custo estimado em `/admin`. Os limites por plano são configurados em `/admin/planos`.

## 6. Checklist de lançamento

- [ ] Migrações aplicadas e `api/health` ok
- [ ] Cadastro → e-mail de confirmação chega (SMTP próprio) → login → recuperação de senha
- [ ] Política de Privacidade e Termos revisados por advogado, com razão social, CNPJ e contato do encarregado (DPO)
- [ ] E-mail de suporte funcionando
- [ ] Administrador criado e `/admin` acessível só para ele
- [ ] Mercado Pago validado no sandbox antes de `BILLING_ENABLED=true`
- [ ] Limite de gastos configurado na Anthropic
- [ ] Backups do banco ativos
- [ ] Teste no celular: Android (Chrome → "Instalar app") e iPhone (Safari → Compartilhar → "Adicionar à Tela de Início")
- [ ] Monitoramento: alerta de disponibilidade apontando para `/api/health` (ex.: UptimeRobot, Better Stack)

## 7. Depois do lançamento

- Acompanhe `/admin/logs` (webhooks com falha ou assinatura inválida).
- Revise mensalmente o custo de IA e a conversão em `/admin`.
- Mudanças de preço valem para novas assinaturas; comunique clientes antes de qualquer alteração.
