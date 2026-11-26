-- Robô do link (função letsbot-link) — registro do que ele recebeu e fez · v1 (26-11-2026)
-- Cole no SQL Editor do Supabase e Run. Pode rodar de novo.
create table if not exists public.portal_bot_log (
  id        bigserial primary key,
  quando    timestamptz not null default now(),
  evento    text,
  telefone  text,
  texto     text,
  acao      text,          -- link enviado · erro ao enviar · ignorado: …
  cliente   text,
  resposta  text,          -- resposta da API do LetsBot
  bruto     text           -- payload do webhook (cortado em 4.000 caracteres) — serve para ajustar os campos
);
alter table public.portal_bot_log enable row level security;   -- sem política: só a função (service role) lê e grava
create index if not exists portal_bot_log_tel on public.portal_bot_log (telefone, quando desc);
-- Para conferir:  select quando, telefone, texto, acao, cliente from portal_bot_log order by id desc limit 20;
