import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireLittleLabelsAccess, consumeLittleLabelsQuota } from '../_shared/access.ts';
import { aiCors, aiJson, aiFailure, readAiBody, aiLanguage, aiItems, requireAiKey, aiMakeWording } from '../_shared/ai.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: aiCors });
  const accessDenied = await requireLittleLabelsAccess(req);
  if (accessDenied) return accessDenied;
  try {
    const body = await readAiBody(req), items = aiItems(body.items), code = aiLanguage(body);
    requireAiKey();
    const quotaDenied = await consumeLittleLabelsQuota(req, 'text');
    if (quotaDenied) return quotaDenied;
    return aiJson({ success: true, items: await aiMakeWording(items, code), target_language: code });
  } catch (error) { return aiFailure(error); }
});
