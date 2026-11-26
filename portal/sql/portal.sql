-- Portal do cliente (link secreto por WhatsApp) — Embalagens Globo · v1.1 (26-11-2026: + artes do cliente no GloboEditor)
-- Cole TUDO no SQL Editor do Supabase e clique em Run. Pode rodar de novo: não duplica nem apaga pedidos.
--
-- Como funciona
--   * Cada cliente tem um TOKEN de 16 letras/números. O link é  embalagens.app/<token>/fazerpedido
--   * A tabela portal_clientes fica FECHADA (RLS sem política): o site não lê a tabela.
--     O site só chama duas funções: portal_get(token) e portal_pedido(token, itens, obs).
--   * portal_pedido recalcula o preço AQUI (o site não manda preço), gera o código GLS-XXXXX
--     e grava em pedidos_site com ref_interna = 'portal:<token>'.
--   * O Porteiro (Apps Script) puxa os pedidos novos com portal_pendentes(segredo) e cria a ficha WA-GLS-XXXXX.
--     O segredo é criado no fim deste script — copie o valor que aparecer no resultado.

create table if not exists public.portal_clientes (
  token         text primary key check (token ~ '^[A-Za-z0-9]{16}$'),
  telefone      text not null,                 -- WhatsApp de quem faz o pedido (só dígitos, com DDI)
  cliente_chave text,                          -- chave do cliente no Sistema Globo (SEG.cli) / 'TESTE'
  nome          text not null,                 -- como aparece na página ("Panetelli")
  vendedor      text,
  tabela        text default 'I',
  ativo         boolean not null default true,
  dados         jsonb not null default '{}'::jsonb,   -- {produtos:[…], historico:[…]}
  criado        timestamptz not null default now(),
  visto         timestamptz
);
alter table public.portal_clientes enable row level security;   -- sem política = ninguém de fora lê

create table if not exists public.portal_config (chave text primary key, valor text not null);
alter table public.portal_config enable row level security;

-- (26-11) linha de artes do cliente para o GloboEditor: {versao, recursos:{logo_…}, paleta, papel, sacolas:{'f1_branco':{aprovada, camadas}}}
alter table public.portal_clientes add column if not exists artes jsonb;

alter table public.pedidos_site add column if not exists ficha text;   -- id da ficha criada pelo Porteiro
alter table public.pedidos_site add column if not exists criado_em timestamptz default now();   -- (já existe? não muda nada)

-- 1) Página do cliente: devolve nome + produtos + histórico (nunca telefone nem token de outro)
create or replace function public.portal_get(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare r public.portal_clientes;
begin
  if p_token !~ '^[A-Za-z0-9]{16}$' then return null; end if;
  select * into r from public.portal_clientes where token = p_token and ativo;
  if not found then return null; end if;
  update public.portal_clientes set visto = now() where token = p_token;
  return jsonb_build_object('nome', r.nome, 'teste', r.cliente_chave = 'TESTE', 'tem_artes', r.artes is not null,
    'produtos', coalesce(r.dados->'produtos', '[]'::jsonb),
    'historico', coalesce(r.dados->'historico', '[]'::jsonb),
    'abertos', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'total', total, 'quando', criado_em) order by criado_em desc)
                         from public.pedidos_site where ref_interna = 'portal:' || p_token and criado_em > now() - interval '30 days'), '[]'::jsonb));
end $f$;

