import { requireLittleLabelsAccess, consumeLittleLabelsQuota } from "../_shared/access.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LANGUAGE_NAMES: Record<string,string> = {
  es: "Spanish", fr: "French", ar: "Arabic", zh: "Chinese", vi: "Vietnamese",
  de: "German", it: "Italian", pt: "Portuguese", ko: "Korean", ja: "Japanese",
  ht: "Haitian Creole"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
const accessDenied = await requireLittleLabelsAccess(req); if (accessDenied) return accessDenied;

  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
    const body = await req.json();
    const english = body?.english;
    const targetCode = String(body?.target_language || body?.language || "es").toLowerCase();
    const requestedName = String(body?.targetLanguage || "").trim();
    const targetName = LANGUAGE_NAMES[targetCode] || requestedName;

    if (!english || typeof english !== "string" || !english.trim()) {
      return new Response(JSON.stringify({ error: "English wording is required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!targetName || targetCode === "none") {
      return new Response(JSON.stringify({ success: true, translation: "", language: targetCode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const quotaDenied=await consumeLittleLabelsQuota(req,'text');if(quotaDenied)return quotaDenied;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        input: [{ role: "user", content: [{ type: "input_text", text: `Translate this preschool classroom label wording from English into natural, concise ${targetName}.\n\nEnglish label: ${english.trim()}\n\nRules:\n- Return only the ${targetName} label wording.\n- Keep it short enough for a classroom label.\n- Use natural classroom wording rather than a literal word-for-word translation.\n- Do not translate brand names unless a conventional ${targetName} form exists.\n- Do not add quotation marks, explanations, or alternate versions.` }] }]
      })
    });
    const result = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: result?.error?.message || "Translation request failed." }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const translation = result.output?.flatMap((item: any) => item.content || [])?.find((content: any) => content.type === "output_text")?.text?.trim();
    if (!translation) throw new Error(`No ${targetName} translation was returned.`);

    const payload: Record<string,unknown> = { success: true, translation, language: targetCode, language_name: targetName };
    if (targetCode === "es") payload.spanish = translation;
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Translation failed." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
