import { requireLittleLabelsAccess } from "../_shared/access.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const accessDenied = await requireLittleLabelsAccess(req);
  if (accessDenied) return accessDenied;

  // The existing access RPC verifies only the base app purchase. Its daily quota
  // is rate limiting, not a paid AI credit balance. Until a server-owned paid
  // entitlement, atomic credit reservation, idempotency and settlement/refund
  // operation exists, fail closed. Neither client flags nor base activation may
  // authorize identification. Do not parse/transmit images or consume a quota.
  return new Response(JSON.stringify({
    success: false,
    code: "AI_CREDITS_UNAVAILABLE",
    error: "AI identification is unavailable until paid AI access and credits can be verified. You can still type, save, and print photo labels.",
  }), { status: 503, headers: corsHeaders });
});