-- 1b) Loja/GloboEditor com as artes do cliente (link ?wa=<token>): devolve só nome + artes (pesado: o site guarda por 6 h)
create or replace function public.portal_artes(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare r public.portal_clientes;
begin
  if p_token !~ '^[A-Za-z0-9]{16}$' then return null; end if;
  select * into r from public.portal_clientes where token = p_token and ativo;
  if not found or r.artes is null then return null; end if;
  return jsonb_build_object('nome', r.nome, 'artes', r.artes);
end $f$;

-- 2) Fazer pedido: itens = [{"pid":"c_k35_k35_1_kg","qtd":3}, …]  (qtd em milheiros)
create or replace function public.portal_pedido(p_token text, p_itens jsonb, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare r public.portal_clientes; it jsonb; pr jsonb; q int; linhas jsonb := '[]'::jsonb; tot numeric := 0;
        cod text; alfa text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; i int; tent int := 0;
begin
  if p_token !~ '^[A-Za-z0-9]{16}$' then raise exception 'link inválido'; end if;
  select * into r from public.portal_clientes where token = p_token and ativo;
  if not found then raise exception 'link inválido'; end if;
  if (select count(*) from public.pedidos_site where ref_interna = 'portal:' || p_token and criado_em > now() - interval '1 hour') >= 5 then
    raise exception 'muitos pedidos seguidos — fale com a Globo no WhatsApp'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 40 then raise exception 'pedido vazio'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    select p into pr from jsonb_array_elements(r.dados->'produtos') p where p->>'pid' = it->>'pid' limit 1;
    if pr is null then raise exception 'produto fora da lista: %', it->>'pid'; end if;
    q := (it->>'qtd')::int;
    if q is null or q < 1 or q > 500 then raise exception 'quantidade inválida'; end if;
    linhas := linhas || jsonb_build_array(jsonb_build_object(
      'id', (pr->>'pid') || '#arte', 'pid', pr->>'pid', 'tipo', 'personalizado', 'nome', pr->>'nome', 'variacao', pr->>'variacao',
      'cod', pr->>'cod', 'qtd', q, 'un', 'milheiro', 'preco', (pr->>'preco')::numeric,
      'total', round(q * (pr->>'preco')::numeric, 2), 'arte', 'de_sempre', 'arte_nome', pr->>'arte', 'cliche', 0));
    tot := tot + round(q * (pr->>'preco')::numeric, 2);
  end loop;
  loop
    cod := 'GLS-'; for i in 1..5 loop cod := cod || substr(alfa, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into public.pedidos_site (codigo, wa_token, cupom, itens, total_itens, total_cliches, total, tem_arte, arte_nova, telefone_wa, ref_interna, obs)
      values (cod, p_token, null, linhas, tot, 0, tot, true, false, r.telefone, 'portal:' || p_token, nullif(left(coalesce(p_obs, ''), 500), ''));
      exit;
    exception when unique_violation then tent := tent + 1; if tent >= 3 then raise; end if; end;
  end loop;
  return jsonb_build_object('codigo', cod, 'total', tot, 'linhas', linhas);
end $f$;

-- 3) Porteiro: pedidos do portal ainda sem ficha (protegido pelo segredo)
create or replace function public.portal_pendentes(p_segredo text)
returns jsonb language plpgsql security definer set search_path = public as $f$
begin
  if p_segredo is null or p_segredo <> (select valor from public.portal_config where chave = 'sync') then raise exception 'segredo'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('codigo', s.codigo, 'criado_em', s.criado_em, 'itens', s.itens, 'total', s.total, 'obs', s.obs,
            'telefone', c.telefone, 'cliente_chave', c.cliente_chave, 'nome', c.nome, 'vendedor', c.vendedor, 'tabela', c.tabela) order by s.criado_em)
          from public.pedidos_site s join public.portal_clientes c on s.ref_interna = 'portal:' || c.token
          where s.ficha is null), '[]'::jsonb);
end $f$;

create or replace function public.portal_marca(p_segredo text, p_codigo text, p_ficha text)
returns void language plpgsql security definer set search_path = public as $f$
begin
  if p_segredo is null or p_segredo <> (select valor from public.portal_config where chave = 'sync') then raise exception 'segredo'; end if;
  update public.pedidos_site set ficha = p_ficha where codigo = p_codigo and ref_interna like 'portal:%';
end $f$;

