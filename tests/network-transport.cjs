const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { isIP } = require('node:net');
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '../supabase/functions/batch-labels/product-network.ts'), 'utf8').replace(/^import[^;]+;\s*/gm, '')).replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const))/g, '');
const address = { address: '93.184.216.34', family: 4 };
const pageUrl = 'https://shop.example.com/products/blocks?q=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const response = (body = '<html>Blocks</html>', headers = {}, status = '200 OK') => {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return Buffer.concat([Buffer.from(`HTTP/1.1 ${status}\r\n${Object.entries({ 'Content-Type': 'text/html', 'Content-Length': bytes.length, ...headers }).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\n`), bytes]);
};
function harness(options = {}) {
  const calls = { dns: [], connects: [], tls: [], writes: [], handshakes: 0, timers: [], sockets: [] };
  let index = 0, now = 0;
  class NotFound extends Error {}
  const Deno = {
    errors: { NotFound },
    resolveDns: async (host, family) => {
      calls.dns.push({ host, family });
      if (options.resolveDns) return options.resolveDns(host, family, NotFound, calls.dns.length);
      return family === 'A' ? [address.address] : ['2606:4700:4700::1111'];
    },
    connect: async connectOptions => {
      calls.connects.push(connectOptions);
      now += options.advanceEachConnect || 0;
      if (options.connectWait) await options.connectWait;
      const data = Buffer.from((options.responses || [options.response || response()])[index++]);
      let offset = 0, closed = false, pending;
      const socket = {
        closeCount: 0,
        close() { this.closeCount++; closed = true; if (pending) pending(new Error('closed')); },
        async write(bytes) {
          assert.ok(calls.handshakes, 'no request sent before verified handshake');
          if (closed) throw new Error('closed');
          const n = Math.min(bytes.length, options.writeSize || bytes.length);
          calls.writes.push(Buffer.from(bytes.subarray(0, n)));
          return n;
        },
        async read(buffer) {
          if (closed) throw new Error('closed');
          if (options.readNever) return new Promise((_r, reject) => { pending = reject; });
          if (offset >= data.length) return null;
          const n = Math.min(buffer.length, options.readSize || buffer.length, data.length - offset);
          buffer.set(data.subarray(offset, offset + n)); offset += n; return n;
        },
        async handshake() { calls.handshakes++; if (options.handshakeWait) await options.handshakeWait; if (options.badCertificate) throw new Error('certificate mismatch'); return { alpnProtocol: 'http/1.1' }; },
      };
      calls.sockets.push(socket); return socket;
    },
    startTls: async (tcp, tlsOptions) => { calls.tls.push(tlsOptions); if (options.tlsWait) await options.tlsWait; return tcp; },
  };
  const ctx = { Deno, isIP, URL, Uint8Array, TextEncoder, TextDecoder, btoa, console,
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, ms) { calls.timers.push(ms); return setTimeout(fn, Math.min(ms, options.timerCap || ms)); }, clearTimeout,
    fetch: () => { throw new Error('Unpinned fetch is forbidden'); },
  };
  vm.createContext(ctx); vm.runInContext(source + '\nglobalThis.api = {ProductInputError, productUrl, isPublicAddress, publicAddress, requestPinned, fetchProductContent, imageMime, productImageData};', ctx);
  return { api: ctx.api, calls };
}
let total = 0;
async function test(name, fn) { await fn(); total++; console.log('PASS ' + name); }
function png(width = 1, height = 1) {
  const chunk = (type, bytes) => { const n = Buffer.alloc(4); n.writeUInt32BE(bytes.length); return Buffer.concat([n, Buffer.from(type), bytes, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.from([1])), chunk('IEND', Buffer.alloc(0))]);
}
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
function jpeg(width = 1, height = 1) {
  return Buffer.from([255,216,255,192,0,11,8,height >> 8,height & 255,width >> 8,width & 255,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
}
function webp(width = 1, height = 1) {
  const frame = Buffer.from([0,0,0,157,1,42,width & 255,width >> 8,height & 255,height >> 8]);
  const out = Buffer.alloc(30); out.write('RIFF'); out.writeUInt32LE(22,4); out.write('WEBPVP8 ',8); out.writeUInt32LE(10,16); frame.copy(out,20); return out;
}
(async () => {
  const { api } = harness();
  for (const value of ['0.0.0.0','10.0.0.1','100.100.100.200','127.0.0.1','168.63.129.16','169.254.169.254','172.31.255.255','192.168.1.2','192.0.0.10','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:7f00:1','64:ff9b::7f00:1','64:ff9b:1::1','100::1','2001::1','2001:db8::1','2002:7f00:1::1','3fff::1','fc00::1','fd00:ec2::254','fe80::1','fec0::1','ff02::1','2606:4700::1%eth0','not-an-ip']) {
    await test('nonpublic IP rejected: ' + value, () => assert.equal(api.isPublicAddress(value), false));
  }
  for (const value of ['93.184.216.34','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888']) await test('public IP allowed: ' + value, () => assert.equal(api.isPublicAddress(value), true));
  await test('URL canonicalization preserves query and removes fragment/default port', () => assert.equal(api.productUrl('https://SHOP.example.com.:443/a?q=1#frag').href, 'https://shop.example.com/a?q=1'));
  for (const url of ['https://[::1]/','https://0177.0.0.1/','https://2130706433/','https://user@shop.example.com/','https://shop.example.com:444/','https://local/','https://host.home.arpa/','file:///etc/passwd','http://shop.example.com/','https://shop.example.com\\@localhost/','https://shop.example.com/\r\nX:bad']) await test('unsafe URL rejected: ' + JSON.stringify(url), () => assert.throws(() => api.productUrl(url)));
  await test('queries both DNS families and chooses validated IPv4', async () => {
    const h = harness(); const result = await h.api.publicAddress(new URL(pageUrl));
    assert.equal(result.address, address.address); assert.equal(h.calls.dns.length,2); assert.deepEqual(h.calls.dns.map(x => x.family), ['A','AAAA']);
  });
  for (const records of [[address.address,'10.0.0.1'],['169.254.169.254'],['168.63.129.16']]) await test('mixed/private DNS answers fail closed ' + records, async () => {
    const h = harness({ resolveDns: async (_host, family) => family === 'A' ? records : [] });
    await assert.rejects(h.api.fetchProductContent(pageUrl,'page'), /public website/); assert.equal(h.calls.connects.length,0);
  });
  await test('private AAAA rejects otherwise public A', async () => {
    const h = harness({ resolveDns: async (_host, family) => family === 'A' ? [address.address] : ['fe80::1'] });
    await assert.rejects(h.api.fetchProductContent(pageUrl,'page'), /public website/); assert.equal(h.calls.connects.length,0);
  });
  await test('DNS family resolver failure is not silently ignored', async () => {
    const h = harness({ resolveDns: async (_host, family) => { if (family === 'AAAA') throw Error('SERVFAIL'); return [address.address]; } });
    await assert.rejects(h.api.fetchProductContent(pageUrl,'page'), /DNS/); assert.equal(h.calls.connects.length,0);
  });
  await test('normal missing DNS family is accepted', async () => {
    const h = harness({ resolveDns: async (_host, family, NotFound) => { if (family === 'AAAA') throw new NotFound(); return [address.address]; } });
    assert.equal((await h.api.publicAddress(new URL(pageUrl))).address,address.address);
  });
  await test('empty and excessive DNS answers rejected', async () => {
    for (const records of [[],Array(65).fill(address.address)]) {
      const h = harness({ resolveDns: async (_host,family) => family === 'A' ? records : [] });
      await assert.rejects(h.api.publicAddress(new URL(pageUrl)), /public website/);
    }
  });
  await test('numeric IP pin survives rebinding; original TLS/Host and no second DNS', async () => {
    const h = harness({ readSize:1, writeSize:3, resolveDns: async (_host,family,_NotFound,count) => count > 2 ? ['127.0.0.1'] : family === 'A' ? [address.address] : [] });
    const result = await h.api.fetchProductContent(pageUrl,'page');
    assert.equal(new TextDecoder().decode(result.bytes),'<html>Blocks</html>'); assert.equal(h.calls.dns.length,2);
    assert.equal(h.calls.connects[0].hostname,address.address); assert.equal(h.calls.connects[0].port,443);
    assert.equal(h.calls.tls[0].hostname,'shop.example.com'); assert.equal(h.calls.tls[0].alpnProtocols.join(','),'http/1.1'); assert.deepEqual(Object.keys(h.calls.tls[0]).sort(),['alpnProtocols','hostname']);
    const sent = Buffer.concat(h.calls.writes).toString(); assert.match(sent,/^GET \/products\/blocks\?q=1 HTTP\/1\.1\r\nHost: shop\.example\.com\r\n/); assert.match(sent,/Accept-Encoding: identity/); assert.match(sent,/Connection: close/); assert.doesNotMatch(sent,/Authorization:|Cookie:/i); assert.ok(h.calls.sockets[0].closeCount);
  });
  await test('public IPv6 is pinned directly without bracket or secondary resolution', async () => {
    const h = harness({ resolveDns: async (_host,family) => family === 'AAAA' ? ['2606:4700::1111'] : [] });
    await h.api.fetchProductContent(pageUrl,'page'); assert.equal(h.calls.connects[0].hostname,'2606:4700::1111');
  });
  await test('unsafe caller-provided initial address cannot bypass public check', async () => {
    const h = harness(); await assert.rejects(h.api.fetchProductContent(pageUrl,'page',{address:'127.0.0.1',family:4}), /public website/); assert.equal(h.calls.connects.length,0);
  });
  await test('certificate failure closes socket before sending any request', async () => {
    const h = harness({ badCertificate:true }); await assert.rejects(h.api.fetchProductContent(pageUrl,'page'), /securely/); assert.equal(h.calls.writes.length,0); assert.ok(h.calls.sockets[0].closeCount);
  });
  await test('valid chunked framing and one-byte partial reads', async () => {
    const h = harness({ readSize:1, response:Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n') });
    assert.equal(new TextDecoder().decode((await h.api.fetchProductContent(pageUrl,'page')).bytes),'abcde');
  });
  await test('connection-close body and bounded interim response are supported', async () => {
    const h = harness({ response:Buffer.from('HTTP/1.1 103 Early Hints\r\nLink: <x>\r\n\r\nHTTP/1.0 200 OK\r\nContent-Type: text/html\r\n\r\nbody') });
    assert.equal(new TextDecoder().decode((await h.api.fetchProductContent(pageUrl,'page')).bytes),'body');
  });
  const malformed = [
    'HTTP/1.1 200 OK\nContent-Length: 1\n\nx',
    'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 1\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n',
    'HTTP/1.0 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nx\r\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nX-Bad: yes\r\n folded\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nContent-Length : 1\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nContent-Length: -1\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nContent-Length: 9007199254740992\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nx',
    'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n',
    'HTTP/1.1 101 Switching Protocols\r\n\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\ng\r\nx\r\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1;unknown=value\r\nx\r\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nx\r\n0\r\nContent-Type: text/html\r\n\r\n',
    'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nxX\n0\r\n\r\n',
    'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Type: image/png\r\n\r\nx',
  ];
  for (const [i, raw] of malformed.entries()) await test('malformed/unsupported HTTP framing rejected ' + i, async () => {
    const h = harness({ response:Buffer.from(raw) }); await assert.rejects(h.api.fetchProductContent(pageUrl,'page')); assert.ok(h.calls.sockets[0].closeCount);
  });
  await test('compressed, non-200, non-HTML, and oversized headers rejected', async () => {
    for (const raw of [response('abc',{'Content-Encoding':'gzip'}),response('abc',{},'403 Forbidden'),response('abc',{'Content-Type':'image/png'}),response('abc',{'X-Large':'x'.repeat(16384)})]) {
      const h=harness({response:raw}); await assert.rejects(h.api.fetchProductContent(pageUrl,'page'));
    }
  });
  await test('declared, chunked, and close-delimited bodies enforce cap before accumulation', async () => {
    for (const raw of [response('abcd'),Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nabcd\r\n0\r\n\r\n'),Buffer.from('HTTP/1.1 200 OK\r\n\r\nabcd')]) {
      const h=harness({response:raw}); await assert.rejects(h.api.requestPinned(new URL(pageUrl),address,3,500,'page'), /too large/);
    }
  });
  await test('redirect normalized, public DNS checked anew, final URL retained', async () => {
    const h=harness({responses:[response('',{'Location':'https://CDN.example.com:443/catalog/photo#frag'},'302 Found'),response('body')]});
    const result=await h.api.fetchProductContent(pageUrl,'page'); assert.equal(result.url,'https://cdn.example.com/catalog/photo'); assert.equal(h.calls.dns.length,4); assert.equal(h.calls.tls[1].hostname,'cdn.example.com');
  });
  await test('relative redirect resolves using current URL', async () => {
    const h=harness({responses:[response('',{'Location':'../next?x=1'},'307 Temporary Redirect'),response('body')]});
    assert.equal((await h.api.fetchProductContent(pageUrl,'page')).url,'https://shop.example.com/next?x=1');
  });
  for(const location of ['https://169.254.169.254/','http://shop.example.com/','https://user:pass@shop.example.com/','https://shop.example.com:8443/']) await test('unsafe redirect target never connected ' + location, async()=>{
    const h=harness({response:response('',{'Location':location},'302 Found')}); await assert.rejects(h.api.fetchProductContent(pageUrl,'page')); assert.equal(h.calls.connects.length,1);
  });
  await test('redirect hostname resolving private is blocked', async()=>{
    const h=harness({responses:[response('',{'Location':'https://internal-alias.example.com/'},'302 Found')],resolveDns:async(host,family)=>family==='AAAA'?[]:host==='shop.example.com'?[address.address]:['10.0.0.1']});
    await assert.rejects(h.api.fetchProductContent(pageUrl,'page'), /public website/); assert.equal(h.calls.connects.length,1);
  });
  await test('redirect loops and more than three redirects rejected', async()=>{
    const loop=harness({response:response('',{'Location':pageUrl},'302 Found')}); await assert.rejects(loop.api.fetchProductContent(pageUrl,'page'),/loop/); assert.equal(loop.calls.connects.length,1);
    const h=harness({responses:[1,2,3,4].map(i=>response('',{'Location':'/page'+i},'302 Found'))}); await assert.rejects(h.api.fetchProductContent(pageUrl,'page'),/too many/); assert.equal(h.calls.connects.length,4);
  });
  await test('one total deadline spans redirects, rather than resetting per hop', async()=>{
    const h=harness({advanceEachConnect:5000,responses:[1,2,3].map(i=>response('',{'Location':'/page'+i},'302 Found'))}); await assert.rejects(h.api.fetchProductContent(pageUrl,'page'),/timed out/); assert.equal(h.calls.connects.length,3); assert.deepEqual(h.calls.timers,[12000,12000,7000,7000,2000,2000]);
  });
  await test('read timeout closes active socket', async()=>{
    const h=harness({readNever:true}); await assert.rejects(h.api.requestPinned(new URL(pageUrl),address,100,5,'page'),/timed out/); assert.ok(h.calls.sockets[0].closeCount);
  });
  await test('late connect after timeout is closed without TLS or request bytes', async()=>{
    let resolve;const wait=new Promise(r=>resolve=r),h=harness({connectWait:wait}); await assert.rejects(h.api.requestPinned(new URL(pageUrl),address,100,5,'page'),/timed out/); resolve();await sleep(5);assert.ok(h.calls.sockets[0].closeCount);assert.equal(h.calls.tls.length,0);assert.equal(h.calls.writes.length,0);
  });
  await test('late TLS after timeout is closed without request bytes', async()=>{
    let resolve;const wait=new Promise(r=>resolve=r),h=harness({tlsWait:wait});await assert.rejects(h.api.requestPinned(new URL(pageUrl),address,100,5,'page'),/timed out/);resolve();await sleep(5);assert.ok(h.calls.sockets[0].closeCount);assert.equal(h.calls.writes.length,0);
  });
  await test('DNS timeout never opens socket',async()=>{
    const h=harness({resolveDns:()=>new Promise(()=>{}),timerCap:5});await assert.rejects(h.api.fetchProductContent(pageUrl,'page'),/timed out/);assert.equal(h.calls.connects.length,0);
  });
  for(const [type,bytes] of [['image/png',png()],['image/jpeg',jpeg()],['image/gif',gif],['image/webp',webp()]]) await test('structural raster type recognized '+type,()=>assert.equal(api.imageMime(bytes),type));
  await test('image MIME must agree with structural detection',async()=>{
    const good=harness({response:response(png(),{'Content-Type':'image/png'})});assert.match(await good.api.productImageData('https://cdn.example.com/photo'),/^data:image\/png;base64,/);
    for(const [bytes,mime] of [[png(),'image/jpeg'],[Buffer.from('<svg/>'),'image/svg+xml'],[Buffer.from('<html/>'),'image/png'],[png(),'application/octet-stream']]){
      const h=harness({response:response(bytes,{'Content-Type':mime})});await assert.rejects(h.api.productImageData('https://cdn.example.com/photo'),/supported product photo/);
    }
  });
  await test('truncated and excessive-dimension rasters rejected',()=>{
    for(const bytes of [png().subarray(0,-1),png(10001,1),png(6000,6000),jpeg(10001,1),jpeg().subarray(0,-1),webp(10001,1),webp().subarray(0,-1),gif.subarray(0,-1),Buffer.from([255,216,255,217])])assert.equal(api.imageMime(bytes),'');
    const largeGif=Buffer.from(gif);largeGif.writeUInt16LE(10001,6);assert.equal(api.imageMime(largeGif),'');
  });
  await test('one-byte reads coalesce into one bounded body buffer',async()=>{
    const text='x'.repeat(100000),raw=Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n'+text);
    const h=harness({response:raw,readSize:1});const result=await h.api.fetchProductContent(pageUrl,'page');
    assert.equal(new TextDecoder().decode(result.bytes),text);
    assert.equal(result.bytes.buffer.byteLength,1500000,'Unknown-length body has one fixed page-cap backing buffer, not retained per-read arrays');
  });
  console.log(`PASS ${total} transport/image cases; all DNS, sockets, TLS, and HTTP are mocked; no network access`);
})().catch(error=>{console.error(error);process.exitCode=1});
