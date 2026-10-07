import { fetchProductContent, productUrl, isPublicAddress } from '../supabase/functions/batch-labels/product-network.ts';
function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }
const dns: string[] = [], tcp: unknown[] = [], tls: unknown[] = [], writes: string[] = [];
const native = { resolveDns: Deno.resolveDns, connect: Deno.connect, startTls: Deno.startTls };
const html = '<html><title>Synthetic Blocks</title></html>';
let readOffset = 0, closed = false, handshakes = 0;
const bytes = new TextEncoder().encode(`HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${html.length}\r\nConnection: close\r\n\r\n${html}`);
const socket = { async read(buffer: Uint8Array) { if (readOffset === bytes.length) return null; const n = Math.min(7, buffer.length, bytes.length - readOffset); buffer.set(bytes.subarray(readOffset, readOffset + n)); readOffset += n; return n; }, async write(buffer: Uint8Array) { writes.push(new TextDecoder().decode(buffer)); return buffer.length; }, close() { closed = true; }, async handshake() { handshakes++; return { alpnProtocol: 'http/1.1' }; } };
try {
  Object.assign(Deno, {
    resolveDns: async (host: string, kind: string) => { dns.push(`${host}:${kind}`); return kind === 'A' ? ['93.184.216.34'] : []; },
    connect: async (options: unknown) => { tcp.push(options); return socket; },
    startTls: async (connection: unknown, options: unknown) => { assert(connection === socket, 'TLS must wrap the pinned socket'); tls.push(options); return socket; },
  });
  const result = await fetchProductContent('https://shop.example.com/product', 'page');
  assert(new TextDecoder().decode(result.bytes) === html, 'Body must survive partial network reads');
  assert(JSON.stringify(tcp) === JSON.stringify([{ hostname: '93.184.216.34', port: 443, transport: 'tcp' }]), 'Connect uses numeric approved address');
  assert((tls[0] as {hostname:string}).hostname === 'shop.example.com', 'TLS certificate name is the canonical hostname');
  assert(handshakes === 1 && closed, 'Handshake and socket cleanup both happen');
  assert(dns.length === 2, 'Only initial A and AAAA DNS lookups; no rebinding lookup');
  assert(writes.join('').includes('Host: shop.example.com\r\n') && !writes.join('').includes('Authorization'), 'Fixed safe outbound headers');
  assert(!isPublicAddress('169.254.169.254') && !isPublicAddress('168.63.129.16') && !isPublicAddress('::ffff:127.0.0.1'), 'Metadata and mapped addresses are denied');
  let rejected = false; try { productUrl('https://127.0.0.1'); } catch { rejected = true; } assert(rejected, 'IP URLs are denied before sockets');
  console.log(`PASS native Deno ${Deno.version.deno} mocked DNS/TCP/TLS/partial HTTP read; zero network permissions granted`);
} finally { Object.assign(Deno, native); }
