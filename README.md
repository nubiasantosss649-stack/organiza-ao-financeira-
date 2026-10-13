# CONTROLE FÁCIL

**Seu dinheiro organizado, sua vida mais tranquila.**

Aplicativo de controle financeiro pessoal (SaaS) com plano Grátis e assinatura Pro, feito para o Brasil.
Foco em pessoas que querem controlar gastos, organizar dívidas, economizar e melhorar a vida financeira.

> Não há módulos para casais, empresas ou autônomos — por decisão de produto.

## Status por etapa

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 — App básico | Estrutura, layout, autenticação, banco, receitas/despesas, categorias, dashboard, gráficos, metas, plano Grátis | ✅ Concluída |
| 2 — Recursos Pro | Cartões, dívidas, importação CSV/OFX, análises, assistente IA, limites | ✅ Concluída (liberação para clientes depende da Etapa 3) |
| 3 — Assinaturas | Mercado Pago, webhooks, cancelamento, painel admin | ✅ Implementada · ⚠️ falta validar no sandbox do Mercado Pago (checkout desligado até lá) |
| 4 — Lançamento | Landing final, PWA completo, segurança, deploy | ⏳ Landing básica, manifesto e ícones prontos |

## Tecnologias

- **Next.js 16** (App Router, Server Actions, `proxy.ts`) + **TypeScript** + **Tailwind CSS 4**
- **Supabase**: PostgreSQL, Auth (e-mail/senha com confirmação) e **Row Level Security**
- **Zod 4** para validação · **Recharts** para gráficos · **lucide-react** para ícones
- **Vitest** para testes (unitários e de banco)

## Arquitetura

```
src/
  app/
    (public)/          landing, privacidade, termos
    (auth)/            entrar, cadastro, recuperar/redefinir senha
    auth/confirm       confirmação de e-mail e recuperação (token_hash e PKCE)
    auth/sair          logout (POST)
    app/               área logada (dashboard, lançamentos, contas, categorias,
                       orçamentos, metas, perfil, planos, boas-vindas, telas Pro)
    api/exportar       exportação de dados do usuário (CSV/JSON)
  components/          UI, formulários, gráficos, navegação
  lib/
    money.ts           dinheiro em CENTAVOS inteiros (parse/format/parcelas)
    dates.ts           datas ISO sem fuso; "hoje" em America/Sao_Paulo
    finance.ts         regras do dashboard, parcelas, recorrência, orçamentos, metas
    validation.ts      schemas Zod
    auth.ts            camada de acesso (usuário e direitos do plano)
    supabase/          clientes (navegador, servidor e admin)
  proxy.ts             renova sessão e protege /app
supabase/
  migrations/          esquema, RLS, limites de plano, funções do dashboard
  templates/           e-mails de confirmação e recuperação (pt-BR)
  tests/               stub do Supabase para testes de banco em Postgres puro
tests/
  unit/                cálculos financeiros, validações, CSV, segurança
  db/                  RLS, isolamento entre usuários, limites e plano Pro
```

### Decisões importantes

- **Valores em centavos (`bigint`)** em todo o sistema. Nada de `float`: `0,10 + 0,20` dá exatamente `R$ 0,30`.
  Parcelas distribuem a sobra de centavos nas primeiras (R$ 100 em 3x = 33,34 + 33,33 + 33,33).
- **Isolamento de dados no banco**: RLS em todas as tabelas + chaves estrangeiras compostas `(user_id, id)`,
  que impedem referenciar a conta/categoria/meta de outra pessoa mesmo com acesso direto à API.
- **Limites do plano aplicados no banco** (triggers), não só na interface. Os limites ficam na tabela `plans`
  e podem ser alterados sem mexer no código. Limites **nunca escondem ou apagam** dados: só impedem criar novos
  itens acima do limite (ex.: após o fim do Pro, todas as contas continuam visíveis).
- **Acesso Pro** só existe enquanto houver assinatura com período pago vigente (`current_period_end > now()`).
  Assinatura `pending` não libera nada. Usuários não conseguem gravar na tabela de assinaturas.
