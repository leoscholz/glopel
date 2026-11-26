-- Confirmação automática do pedido do portal no WhatsApp · v1 (26-11-2026)
-- Pedido novo do portal (pedidos_site, ref_interna 'portal:…') → o banco chama a função letsbot-link,
-- que manda "✅ Pedido GLS-… recebido" no WhatsApp do cliente pelo LetsBot.
-- Pré-requisitos: portal.sql v1.1, bot.sql e a função letsbot-link v1.2 publicada.
-- O segredo do webhook fica em portal_config (chave 'webhook') — gravado por um SQL à parte, que NÃO vai para o GitHub.
-- Cole no SQL Editor e Run. Pode rodar de novo.
create extension if not exists pg_net with schema extensions;
alter table public.pedidos_site add column if not exists confirmado_wa timestamptz;

create or replace function public.portal_avisa_pedido()
returns trigger language plpgsql security definer set search_path = public, extensions as $f$
declare seg text;
begin
  if coalesce(new.ref_interna, '') not like 'portal:%' then return new; end if;
  select valor into seg from public.portal_config where chave = 'webhook';
  if seg is null then return new; end if;   -- sem segredo: não chama (o pedido entra normalmente)
  perform net.http_post(
    url := 'https://dzfelcufnsltutxeidow.supabase.co/functions/v1/letsbot-link',
    body := jsonb_build_object('event', 'pedido_portal', 'codigo', new.codigo),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-globo-secret', seg),
    timeout_milliseconds := 8000);
  return new;
exception when others then return new;      -- aviso nunca impede o pedido de entrar
end $f$;

drop trigger if exists portal_avisa_pedido on public.pedidos_site;
create trigger portal_avisa_pedido after insert on public.pedidos_site
  for each row execute function public.portal_avisa_pedido();
