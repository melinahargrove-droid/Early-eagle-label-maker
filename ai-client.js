// Central request path for all Little Labels AI tools. Never send a draft as a new account.
let littleLabelsAIAuthRevision=0;
document.addEventListener('little-label-auth-updated',()=>{littleLabelsAIAuthRevision++});
async function littleLabelsAIFetch(url,options={}){
  const allowed=['identify-material','translate-label','batch-labels','batch-wording','label-picture'].map(name=>`${SUPABASE_URL}/functions/v1/${name}`);
  if(!allowed.includes(url))throw Error('Unrecognized Little Labels AI endpoint.');
  const owner=currentUser?.id,token=cloudSession?.access_token,revision=littleLabelsAIAuthRevision;
  if(!owner||!token||!userIsPermanent(currentUser))throw Error('Sign in with a permanent account to use Little Labels.');
  const sameIdentity=()=>currentUser?.id===owner&&cloudSession?.access_token===token&&littleLabelsAIAuthRevision===revision&&userIsPermanent(currentUser);
  const headers=new Headers(options.headers||{});
  headers.set('apikey',SUPABASE_PUBLISHABLE_KEY);
  headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(url,{...options,headers});
  if(!sameIdentity())throw Error('Your account changed. Please try again from the current account.');
  // A retry after refresh could accidentally reuse a draft under another account.
  if(response.status===401)throw Error('Your sign-in expired. Sign in again, then retry this tool.');
  // Callers parse asynchronously. Keep the ownership check through response consumption.
  const readJSON=response.json.bind(response);
  response.json=async()=>{const value=await readJSON();if(!sameIdentity())throw Error('Your account changed. Please try again from the current account.');return value};
  return response;
}
