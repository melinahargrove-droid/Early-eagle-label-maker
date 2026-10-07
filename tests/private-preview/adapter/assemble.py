from pathlib import Path
import sys,json,hashlib,re,shutil
source=Path(sys.argv[1]);commit=sys.argv[2]
base=Path(__file__).resolve().parent.parent;dest=base/'dist'
# The only product-code edits are the listed transport/startup/copy substitutions.
# Feature modules stay identical other than removal of the production endpoint.
removed={'commercial-access.js','little-labels-admin.js','onboarding-help.js','pwa-version-fix.js'}
html=(source/'index.html').read_text()
html=re.sub(r'  <link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>\n','',html)
for name in removed: html=re.sub(r'<script src="\./'+re.escape(name)+r'[^\"]*"></script>\n','',html)
startup='''(async()=>{
  const handledRecovery = await startRecoveryFromUrl();
  if(!handledRecovery){
    await initCloud();
  }else{
    cloudStartupPending=false;
    document.dispatchEvent(new CustomEvent('little-label-startup-complete'));
  }
})();'''
assert html.count(startup)==1, 'Product startup changed; re-review adapter insertion'
html=html.replace(startup,"document.addEventListener('DOMContentLoaded',()=>window.LittleLabelsPreview.initialize(),{once:true});")
csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'none'; object-src 'none'; frame-src 'self' blob:; base-uri 'none'; form-action 'none'; manifest-src 'none'"
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="'+csp+'">\n  <meta name="referrer" content="no-referrer">\n  <link rel="icon" href="icon-maskable-safe.svg" type="image/svg+xml">\n  <link rel="stylesheet" href="preview.css">\n  <script src="preview-runtime.js"></script>')
html=html.replace('<title>Little Labels</title>','<title>Little Labels · Private Test Preview</title>')
files=re.findall(r'<script src="\./([^"?]+)',html)
manifest={'product_commit':commit,'original_sha256':{},'served_sha256':{},'excluded_modules':sorted(removed),'adapter':'adapter/preview-runtime.js','scope':'Owner-private browser-only test. No actual customer account, entitlement, credit wallet, AI, purchase, backend or cloud sync.'}
def transform(s):
    return s.replace('https://ctmqvbsjliinlddfolti.supabase.co','/__preview').replace('sb_publishable_AYbs6V2u0qPo-jLTkTFlBQ_1ps7DaZC','preview-no-backend-key').replace('Saved to your account.','Saved only in this browser.').replace('Saved to My Labels in your account.','Saved to My Labels in this browser.')
for name in ['index.html']+files:
    raw=(source/name).read_bytes();manifest['original_sha256'][name]=hashlib.sha256(raw).hexdigest()
    result=transform(html if name=='index.html' else raw.decode())
    (dest/name).write_text(result);manifest['served_sha256'][name]=hashlib.sha256(result.encode()).hexdigest()
for asset in source.glob('*.png'):
    shutil.copyfile(asset,dest/asset.name)
    digest=hashlib.sha256(asset.read_bytes()).hexdigest()
    manifest['original_sha256'][asset.name]=digest;manifest['served_sha256'][asset.name]=digest
for name in ['preview-runtime.js','preview.css']:shutil.copyfile(base/'adapter'/name,dest/name)
shutil.copyfile(source/'icon-maskable-safe.svg',dest/'icon-maskable-safe.svg')
(base/'SOURCE-CHECKPOINT.json').write_text(json.dumps(manifest,indent=2)+'\n')
(base/'README.md').write_text('# Little Labels private manual-photo preview\n\nProduct source: melinahargrove-droid/Early-eagle-label-maker at '+commit+'.\n\nThis separate Site is an isolated browser-only test. The adapter is separate from the app repository. Account login, activation, admin, purchases, AI, cloud saves, service workers and external traffic are disabled. The original product workflow uses the adapter for localStorage reads and transactional save responses. No credit balance is invented. Photos remain in the current browser; this is not a backup. Storage failures fail visibly without claiming a successful save.\n\nSOURCE-CHECKPOINT.json records original and served file hashes. Deploy only after implementation-worker approval. No production app changes or merges occur here.\n')
print(json.dumps({'copied_modules':len(files),'product_commit':commit,'output':str(dest)}))
