import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authorization = req.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Entre na sua conta para continuar." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !openAiKey) return json({ error: "Função ainda não configurada." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  let payload: { text?: unknown; style?: unknown };
  try { payload = await req.json(); } catch { return json({ error: "Pedido inválido." }, 400); }
  if (typeof payload.text !== "string" || payload.text.trim().length < 1 || payload.text.length > 3000) {
    return json({ error: "O texto precisa ter entre 1 e 3000 caracteres." }, 400);
  }
  const styles: Record<string, string> = {
    acolhimento: "Priorize acolhimento e escuta, sem tentar resolver tudo.",
    reflexao: "Ajude a pessoa a refletir com cuidado sobre o que contou.",
    passo: "Sugira um próximo passo pequeno, seguro e opcional.",
  };
  const style = typeof payload.style === "string" ? styles[payload.style] : undefined;
  if (!style) return json({ error: "Tipo de resposta inválido." }, 400);

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-6-astra",
        store: false,
        instructions: `Você é um assistente de bem-estar que responde em português brasileiro com empatia e linguagem simples. ${style} Não diagnostique, não prescreva tratamento, não substitua terapia nem prometa sigilo absoluto. Faça uma resposta curta, sem julgamentos, e no máximo uma pergunta gentil. Se o texto indicar risco imediato de autoagressão ou perigo, incentive a procurar agora uma pessoa de confiança e serviço de emergência; no Brasil informe SAMU 192 e CVV 188 para apoio emocional. Não tente conduzir uma intervenção de crise sozinho.`,
        input: payload.text.trim(),
        max_output_tokens: 350,
      }),
    });
    if (!aiResponse.ok) return json({ error: "Não foi possível gerar uma resposta agora." }, 502);
    const result = await aiResponse.json();
    const response = result.output?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
      .filter((item: { type?: string }) => item.type === "output_text")
      .map((item: { text?: string }) => item.text || "").join("\n").trim();
    if (!response) return json({ error: "A IA não retornou uma resposta. Tente novamente." }, 502);
    return json({ response });
  } catch {
    return json({ error: "Falha ao contatar o serviço de IA." }, 502);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