- **Teste Pro de 7 dias** está cadastrado em `app_settings` como **desativado**, até a Etapa 3 controlar sua duração.
- **Checkout desativado** (`BILLING_ENABLED=false`): a tela de planos mostra “Assinatura disponível em breve” —
  sem cobranças nem promessas falsas.

### Regras do dashboard (hipóteses exibidas ao usuário)

- **Saldo total** = saldo inicial das contas + receitas recebidas − despesas pagas.
- **Receitas/Despesas do mês** = apenas o que foi recebido/pago no mês.
- **A pagar** = despesas pendentes que vencem de hoje até o fim do mês.
- **Vencidas** = despesas pendentes com vencimento anterior a hoje.
- **Valor disponível** = saldo total − (a pagar + vencidas).
- **Gastos por categoria e orçamentos** consideram despesas pagas **e pendentes** do mês (valor comprometido).

## Recursos Pro (Etapa 2)

Todos os recursos Pro são protegidos **no banco** (RLS + triggers), não só na interface:
criar/alterar cartões, dívidas e importações exige o recurso no plano. **Ler e excluir dados próprios é
sempre permitido**, e pagar faturas/dívidas já cadastradas continua liberado após o fim do Pro.

- **Cartões de crédito** (`/app/cartoes`): limite, fechamento, vencimento, compras à vista e parceladas,
  faturas (aberta, fechada, paga, vencida), limite disponível e pagamento de fatura.
  *Sem contagem dupla*: a compra é a despesa (na data da compra); pagar a fatura só reduz o saldo da conta.
  Compras feitas a partir do dia de fechamento vão para a fatura seguinte. Faturas em aberto entram em
  "a pagar" no painel.
- **Minhas dívidas** (`/app/dividas`): saldo devedor, juros mensais, parcelas, pagamentos (com opção de
  lançar como despesa sem duplicar), simulação de quitação antecipada (extra mensal e valor à vista),
  comparação Avalanche × Bola de neve, plano mês a mês e gráfico de evolução. **Toda simulação lista as hipóteses.**
- **Importação de extratos** (`/app/importar`): CSV (vários layouts brasileiros) e OFX 1.x/2.x, leitura
  UTF-8 ou Windows-1252, até 1 MB / 2.000 linhas. Prévia com categoria sugerida (histórico do usuário →
  regras por palavra-chave), correção manual, detecção de duplicatas (já importadas e possíveis duplicatas
  manuais) e "desfazer importação". Arquitetura pronta para Open Finance (`BankConnector`), **não implementada**.
- **Relatórios** (`/app/relatorios`): 12 meses, comparação por categoria, assinaturas recorrentes,
  projeção de 3 meses com hipóteses e exportação CSV (verificada no servidor).
- **Controle Fácil IA** (`/app/ia`): exige **autorização explícita**; envia ao Claude apenas um resumo
  agregado (totais por mês/categoria, orçamentos, metas, dívidas, nomes de recorrentes) — nunca nome,
  e-mail, ids ou lançamentos individuais. Perguntas e respostas não são armazenadas; só o uso
  (tokens e custo estimado). O prompt proíbe inventar dados, prometer ganhos ou realizar pagamentos.
  - Grátis: 3 análises prontas no total. Pro: análises prontas + perguntas livres, 20 por mês.
  - Limites ficam na tabela `plans` (`ai_analyses_limit`, `ai_limit_period`) e são aplicados no banco
    (`ai_reserve`). Falhas, recusas e "sem dados" não descontam. A conclusão do uso (`ai_finish`) só
    pode ser feita pelo servidor (service role), então o usuário não consegue "estornar" uma análise.
  - Modelo padrão `claude-opus-5-5` (troque com `AI_MODEL`), esforço `medium`, e **fallback automático
    em caso de recusa** (`fallbacks: "default"`).

> Até a Etapa 3 não há como assinar pelo app. Para testar o Pro, insira uma assinatura manual no banco:
> `insert into subscriptions (user_id, plan_id, provider, status, started_at, current_period_end)
> values ('<uuid>', 'pro', 'manual', 'active', now(), now() + interval '30 days');`

