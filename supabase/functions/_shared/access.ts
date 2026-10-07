// Only authenticated, permanent, active owners may use these endpoints. The
// protected self-status RPC checks auth.uid(); client metadata is never authority.
const accessHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
function accessFailure(status: number, error: string, code?: string) {
  return new Response(JSON.stringify({ success: false, error, ...(code ? { code } : {}) }), { status, headers: accessHeaders });
}

// Bound streamed bodies as well as Content-Length. The deadline includes reads,
// not just receipt of response headers. Never retry requests with side effects.
export async function readLimitedJson(source: Request | Response, limit: number, timeoutMs = 5000, signal?: AbortSignal): Promise<any> {
  const length = source.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    void source.body?.cancel().catch(() => {});
    throw new Error('The response or request is too large.');
  }
  if (!source.body) throw new Error('A JSON body is required.');
  const reader = source.body.getReader(), bytes = new Uint8Array(limit);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let size = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error('The request timed out.')); void reader.cancel().catch(() => {}); }, timeoutMs);
  });
  try {
    if (signal?.aborted) { cancel(); throw new Error('The request was canceled.'); }
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (size + value.byteLength > limit) { void reader.cancel().catch(() => {}); throw new Error('The response or request is too large.'); }
      bytes.set(value, size); size += value.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
}

export async function requireLittleLabelsAccess(req: Request): Promise<Response | null> {
  if (req.method !== 'POST') return accessFailure(405, 'Use POST for this request.');
  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization) || authorization.length > 16384) return accessFailure(401, 'Sign in to use Little Labels.');
  const url = Deno.env.get('SUPABASE_URL'), apikey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !apikey) return accessFailure(503, 'Access verification is temporarily unavailable.');
  try {
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey, Authorization: authorization }, signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (userResponse.status === 401 || userResponse.status === 403) return accessFailure(401, 'Sign in again to use Little Labels.');
    if (!userResponse.ok) return accessFailure(503, 'Access verification is temporarily unavailable.');
    const user = await readLimitedJson(userResponse, 65536);
    const confirmed = [user?.confirmed_at, user?.email_confirmed_at, user?.phone_confirmed_at]
      .some(value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now());
    const banned = user?.banned_until != null && (!Number.isFinite(Date.parse(user.banned_until)) || Date.parse(user.banned_until) > Date.now());
    if (typeof user?.id !== 'string' || !user.id || user.is_anonymous !== false || !confirmed || banned || user.deleted_at != null) {
      return accessFailure(403, 'Sign in with a confirmed permanent account and activate Little Labels.');
    }
    for (const name of ['little_labels_access_status', 'little_labels_admin_status']) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey, Authorization: authorization, 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (response.status === 401) return accessFailure(401, 'Sign in again to use Little Labels.');
      if (!response.ok) return accessFailure(503, 'Access verification is temporarily unavailable.');
      const status = await readLimitedJson(response, 65536);
      if (name === 'little_labels_access_status' && status?.active !== true) return accessFailure(403, 'Activate this account to use Little Labels.');
      if (name === 'little_labels_admin_status' && status?.is_admin !== true) return accessFailure(403, 'AI tools are currently available only to the Little Labels owner.', 'OWNER_AI_ONLY');
    }
    return null;
  } catch { return accessFailure(503, 'Access verification is temporarily unavailable.'); }
}

// Keep the existing atomic database quota and its caps unchanged. This is a rate
// limit for owner requests, never a customer credit reservation or debit.
export async function consumeLittleLabelsQuota(req: Request, category: 'text' | 'picture'): Promise<Response | null> {
  const accessDenied = await requireLittleLabelsAccess(req);
  if (accessDenied) return accessDenied;
  const headers = { ...accessHeaders, 'Access-Control-Expose-Headers': 'Retry-After' } as Record<string, string>;
  const deny = (status: number, error: string) => new Response(JSON.stringify({ success: false, error }), { status, headers });
  const url = Deno.env.get('SUPABASE_URL'), apikey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !apikey) return deny(503, 'Usage verification is temporarily unavailable.');
  try {
    const response = await fetch(`${url}/rest/v1/rpc/consume_little_labels_ai_quota`, {
      method: 'POST', headers: { apikey, Authorization: req.headers.get('Authorization') || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_input: category }), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (response.status === 401) return deny(401, 'Sign in again to use Little Labels.');
    if (!response.ok) return deny(503, 'Usage verification is temporarily unavailable.');
    const quota = await readLimitedJson(response, 65536);
    if (quota?.allowed === true) return null;
    if (quota?.reason === 'access') return deny(403, 'Activate this account to use Little Labels.');
    if (['daily_limit', 'minute_limit'].includes(quota?.reason)) {
      headers['Retry-After'] = String(Math.max(1, Math.min(86400, Number(quota.retry_after) || 60)));
      const kind = category === 'picture' ? 'picture' : 'text and identification';
      return deny(429, quota.reason === 'daily_limit' ? `This account has reached its daily ${kind} limit. Try again after midnight UTC.` : `This account is making ${kind} requests too quickly. Please wait a minute and try again.`);
    }
    return deny(503, 'Usage verification is temporarily unavailable.');
  } catch { return deny(503, 'Usage verification is temporarily unavailable.'); }
}