-- 4) Porteiro: grava/atualiza um cliente do portal (o Claude manda produtos + histórico já montados)
create or replace function public.portal_salva_cliente(p_segredo text, p_token text, p_telefone text, p_chave text,
  p_nome text, p_vendedor text, p_tabela text, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $f$
begin
  if p_segredo is null or p_segredo <> (select valor from public.portal_config where chave = 'sync') then raise exception 'segredo'; end if;
  insert into public.portal_clientes (token, telefone, cliente_chave, nome, vendedor, tabela, dados)
  values (p_token, p_telefone, p_chave, p_nome, p_vendedor, coalesce(p_tabela, 'I'), p_dados)
  on conflict (token) do update set telefone = excluded.telefone, cliente_chave = excluded.cliente_chave, nome = excluded.nome,
    vendedor = excluded.vendedor, tabela = excluded.tabela, dados = excluded.dados;
end $f$;

revoke all on function public.portal_get(text), public.portal_artes(text), public.portal_pedido(text, jsonb, text), public.portal_pendentes(text),
  public.portal_marca(text, text, text), public.portal_salva_cliente(text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.portal_get(text), public.portal_artes(text), public.portal_pedido(text, jsonb, text), public.portal_pendentes(text),
  public.portal_marca(text, text, text), public.portal_salva_cliente(text, text, text, text, text, text, text, jsonb) to anon, authenticated;

-- 5) Cliente de TESTE (número de testes do Leo). Dados fictícios; nenhuma saída do sistema conta a chave TESTE.
insert into public.portal_clientes (token, telefone, cliente_chave, nome, vendedor, tabela, dados) values
('3NWKbpOOmmmQGyFh', '351935021232', 'TESTE', 'Cliente Teste', 'MARCIA', 'I', $j${
 "produtos":[
  {"pid":"c_k35_k35_1_2_kg","nome":"Saco ½ kg","variacao":"Kraft pardo 35 g","cod":"K35","preco":67.0,"minimo":15,"medidas":"9,5 × 18,5 × 5,5","arte":"Arte de teste","img":"editor-sacolas/fotos/Gabarito 0,5 Kg.webp","vezes":9,"ultimo":20},
  {"pid":"c_k35_k35_1_kg","nome":"Saco 1 kg","variacao":"Kraft pardo 35 g","cod":"K35","preco":89.0,"minimo":10,"medidas":"9,5 × 26,5 × 5,5","arte":"Arte de teste","img":"editor-sacolas/fotos/Gabarito 1 Kg.webp","vezes":12,"ultimo":15},
  {"pid":"c_k35_k35_2kg","nome":"Saco 2 kg","variacao":"Kraft pardo 35 g","cod":"K35","preco":111.0,"minimo":8,"medidas":"13,5 × 31 × 5,5","arte":"Arte de teste","img":"editor-sacolas/fotos/Gabarito 2 Kg.webp","vezes":4,"ultimo":8},
  {"pid":"c_k35_k35_3_kg","nome":"Saco 3 kg","variacao":"Kraft pardo 35 g","cod":"K35","preco":160.0,"minimo":5,"medidas":"16 × 37 × 6,0","arte":"Arte de teste","img":"editor-sacolas/fotos/Gabarito 3 Kg.webp","vezes":2,"ultimo":5},
  {"pid":"c_k35_k35_5_kg","nome":"Saco 5 kg","variacao":"Kraft pardo 35 g","cod":"K35","preco":225.0,"minimo":5,"medidas":"17,5 × 43 × 8,5","arte":"Arte de teste","img":"editor-sacolas/fotos/Gabarito 5 Kg.webp","vezes":0,"ultimo":0}],
 "historico":[
  {"num":"TESTE-3","data":"2026-11-19","total":3119.00,"itens":[{"pid":"c_k35_k35_1_kg","qtd":15},{"pid":"c_k35_k35_1_2_kg","qtd":20},{"pid":"c_k35_k35_2kg","qtd":4}]},
  {"num":"TESTE-2","data":"2026-11-12","total":1335.00,"itens":[{"pid":"c_k35_k35_1_kg","qtd":15}]},
  {"num":"TESTE-1","data":"2026-11-05","total":2360.00,"itens":[{"pid":"c_k35_k35_1_kg","qtd":10},{"pid":"c_k35_k35_1_2_kg","qtd":10},{"pid":"c_k35_k35_3_kg","qtd":5}]}]
}$j$::jsonb)
on conflict (token) do nothing;

-- 6) Segredo do Porteiro (cria uma vez; rodar de novo mostra o mesmo)
insert into public.portal_config (chave, valor) values ('sync', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (chave) do nothing;
select valor as "COPIE ESTE SEGREDO para o Apps Script (Propriedades do script › PORTAL_SEGREDO)" from public.portal_config where chave = 'sync';