## Assinaturas e painel administrativo (Etapa 3)

### Como funciona a cobrança

1. **Checkout** (`/app/assinatura`): o servidor cria uma assinatura mensal no Mercado Pago (API `/preapproval`,
   sem plano associado, pagamento pendente, R$ em centavos convertidos sem ponto flutuante) com
   `external_reference` = id do usuário e redireciona para o `init_point`. O cartão é digitado no Mercado Pago;
   o Controle Fácil nunca recebe dados de cartão.
2. **Retorno** (`/app/assinatura/retorno`): **não ativa nada**. Só consulta o status no servidor do provedor.
3. **Webhook** (`POST /api/webhooks/mercadopago`): valida a assinatura `x-signature` (HMAC-SHA256 do manifesto
   `id:…;request-id:…;ts:…;` com a chave secreta), registra a notificação (idempotência por `x-request-id`),
   **consulta o recurso no Mercado Pago** (nunca confia no corpo recebido) e aplica no banco com funções
   idempotentes (`billing_apply_subscription_status`, `billing_record_payment`), executáveis só pelo servidor.
4. **Ativação**: o Pro é liberado **somente por pagamento aprovado**; cada aprovação libera 1 mês a partir da
   data do pagamento. Pagamento repetido não estende o período duas vezes.
5. **Recusa**: assinatura fica "em atraso", o cliente vê o aviso e mantém o acesso até o fim do período já pago.
6. **Cancelamento**: um clique (com confirmação) em "Minha assinatura"; cancela no Mercado Pago, registra no
   histórico e mantém o Pro até o fim do período pago. Depois a conta volta ao Grátis **sem apagar dados**.
7. **Reativação**: assinatura pausada volta a cobrar; cancelada faz nova contratação.
8. **Estorno**: remove o período que aquele pagamento havia liberado.
9. **Exclusão de conta**: bloqueada enquanto houver assinatura ativa (evita cobrança após excluir).

Tabelas: `subscriptions` (usuário, provedor, plano, status, início, próxima cobrança, cancelamento, preço
contratado), `subscription_events` (histórico de alterações), `billing_payments` (histórico de cobranças),
`webhook_events` (logs sem dados sensíveis), `promotions`, `admins`, `admin_audit_log`.

### Teste gratuito do Pro

7 dias (configurável de 1 a 30), **sem cartão e sem cobrança automática**: um por conta, nunca para quem já
assinou, termina sozinho (o acesso depende só da data de término, verificada no banco). Vem **desligado**;
o administrador liga em `/admin/planos`.

### Ofertas com prazo real

Criadas em `/admin/planos` com início e fim (horário de Brasília). Só aparecem dentro do período, com o
preço normal riscado e a data de término. O preço promocional vale para quem assinar no prazo e é mantido
nas renovações. Sem contagem regressiva falsa nem desconto fictício.

### Painel administrativo (`/admin`)

- Acesso só para usuários na tabela `admins`; os demais recebem "página não encontrada". Para tornar-se
  administrador: `insert into public.admins (user_id) values ('<seu uuid>');` (no SQL Editor do Supabase).
- Visão geral: usuários, assinantes ativos, gratuitos, em teste, conversão, **faturamento confirmado**
  (pagamentos aprovados) separado do **projetado** (MRR), pagamentos pendentes/recusados, checkouts não
  concluídos, cancelamentos, custo estimado de IA e faturamento por mês.
- Planos: preço, limites (contas, orçamentos, metas, análises de IA e período) e recursos de cada plano,
  sem alterar código. Alterar o preço vale para **novas** assinaturas.
- Teste gratuito e ofertas; logs de webhooks, eventos de assinatura e ações de administradores (auditoria).
- **Nenhum acesso aos dados financeiros dos clientes**: as funções do painel retornam só agregados e o RLS
  continua impedindo o administrador de ler lançamentos de terceiros (coberto por teste).

### Configurar o Mercado Pago (ambiente de testes primeiro)

