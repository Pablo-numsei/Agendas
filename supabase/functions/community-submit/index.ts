import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const allowedTopics = new Set(["dia-a-dia", "pequena-vitoria", "dia-dificil", "quero-desabafar", "rotina"]);
const allowedMoods = new Set(["", "bem", "mais-ou-menos", "ansioso", "triste", "cansado"]);
const allowedThemes = new Set(["sage", "ocean", "sunset", "lavender"]);
const allowedTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const blockedTextCategories = [
  "harassment", "harassment/threatening", "hate", "hate/threatening",
  "sexual/minors", "illicit/violent", "self-harm/instructions",
];
const blockedImageCategories = ["sexual", "violence", "violence/graphic", "self-harm", "self-harm/instructions"];

function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      const value = parsed.default ?? Object.values(parsed)[0];
      if (typeof value === "string") return value;
    } catch { /* legacy secret below */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function publishableKey(): string {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      const value = parsed.default ?? Object.values(parsed)[0];
      if (typeof value === "string") return value;
    } catch { /* legacy key below */ }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishable = publishableKey();
  const adminKey = secretKey();
  const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!supabaseUrl || !publishable || !adminKey || !openAiKey) {
    return json({ error: "A revisão automática ainda não foi configurada. Nenhum conteúdo foi enviado." }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Entre na sua conta para publicar." }, 401);
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishable, Authorization: authorization },
  });
  if (!userResponse.ok) return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
  const user = await userResponse.json();
  if (!user?.id) return json({ error: "Não foi possível confirmar sua conta." }, 401);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "Dados inválidos." }, 400); }
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const topic = typeof input.topic === "string" ? input.topic : "dia-a-dia";
  const mood = typeof input.mood === "string" ? input.mood : "";
  const city = typeof input.city === "string" ? input.city.trim() : "";
  const isAnonymous = input.is_anonymous !== false;
  const displayName = isAnonymous ? "Pessoa anônima" : (typeof input.display_name === "string" ? input.display_name.trim() : "");
  const avatar = typeof input.avatar_emoji === "string" ? input.avatar_emoji : "🌿";
  const theme = typeof input.theme === "string" ? input.theme : "sage";
  if (!body || body.length > 1200 || city.length > 80 || !allowedTopics.has(topic) || !allowedMoods.has(mood) || !allowedThemes.has(theme) || displayName.length < 2 || displayName.length > 32) {
    return json({ error: "Confira o texto e as opções do relato." }, 400);
  }
  if (typeof input.photo_base64 === "string" && input.photo_base64.length > 5_600_000) return json({ error: "A foto passou do limite permitido." }, 400);
  if (typeof input.photo_base64 === "string" && input.photo_base64 && input.photo_no_minors_confirmed !== true) {
    return json({ error: "Confirme que a foto não mostra menores, nudez, violência nem pessoas sem autorização." }, 400);
  }

  let photoBytes: Uint8Array | null = null;
  let photoType: string | null = null;
  if (typeof input.photo_base64 === "string" && input.photo_base64) {
    photoType = typeof input.photo_type === "string" ? input.photo_type : "";
    if (!allowedTypes[photoType]) return json({ error: "Formato de foto não permitido." }, 400);
    try { photoBytes = Uint8Array.from(atob(input.photo_base64), c => c.charCodeAt(0)); }
    catch { return json({ error: "Não consegui ler a foto." }, 400); }
    if (photoBytes.length > 4 * 1024 * 1024) return json({ error: "A foto pode ter no máximo 4 MB." }, 400);
  }

  async function moderate(inputValue: unknown): Promise<Record<string, boolean> | null> {
    try {
      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "omni-moderation-latest", input: inputValue }),
      });
      if (!response.ok) {
        console.error("Falha na análise automática:", response.status);
        return null;
      }
      const result = (await response.json())?.results?.[0];
      return result?.categories && typeof result.categories === "object" ? result.categories : null;
    } catch (error) {
      console.error("Falha de conexão com a análise automática:", error);
      return null;
    }
  }
  const textCategories = await moderate(body);
  if (!textCategories) return json({ error: "A análise automática não respondeu. Tente novamente mais tarde; o conteúdo não foi enviado." }, 503);
  const textBlocked = blockedTextCategories.some(category => textCategories[category] === true);
  let imageBlocked = false;
  if (photoBytes && photoType && typeof input.photo_base64 === "string") {
    const imageCategories = await moderate([{
      type: "image_url", image_url: { url: `data:${photoType};base64,${input.photo_base64}` },
    }]);
    if (!imageCategories) return json({ error: "A análise da foto não respondeu. Tente novamente mais tarde; o conteúdo não foi enviado." }, 503);
    imageBlocked = blockedImageCategories.some(category => imageCategories[category] === true);
  }
  if (textBlocked || imageBlocked) {
    return json({ blocked: true, error: "O texto ou a foto pode não ser adequado para este espaço. Revise o relato ou remova a foto e tente novamente." }, 200);
  }

  const postId = crypto.randomUUID();
  let imagePath: string | null = null;
  // Current Supabase secret keys belong in apikey, never in Authorization.
  const headers = { apikey: adminKey };
  if (photoBytes && photoType) {
    imagePath = `${user.id}/${postId}.${allowedTypes[photoType]}`;
    const upload = await fetch(`${supabaseUrl}/storage/v1/object/community-photos/${imagePath}`, {
      method: "POST", headers: { ...headers, "Content-Type": photoType, "x-upsert": "false" }, body: photoBytes,
    });
    if (!upload.ok) {
      console.error("Falha ao guardar foto do relato:", upload.status);
      return json({ error: "Não consegui guardar a foto. Tente enviar sem ela ou tente novamente." }, 500);
    }
  }

  const record = {
    id: postId, user_id: user.id, body, topic, city, mood, image_path: imagePath,
    display_name: displayName, avatar_emoji: avatar, theme, is_anonymous: isAnonymous, status: "pending",
  };
  const insert = await fetch(`${supabaseUrl}/rest/v1/community_posts`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(record),
  });
  if (!insert.ok) {
    if (imagePath) await fetch(`${supabaseUrl}/storage/v1/object/community-photos/${imagePath}`, { method: "DELETE", headers });
    console.error("Falha ao guardar relato:", insert.status);
    return json({ error: "Não consegui salvar o relato. Tente novamente." }, 500);
  }
  return json({ ok: true, message: "Relato revisado automaticamente e enviado para revisão humana." });
});
