// Early Eagle Label Maker
// Supabase Edge Function: translate-label

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

    const { english } = await req.json();

    if (!english || typeof english !== "string" || !english.trim()) {
      return new Response(JSON.stringify({ error: "English wording is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: `Translate this preschool classroom bin-label wording into natural, concise Spanish.

English label: ${english.trim()}

Rules:
- Return only the Spanish label wording.
- Keep it short enough for a classroom label.
- Use natural classroom Spanish rather than a word-for-word translation.
- Do not translate brand names unless a conventional Spanish form exists.`
          }]
        }]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: result?.error?.message || "Translation request failed."
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spanish = result.output
      ?.flatMap((item: any) => item.content || [])
      ?.find((content: any) => content.type === "output_text")
      ?.text?.trim();

    if (!spanish) throw new Error("No Spanish translation was returned.");

    return new Response(JSON.stringify({ success: true, spanish }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Translation failed."
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