1. Em *Suas integrações*, crie uma aplicação (produto: Assinaturas) e copie o **Access Token de teste**.
2. Em *Webhooks*, cadastre `https://SEU-DOMINIO/api/webhooks/mercadopago`, marque os eventos de
   **Planos e assinaturas** (assinaturas e pagamentos recorrentes) e copie a **assinatura secreta**.
3. Defina `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e mantenha `BILLING_ENABLED=false`.
4. Teste o ciclo completo com usuários de teste do Mercado Pago (aprovação, recusa, cancelamento).
   Só então use `BILLING_ENABLED=true` e troque para as credenciais de produção.

## Plano Grátis (Etapa 1)

Cadastro e login · dashboard · registro manual **ilimitado** · categorias personalizadas · gráficos básicos ·
**até 2 contas/carteiras** · **1 orçamento ativo** · **1 meta ativa** · histórico · exportação de dados.
Sem prazo de expiração. Inclui 3 análises demonstrativas de IA (análises prontas).

## Como rodar localmente

Pré-requisitos: Node 22, Docker (para o Supabase local).

```bash
npm install
cp .env.example .env.local
npx supabase start          # sobe Postgres + Auth + API locais e aplica as migrações
# copie a URL e a publishable/anon key exibidas para o .env.local
npm run dev                 # http://localhost:3000
```

E-mails de confirmação no ambiente local aparecem no Mailpit (endereço exibido pelo `supabase start`).

### Usando um projeto Supabase na nuvem

1. Crie o projeto em supabase.com (região São Paulo recomendada).
2. Aplique as migrações: `npx supabase link --project-ref <ref>` e `npx supabase db push`
   (ou cole o arquivo de `supabase/migrations` no SQL Editor).
3. **Authentication → URL Configuration**: Site URL = sua URL; Redirect URLs = `https://seu-dominio/**`.
4. **Authentication → Email Templates**: use os modelos de `supabase/templates/` (links para `/auth/confirm?token_hash=...`).
5. Ative “Confirm email” e defina senha mínima de 8 caracteres com letras e números.
6. Configure um SMTP próprio (o SMTP padrão do Supabase tem limite baixo de envio).
7. Preencha as variáveis de ambiente na hospedagem. **`SUPABASE_SECRET_KEY` nunca deve ser exposta ao navegador.**

## Testes

```bash
npm run lint        # ESLint
npm run typecheck   # tipos (inclui rotas)
npm test            # 103 testes unitários (inclui assinatura do webhook, status e adaptador do Mercado Pago)
                    # e também: dinheiro, datas, parcelas, dashboard, metas, validação, CSV,
                    # faturas, simulador de dívidas, parsers OFX/CSV, duplicatas, categorização,
                    # recorrências, projeção, contexto e chamada da IA (cliente simulado)
npm run test:db     # 47 testes de banco num PostgreSQL temporário: RLS, isolamento, limites, Pro,
                    # recursos Pro protegidos, faturas sem contagem dupla, importação, limites de IA,
                    # cobranças (ativação só com pagamento aprovado, idempotência, recusa, cancelamento,
                    # estorno), teste Pro, promoções e permissões do painel admin
npm run build       # build de produção
```

O `test:db` precisa do PostgreSQL instalado localmente (usa `initdb`/`pg_ctl`). O CI do GitHub roda tudo
automaticamente (`.github/workflows/ci.yml`).

### Verificação ponta a ponta realizada (Etapa 1)

Com Postgres 17 + GoTrue (Auth) + PostgREST oficiais do Supabase e o app em modo produção, um roteiro em
navegador real (Playwright) passou em 32 de 32 verificações: cadastro com validação, bloqueio de login antes da
confirmação, confirmação por e-mail, onboarding, conta inicial, compra parcelada sem perder centavos, saldo,
disponível, contas vencidas, busca e filtros, marcar como pago, limite de 2 contas e 1 orçamento, meta com depósito,
tela Pro com preço, exportação CSV/JSON, layout no celular sem rolagem horizontal, isolamento entre dois usuários,
recuperação de senha, login com nova senha e exclusão de conta.

### Verificação ponta a ponta (Etapa 2)

