// Every AI endpoint checks a real permanent user and current database entitlement.
// Never use service-role credentials or user-editable metadata for authorization.
export async function requireLittleLabelsAccess(req: Request): Promise<Response | null> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const deny = (status: number, error: string) => new Response(JSON.stringify({success:false,error}), {status,headers});
  if (req.method !== 'POST') return deny(405, 'Use POST for this request.');
  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return deny(401, 'Sign in to use Little Labels.');
  const url = Deno.env.get('SUPABASE_URL');
  const apikey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !apikey) return deny(503, 'Access verification is temporarily unavailable.');
  try {
    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: {apikey, Authorization: authorization}, signal: AbortSignal.timeout(10000),
    });
    if (userResponse.status === 401 || userResponse.status === 403) return deny(401, 'Sign in again to use Little Labels.');
    if (!userResponse.ok) return deny(503, 'Access verification is temporarily unavailable.');
    const user = await userResponse.json();
    if (!user?.id || user.is_anonymous !== false) return deny(403, 'Sign in with a permanent account and activate Little Labels.');
    const accessResponse = await fetch(`${url}/rest/v1/rpc/little_labels_access_status`, {
      method: 'POST', headers: {apikey, Authorization: authorization, 'Content-Type':'application/json'},
      body:'{}', signal:AbortSignal.timeout(10000),
    });
    if (accessResponse.status === 401) return deny(401, 'Sign in again to use Little Labels.');
    if (!accessResponse.ok) return deny(503, 'Access verification is temporarily unavailable.');
    const access = await accessResponse.json();
    if (access?.active !== true) return deny(403, 'Activate this account to use Little Labels.');
    return null;
  } catch {
    return deny(503, 'Access verification is temporarily unavailable.');
  }
}

// Reserve just before the first paid/external operation, after input validation.
// Database row locking serializes requests across all functions and instances.
export async function consumeLittleLabelsQuota(req: Request, category: 'text' | 'picture'): Promise<Response | null> {
  const headers: Record<string,string> = {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Expose-Headers':'Retry-After',
    'Content-Type':'application/json', 'Cache-Control':'no-store',
  };
  const deny=(status:number,error:string)=>new Response(JSON.stringify({success:false,error}),{status,headers});
  const url=Deno.env.get('SUPABASE_URL'),apikey=Deno.env.get('SUPABASE_ANON_KEY');
  if(!url||!apikey)return deny(503,'Usage verification is temporarily unavailable.');
  try {
    const response=await fetch(`${url}/rest/v1/rpc/consume_little_labels_ai_quota`,{
      method:'POST',headers:{apikey,Authorization:req.headers.get('Authorization')||'','Content-Type':'application/json'},
      body:JSON.stringify({category_input:category}),signal:AbortSignal.timeout(10000),
    });
    if(response.status===401)return deny(401,'Sign in again to use Little Labels.');
    if(!response.ok)return deny(503,'Usage verification is temporarily unavailable.');
    const quota=await response.json();
    if(quota?.allowed===true)return null;
    if(quota?.reason==='access')return deny(403,'Activate this account to use Little Labels.');
    if(['daily_limit','minute_limit'].includes(quota?.reason)){
      headers['Retry-After']=String(Math.max(1,Number(quota.retry_after)||60));
      const kind=category==='picture'?'picture':'text and identification';
      return deny(429,quota.reason==='daily_limit'?`This account has reached its daily ${kind} limit. Try again after midnight UTC.`:`This account is making ${kind} requests too quickly. Please wait a minute and try again.`);
    }
    return deny(503,'Usage verification is temporarily unavailable.');
  } catch {return deny(503,'Usage verification is temporarily unavailable.');}
}
