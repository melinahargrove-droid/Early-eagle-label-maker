import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireLittleLabelsAccess, consumeLittleLabelsQuota } from '../_shared/access.ts';
import { aiCors, aiJson, aiFailure, readAiBody, aiLanguage, aiLabel, requireAiKey, aiGenerateImage } from '../_shared/ai.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: aiCors });
  const accessDenied = await requireLittleLabelsAccess(req);
  if (accessDenied) return accessDenied;
  try {
    const body = await readAiBody(req), english = aiLabel(body.english, 'English wording');
    aiLanguage(body);
    requireAiKey();
    const quotaDenied = await consumeLittleLabelsQuota(req, 'picture');
    if (quotaDenied) return quotaDenied;
    return aiJson({ success: true, photo_data: await aiGenerateImage(english) });
  } catch (error) { return aiFailure(error); }
});
