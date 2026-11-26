// Supabase Edge Function: letsbot-link — v1 (26-11-2026)
// LetsBot (webhook message_notification) → se quem escreveu é cliente do portal e a mensagem fala em "pedido",
// responde no WhatsApp com o link secreto dele (embalagens.app/<token>/). Quem não é do portal: não faz nada.
//
// Publicar: Supabase › Edge Functions › Deploy a new function › nome "letsbot-link" › colar este arquivo › Deploy.
//   Em Details/Settings: DESLIGAR "Verify JWT" (o LetsBot não manda JWT).
// Secrets (Edge Functions › Secrets): LETSBOT_KEY = chave da API do LetsBot (API › Dados de autenticação)
//                                     WEBHOOK_SECRET = um segredo qualquer (o mesmo vai no webhook do LetsBot)
// Webhook no LetsBot (API › Webhooks): evento message_notification, URL
//   https://dzfelcufnsltutxeidow.supabase.co/functions/v1/letsbot-link?s=<WEBHOOK_SECRET>
//   (ou o cabeçalho x-globo-secret: <WEBHOOK_SECRET>, se o painel deixar)
// Tudo fica registrado na tabela portal_bot_log (ver portal/sql/bot.sql).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("LETSBOT_KEY") || "";
const SEG = Deno.env.get("WEBHOOK_SECRET") || "";
const SITE = "https://embalagens.app/";
const GATILHO = /\b(pedido|pedidos|pedir|encomenda|encomendar)\b/i;
const ESPERA_MIN = 10;   // não manda o link de novo para o mesmo número antes disso

const digitos = (s: unknown) => String(s ?? "").split("@")[0].replace(/\D/g, "");
// variações brasileiras com e sem o 9 (o WhatsApp às vezes guarda sem)
function variantes(t: string): string[] {
  const v = new Set([t]);
  const m = /^55(\d{2})(9?)(\d{8})$/.exec(t);
  if (m) { v.add(`55${m[1]}9${m[3]}`); v.add(`55${m[1]}${m[3]}`); }
  return [...v];
}
// o formato exato do payload do LetsBot não está documentado: procura os campos pelos nomes mais comuns
function pega(d: any, ...caminhos: string[]): any {
  for (const c of caminhos) {
    const v = c.split(".").reduce((o, k) => (o == null ? undefined : o[k]), d);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
async function log(r: Record<string, unknown>) {
  try { await SB.from("portal_bot_log").insert(r); } catch (_) { /* log nunca derruba a resposta */ }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (SEG && url.searchParams.get("s") !== SEG && req.headers.get("x-globo-secret") !== SEG) return new Response("no", { status: 401 });
  let j: any = null;
  try { j = await req.json(); } catch (_) { return new Response("ok"); }
  const d = j?.data ?? j;
  const evento = j?.event ?? "";
  const remoto = String(pega(d, "remoteJid", "key.remoteJid", "chat_id", "chatId", "from", "phone", "contact.phone", "message.remoteJid") ?? "");
  const deMim = !!pega(d, "from_me", "fromMe", "key.fromMe", "message.from_me");
  const texto = String(pega(d, "body", "text", "message.body", "message.text", "message.conversation", "message.extendedTextMessage.text", "caption") ?? "");
  const tel = digitos(remoto);
  const base = { evento, telefone: tel, texto: texto.slice(0, 300), bruto: JSON.stringify(j).slice(0, 4000) };

  if (evento && evento !== "message_notification") { await log({ ...base, acao: "ignorado: evento" }); return new Response("ok"); }
  if (deMim || !tel || remoto.includes("@g.us")) { await log({ ...base, acao: deMim ? "ignorado: enviada pela Globo" : "ignorado: sem número/grupo" }); return new Response("ok"); }
  if (!GATILHO.test(texto)) { await log({ ...base, acao: "ignorado: sem gatilho" }); return new Response("ok"); }

  const vs = variantes(tel);
  const { data: cs } = await SB.from("portal_clientes").select("token,nome,telefone,dados,ativo").eq("ativo", true);
  const c = (cs || []).find((x: any) => vs.includes(String(x.telefone)) || (x.dados?.telefones || []).some((t: string) => vs.includes(String(t))));
  if (!c) { await log({ ...base, acao: "ignorado: não é cliente do portal" }); return new Response("ok"); }

  const desde = new Date(Date.now() - ESPERA_MIN * 60e3).toISOString();
  const { data: rec } = await SB.from("portal_bot_log").select("id").eq("telefone", tel).eq("acao", "link enviado").gte("quando", desde).limit(1);
  if (rec && rec.length) { await log({ ...base, acao: "ignorado: link já enviado há pouco" }); return new Response("ok"); }

  const nome = String(c.nome || "").split(" ")[0];
  const msg = `Olá${nome ? ", " + nome : ""}! 🛒\n\nFaça seu pedido por aqui:\n${SITE}${c.token}/\n\nNo link você também vê os *pedidos anteriores* e todos os produtos com a sua arte. A Globo confere e te confirma por aqui.`;
  const fd = new FormData(); fd.append("phone", tel); fd.append("body", msg);
  let ok = false, resp = "";
  try {
    const r = await fetch("https://letsbot.net/api/v1/message/send", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json", "X-LetsBot-Validation": "strict" }, body: fd });
    resp = (await r.text()).slice(0, 1000); ok = r.ok;
  } catch (e) { resp = String(e); }
  await log({ ...base, acao: ok ? "link enviado" : "erro ao enviar", cliente: c.nome, resposta: resp });
  return new Response("ok");
});
