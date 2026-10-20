import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
// ID da conta proprietária que também realiza a revisão humana.
const MODERATOR_USER_ID = "371f91af-8517-4252-b87d-a32171e8b2d6";

function getKey(envName: string, legacyName: string): string {
  const raw = Deno.env.get(envName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const value = parsed.default ?? Object.values(parsed)[0];
      if (typeof value === "string") return value;
    } catch { /* legacy fallback */ }
  }
  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Entre na sua conta." }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publishable = getKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = getKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return json({ error: "A função de revisão não está configurada." }, 503);

  const identity = await fetch(`${url}/auth/v1/user`, { headers: { apikey: publishable, Authorization: authorization } });
  if (!identity.ok) return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
  const user = await identity.json();
  if (user?.id !== MODERATOR_USER_ID) return json({ ok: false, not_moderator: true }, 403);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "Dados inválidos." }, 400); }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  if (input.action === "list") {
    const { data, error } = await admin.from("community_posts")
      .select("id,body,topic,city,mood,image_path,created_at")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(100);
    if (error) return json({ error: "Não consegui carregar a fila de revisão." }, 500);
    const posts = await Promise.all((data ?? []).map(async post => {
      let image_url: string | null = null;
      if (post.image_path) {
        const { data: signed, error: signError } = await admin.storage.from("community-photos").createSignedUrl(post.image_path, 300);
        if (!signError) image_url = signed.signedUrl;
      }
      return { ...post, image_url };
    }));
    return json({ ok: true, posts });
  }

  if (input.action !== "published" && input.action !== "removed") return json({ error: "Ação inválida." }, 400);
  if (typeof input.post_id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.post_id)) return json({ error: "Relato inválido." }, 400);
  const { data, error } = await admin.from("community_posts")
    .update({ status: input.action }).eq("id", input.post_id).eq("status", "pending").select("id").maybeSingle();
  if (error) return json({ error: "Não consegui salvar a decisão." }, 500);
  if (!data) return json({ error: "Esse relato já foi revisado ou não existe." }, 409);
  return json({ ok: true });
});