Mesma pilha local, com uma API de mensagens **simulada** (via `ANTHROPIC_BASE_URL`) para não gastar com a
API real: 45 de 45 verificações — telas Pro bloqueadas no Grátis com preço, exportação Pro negada no
servidor (403), consentimento da IA, 3 análises demonstrativas e bloqueio da 4ª, conteúdo enviado à IA sem
e-mail/nome/ids, cartão com compra parcelada em 3 faturas, limite disponível, pagamento de fatura sem
contagem dupla, dívida (13 meses a 2,99% a.m.), quitação antecipada, pagamento lançado como despesa uma
única vez, Avalanche × Bola de neve, importação OFX com sugestão de categoria, reimportação marcando
duplicatas, desfazer importação, relatórios e exportação, pergunta livre no Pro, layout no celular, dados
visíveis após o fim do Pro e isolamento entre usuários. O roteiro da Etapa 1 (32/32) continuou passando.

**Não verificado:** chamada real à API do Claude (sem chave neste ambiente) — o formato da requisição foi
validado contra os tipos do SDK oficial `@anthropic-ai/sdk` e por testes com cliente simulado.

### Verificação ponta a ponta (Etapa 3)

Com um **simulador local** da API de assinaturas do Mercado Pago (que também envia webhooks assinados),
30 de 30 verificações: preço e condições claras, redirecionamento ao checkout, assinatura criada com valor
em BRL/mês e referência ao usuário, retorno sem pagar **não** ativa o Pro, pagamento aprovado via webhook
ativa o Pro, histórico de cobranças, notificação duplicada processada uma vez, assinatura inválida rejeitada
(401), recusa com aviso e acesso mantido, nova tentativa aprovada, exclusão de conta exige cancelar,
cancelamento mantendo o Pro até o fim, volta ao Grátis depois, `/admin` invisível para não administradores,
métricas confirmado × projetado sem e-mails de clientes, edição de limite de IA, oferta com prazo, teste de
7 dias sem cobrança, assinatura com preço promocional e layout no celular. Etapas 1 (32/32) e 2 (45/45)
continuaram passando.

**Não verificado (bloqueado neste ambiente):** chamadas reais à API e ao sandbox do Mercado Pago — a rede
deste ambiente bloqueia `api.mercadopago.com` e ainda não há credenciais de teste. O formato das requisições,
dos status e da assinatura do webhook segue a documentação pública do Mercado Pago, mas **precisa ser
validado no sandbox antes de ligar `BILLING_ENABLED`**.

## Segurança e LGPD (Etapa 1)

- Senhas gerenciadas pelo Supabase Auth; confirmação de e-mail obrigatória; senha ≥ 8 com letras e números.
- Sessão renovada no `proxy.ts`; cada página/ação valida o usuário no servidor (`getUser`).
- RLS + grants por coluna (usuário só altera nome e onboarding no perfil); anônimos não leem dados financeiros.
- Redirecionamentos internos validados (sem *open redirect*); logout via POST.
- Cabeçalhos de segurança (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Exportação CSV protegida contra injeção de fórmulas; respostas privadas com `no-store`.
- Exportação de dados, encerramento de sessões e exclusão de conta (com senha + confirmação) em **Meu perfil**.
- Política de Privacidade e Termos de Uso em versão-base — **revisar com advogado** e incluir razão social/CNPJ.

## O que falta (próximas etapas)

- **Pendências da Etapa 2**: desafios financeiros nas metas; alertas de contas por e-mail/notificação
  (hoje os alertas aparecem no painel); integração bancária via Open Finance (só a interface está pronta).
- **Pendências da Etapa 3**: validar o fluxo no sandbox do Mercado Pago (credenciais de teste + liberar
  `api.mercadopago.com` na rede) e só então ligar `BILLING_ENABLED`; e-mails transacionais de cobrança
  (recibo, recusa, cancelamento); conciliação periódica com o provedor caso algum webhook se perca.
- **Etapa 4**: landing com capturas reais, service worker/instalação PWA, CSP, testes finais, domínio e deploy.
- Pequenos itens: transferências entre contas; edição em lote de séries recorrentes.
