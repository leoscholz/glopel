-- GloboEditor · Ponte Site ↔ WhatsApp · contrato v1 (17-11-2026)
-- Tabela de pedidos vindos do carrinho do site. OK do Leo para rodar: 17-11-2026.
-- Decisões: número 554191455539 · sem login (identidade = nº do WhatsApp) · arte = a já cadastrada do cliente; arte nova é exceção.
-- Cole no SQL Editor do Supabase (projeto dzfelcufnsltutxeidow) e clique em Run. Pode rodar de novo.
-- Front usa só a chave publishable (anon). service_role NUNCA no front: leitura/baixa é do bot/Claude/painel interno.

create table if not exists public.pedidos_site (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique check (codigo ~ '^GLS-[2-9A-HJ-NP-Z]{5}$'),
  criado_em     timestamptz not null default now(),
  versao        smallint not null default 1,               -- versão do contrato
  wa_token      text check (wa_token is null or wa_token ~ '^[A-Za-z0-9]{8,16}$'),
  cupom         text check (cupom is null or length(cupom) <= 20),
  user_id       uuid,                                       -- sem login (decisão 17-11); reservado
  itens         jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 60),
  total_itens   numeric(12,2) not null check (total_itens >= 0),
  total_cliches numeric(12,2) not null default 0 check (total_cliches >= 0),
  total         numeric(12,2) not null check (total >= 0),
  tem_arte      boolean not null default false,
  arte_nova     boolean not null default false,             -- exceção: atendente trata
  -- preenchidos pelo lado interno (bot/Claude/humano), nunca pelo site:
  status        text not null default 'aguardando_whatsapp'
                check (status in ('aguardando_whatsapp','recebido','conferido','confirmado','cancelado','expirado')),
  telefone_wa   text,                                       -- número que mandou o código de volta
  recebido_em   timestamptz,
  ref_interna   text,                                       -- nº PV no Start / linha na planilha
  obs           text
);
create index if not exists pedidos_site_status on public.pedidos_site (status, criado_em desc);

alter table public.pedidos_site enable row level security;

-- Site (anon ou logado) só INSERE, e só no estado inicial. Não lê, não altera, não apaga.
drop policy if exists pedidos_site_insert on public.pedidos_site;
create policy pedidos_site_insert on public.pedidos_site for insert to anon, authenticated
  with check (status = 'aguardando_whatsapp' and telefone_wa is null and recebido_em is null
              and ref_interna is null and obs is null and user_id is null
              );

-- Sem login: ninguém do front lê pedidos (nem anon nem logado).
drop policy if exists pedidos_site_select_dono on public.pedidos_site;

-- Sem policy de update/delete para anon/authenticated => bloqueado. Baixa de status = service_role no backend.

-- Expira pedidos que nunca voltaram ao WhatsApp (rodar manualmente ou via cron do Supabase):
-- update public.pedidos_site set status='expirado' where status='aguardando_whatsapp' and criado_em < now() - interval '7 days';

-- (Fase 2, opcional) sessões de link: o bot grava token -> telefone/cliente ao mandar o link.
create table if not exists public.wa_links (
  token        text primary key check (token ~ '^[A-Za-z0-9]{8,16}$'),
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null default now() + interval '72 hours',
  telefone     text not null,
  cliente_cod  text,              -- código do cliente no Start
  cupom        text
);
alter table public.wa_links enable row level security;   -- sem policy: só service_role (bot) lê/escreve

-- Conferência depois de rodar (deve listar as 2 tabelas com RLS ligado):
select relname, relrowsecurity from pg_class where relname in ('pedidos_site','wa_links');
