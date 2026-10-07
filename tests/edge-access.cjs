const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
const root = path.resolve(__dirname, '..');
const slugs = ['identify-material', 'translate-label', 'batch-wording', 'label-picture', 'batch-labels'];
const modes = ['list', 'list_wording', 'url', 'url_photo', 'image'];
const routes = slugs.flatMap(slug => slug === 'batch-labels' ? modes.map(mode => ({slug, mode})) : [{slug}]);
const fixture = {
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==',
  webp: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/vz0AAA=',
  gif: 'R0lGODdhAgACAIEAAP///wAAAAAAAAAAACwAAAAAAgACAAAIBgABCAQQEAA7',
  jpeg: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=='
};
const imageData = (kind = 'png', bytes) => `data:image/${kind};base64,${bytes ? Buffer.from(bytes).toString('base64') : fixture[kind]}`;
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers: {'Content-Type':'application/json', ...headers}});
const output = value => ({output:[{content:[{type:'output_text', text:typeof value === 'string' ? value : JSON.stringify(value)}]}]});
const compiled = new Map();
function source(relative) {
  if (!compiled.has(relative)) {
    const raw = fs.readFileSync(path.join(root, 'supabase/functions', relative), 'utf8');
    const clean = stripTypeScriptTypes(raw.replace(/^import[^;]+;\s*/gm, '')).replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const))/g, '');
    compiled.set(relative, new vm.Script(clean, {filename:relative}));
  }
  return compiled.get(relative);
}
const defaultUser = () => ({id:'synthetic-owner-id', email:'synthetic-owner@example.com', is_anonymous:false, email_confirmed_at:'2024-01-01T00:00:00Z', confirmed_at:'2024-01-01T00:00:00Z'});
const defaultPayload = route => ({english:'Blocks', imageDataUrl:imageData(), target_language:'es', language:'es', mode:route.mode || 'list_wording', url:'https://retailer.example.com/product', items:['Blocks']});
async function invoke(route, options = {}) {
  if (typeof route === 'string') route = {slug:route};
  const {slug, mode} = route, scenario = options.scenario || 'valid';
  const payload = {...defaultPayload(route), ...options.payload};
  const calls = [], providers = [], pages = [], images = [], timeoutValues = [], timers = [];
  let handler, authCount = 0, accessCount = 0, adminCount = 0, bodyReads = 0;
  const context = {
    Request, Response, Headers, AbortController, URL, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder, ReadableStream,
    btoa, atob, console, DOMException, isIP:require('node:net').isIP,
    AbortSignal:{timeout(ms) {timeoutValues.push(ms); return AbortSignal.timeout(options.timerCap ? Math.min(ms, options.timerCap) : ms);}},
    setTimeout(fn, ms) {timers.push(ms); return setTimeout(fn, options.timerCap ? Math.min(ms, options.timerCap) : ms);}, clearTimeout,
    Deno:{env:{get:key => ({SUPABASE_URL:'https://supabase.test', SUPABASE_ANON_KEY:'public-test-key', OPENAI_API_KEY:'mock-only-key', ...options.env}[key])}, serve:fn => {handler=fn;},
      resolveDns:async () => {throw Error('Live DNS is forbidden in endpoint tests');}, connect:async () => {throw Error('Live network is forbidden in endpoint tests');}},
    fetch:async (url, init = {}) => {
      url = String(url); calls.push({url, init});
      const headers = new Headers(init.headers);
      if (url.startsWith('https://supabase.test/')) {
        assert.equal(headers.get('Authorization'), 'Bearer synthetic-token');
        assert.equal(headers.get('apikey'), 'public-test-key');
        assert.ok(init.signal, 'Auth and quota requests must have a deadline');
      }
      if (url.endsWith('/auth/v1/user')) {
        authCount++;
        if (options.auth) return options.auth({count:authCount, init});
        if (scenario === 'auth-down') throw Error('Synthetic auth outage');
        if (['invalid', 'expired'].includes(scenario) || scenario === 'revoked-auth' && authCount === 2) return json({}, 401);
        if (scenario === 'auth-forbidden') return json({}, 403);
        if (scenario === 'auth-error') return json({}, 500);
        if (scenario === 'auth-invalid-json') return new Response('not json');
        const user = defaultUser();
        if (scenario === 'anonymous') user.is_anonymous = true;
        if (scenario === 'unknown-permanence') delete user.is_anonymous;
        if (scenario === 'missing-user-id') delete user.id;
        if (scenario === 'invalid-user-id') user.id = {};
        if (scenario === 'unconfirmed') {delete user.email_confirmed_at; delete user.confirmed_at;}
        if (scenario === 'invalid-confirmation') {user.email_confirmed_at = 'invalid'; user.confirmed_at = 'invalid';}
        if (scenario === 'banned' || scenario === 'revoked-banned' && authCount === 2) user.banned_until = '2999-01-01T00:00:00Z';
        if (scenario === 'invalid-ban') user.banned_until = 'invalid';
        if (scenario === 'deleted') user.deleted_at = '2024-01-01T00:00:00Z';
        if (scenario === 'forged-flags') {
          user.user_metadata = {is_admin:true, owner:true, role:'owner', paidAI:true, entitlement:'owner', credits:99999};
          user.app_metadata = {is_admin:true, owner:true, role:'owner'};
        }
        return json(user);
      }
      if (url.endsWith('/rpc/little_labels_access_status')) {
        accessCount++;
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body), {});
        if (options.access) return options.access({count:accessCount, init});
        if (scenario === 'status-down') return json({}, 500);
        if (scenario === 'status-invalid-json') return new Response('not json');
        return json({active:!['no-entitlement','base-disabled','cross-owner'].includes(scenario) && !(scenario === 'revoked-base' && accessCount === 2)});
      }
      if (url.endsWith('/rpc/little_labels_admin_status')) {
        adminCount++;
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body), {});
        if (options.admin) return options.admin({count:adminCount, init});
        if (scenario === 'admin-down') throw Error('Synthetic owner check outage');
        if (scenario === 'admin-error') return json({}, 500);
        if (scenario === 'admin-unauthorized') return json({}, 401);
        if (scenario === 'admin-forbidden') return json({}, 403);
        if (scenario === 'admin-invalid-json') return new Response('not json');
        if (scenario === 'admin-missing') return json({});
        if (scenario === 'admin-string') return json({is_admin:'true'});
        if (scenario === 'admin-array') return json([{is_admin:true}]);
        return json({is_admin:!['not-owner','forged-flags','email-only'].includes(scenario) && !(scenario === 'revoked-owner' && adminCount === 2)});
      }
      if (url.endsWith('/rpc/consume_little_labels_ai_quota')) {
        assert.equal(init.method, 'POST');
        assert.equal(JSON.parse(init.body).category_input, slug === 'label-picture' || mode === 'image' ? 'picture' : 'text');
        if (options.quota) return options.quota({init});
        if (scenario === 'quota-down') return json({}, 500);
        if (scenario === 'quota-revoked') return json({allowed:false, reason:'access'});
        if (scenario === 'quota-minute' || scenario === 'quota-day') return json({allowed:false, reason:scenario === 'quota-minute' ? 'minute_limit' : 'daily_limit', retry_after:60});
        return json({allowed:true});
      }
      if (url.startsWith('https://api.openai.com/')) {
        const request = {url, init, payload:JSON.parse(init.body)};
        providers.push(request);
        assert.equal(headers.get('Authorization'), 'Bearer mock-only-key');
        if (options.provider) return options.provider(request);
        if (url.endsWith('/images/generations')) return json({data:[{b64_json:request.payload.output_format === 'webp' ? fixture.webp : fixture.png}]});
        const translation = payload.target_language === 'fr' || payload.language === 'fr' ? 'Blocs' : 'Bloques';
        if (slug === 'translate-label') return json(output(translation));
        if (slug === 'identify-material') return json(output({english:'Blocks', translation, spanish:translation, category:'Toy', confidence:'high', notes:''}));
        if (mode === 'url') return json(output({english:'Blocks', translation}));
        return json(output({items:payload.items.map(() => ({english:'Blocks', translation, spanish:translation}))}));
      }
      throw Error('Unmocked external request forbidden: ' + url);
    },
    __page:async (url, kind) => {
      pages.push({url, kind});
      if (options.page) return options.page({url, kind});
      return {url, bytes:new TextEncoder().encode('<html><title>Synthetic Blocks</title><meta property="og:image" content="https://retailer.example.com/photo.png"></html>')};
    },
    __image:async url => {images.push(url); if (options.image) return options.image(url); return imageData();}
  };
  vm.createContext(context);
  for (const file of ['batch-labels/product-network.ts', '_shared/access.ts', '_shared/ai.ts']) source(file).runInContext(context);
  vm.runInContext('fetchProductContent = __page; productImageData = __image;', context);
  source(`${slug}/index.ts`).runInContext(context);
  const method = options.method || (scenario === 'preflight' ? 'OPTIONS' : scenario === 'wrong-method' ? 'GET' : 'POST');
  const headers = {Authorization:'Bearer synthetic-token', 'Content-Type':'application/json', ...options.headers};
  if (['missing','bad-json-before-auth','apikey-only'].includes(scenario)) delete headers.Authorization;
  if (scenario === 'apikey-only') headers.apikey = 'public-test-key';
  if (scenario === 'basic-auth') headers.Authorization = 'Basic synthetic-token';
  if (scenario === 'empty-bearer') headers.Authorization = 'Bearer ';
  if (scenario === 'forged-flags') Object.assign(headers, {'X-Owner':'true', 'X-Is-Admin':'true', 'X-User-Role':'owner'});
  const body = options.body !== undefined ? options.body : scenario === 'bad-json-before-auth' ? 'not-json' : JSON.stringify(payload);
  const request = new Request(`https://edge.test/${slug}`, {method, headers, ...(method === 'POST' ? {body, ...(body instanceof ReadableStream ? {duplex:'half'} : {})} : {})});
  const originalBody = Object.getOwnPropertyDescriptor(Request.prototype, 'body').get;
  Object.defineProperty(request, 'body', {get() {bodyReads++; return originalBody.call(request);}});
  for (const method of ['json', 'text', 'arrayBuffer', 'formData']) {const original=request[method]; request[method]=function(...args) {bodyReads++; return original.apply(this,args);};}
  const response = await handler(request);
  let result; const raw = await response.text();
  try {result=JSON.parse(raw);} catch {result=raw;}
  return {route, response, result, raw, calls, providers, pages, images, timeoutValues, timers, bodyReads, context,
    quotaCalls:calls.filter(call => call.url.endsWith('/rpc/consume_little_labels_ai_quota')),
    authCount, accessCount, adminCount};
}
function noWork(result, label) {
  assert.equal(result.quotaCalls.length, 0, `${label}: quota must stay untouched`);
  assert.equal(result.providers.length, 0, `${label}: provider must stay untouched`);
  assert.equal(result.pages.length + result.images.length, 0, `${label}: retailer must stay untouched`);
}
async function main() {
  let total = 0;
  const denied = {
    missing:401, 'bad-json-before-auth':401, 'apikey-only':401, 'basic-auth':401, 'empty-bearer':401,
    invalid:401, expired:401, 'auth-forbidden':401, anonymous:403, 'unknown-permanence':403,
    'missing-user-id':403, 'invalid-user-id':403, unconfirmed:403, 'invalid-confirmation':403,
    banned:403, 'invalid-ban':403, deleted:403, 'no-entitlement':403, 'base-disabled':403, 'cross-owner':403,
    'not-owner':403, 'forged-flags':403, 'email-only':403, 'auth-down':503, 'auth-error':503,
    'auth-invalid-json':503, 'status-down':503, 'status-invalid-json':503,
    'admin-down':503, 'admin-error':503, 'admin-unauthorized':401, 'admin-forbidden':503, 'admin-invalid-json':503, 'admin-missing':403, 'admin-string':403, 'admin-array':403,
    'revoked-owner':403, 'revoked-base':403, 'revoked-auth':401, 'revoked-banned':403
  };
  for (const route of routes) {
    const name = route.slug + (route.mode ? ':' + route.mode : '');
    for (const [scenario, status] of Object.entries(denied)) {
      const result = await invoke(route, {scenario, payload:{explicitAction:true, credits:99999, paidAI:true, entitlement:'owner', is_admin:true, owner:true, email:'synthetic-owner@example.com'}});
      assert.equal(result.response.status, status, `${name} ${scenario}: ${result.raw}`);
      noWork(result, `${name} ${scenario}`);
      if (!scenario.startsWith('revoked-')) assert.equal(result.bodyReads, 0, `${name} ${scenario}: deny before parsing body`);
      if (['not-owner','forged-flags','email-only','revoked-owner'].includes(scenario)) assert.equal(result.result.code, 'OWNER_AI_ONLY');
      total++;
    }
    for (const [scenario, status] of Object.entries({valid:200, preflight:200, 'wrong-method':405, 'quota-minute':429, 'quota-day':429, 'quota-down':503, 'quota-revoked':403})) {
      const result = await invoke(route, {scenario});
      assert.equal(result.response.status, status, `${name} ${scenario}: ${result.raw}`);
      if (['preflight','wrong-method'].includes(scenario)) {assert.equal(result.calls.length, 0); assert.equal(result.bodyReads, 0);}
      else {const guardCount = scenario === 'valid' && route.mode === 'url' ? 4 : scenario === 'valid' && route.mode === 'url_photo' ? 3 : 2; assert.equal(result.authCount, guardCount); assert.equal(result.accessCount, guardCount); assert.equal(result.adminCount, guardCount); assert.equal(result.quotaCalls.length, 1);}
      assert.equal(result.providers.length, scenario === 'valid' && route.mode !== 'url_photo' ? 1 : 0, `${name} ${scenario}: provider count`);
      if (scenario !== 'valid') assert.equal(result.pages.length + result.images.length, 0);
      if (status === 429) assert.equal(result.response.headers.get('Retry-After'), '60');
      if (scenario === 'valid' && route.mode === 'url_photo') {
        assert.equal(result.pages.length, 1); assert.equal(result.images.length, 1);
        assert.match(result.result.items[0].photo_data, /^data:image\/png;base64,/);
        for (const key of ['english','translation','spanish']) assert.equal(Object.hasOwn(result.result.items[0], key), false, `url_photo must not supply ${key}`);
      }
      total++;
    }
  }
  console.log(`PASS ${total} owner-only edge access cases across all endpoints and modes; every external call mocked`);
}
module.exports = {invoke, routes, slugs, modes, fixture, imageData, json, output, noWork, source};
if (require.main === module) main().catch(error => {console.error(error); process.exitCode=1;});
