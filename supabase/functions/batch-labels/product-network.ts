import { isIP } from "node:net";

// Only public HTTPS websites, with each connection pinned to its validated DNS
// answer. Never resolve a name, validate it, then pass the name to fetch().
export class ProductInputError extends Error {}
export function productUrl(value: unknown, base?: string): URL {
  if (typeof value !== "string" || !value.trim() || value.length > 4096 || /[\x00-\x20\x7f\\]/.test(value)) {
    throw new ProductInputError("Use a public HTTPS product page link.");
  }
  let url: URL;
  try { url = base ? new URL(value, base) : new URL(value); }
  catch { throw new ProductInputError("Use a public HTTPS product page link."); }
  url.hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") || host.length > 253 ||
      !host.split(".").every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(host) || host.endsWith(".home.arpa")) {
    throw new ProductInputError("Use a public HTTPS product page link; local addresses, sign-in details and custom ports are not supported.");
  }
  url.hash = "";
  return url;
}

function ipv4Number(ip: string): number {
  return ip.split(".").reduce((n, octet) => n * 256 + Number(octet), 0);
}
function inV4(ip: number, base: string, bits: number): boolean {
  return Math.floor(ip / 2 ** (32 - bits)) === Math.floor(ipv4Number(base) / 2 ** (32 - bits));
}
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    const denied: [string, number][] = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["168.63.129.16", 32], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
      ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
    ];
    return !denied.some(([base, bits]) => inV4(value, base, bits));
  }
  if (family !== 6 || address.includes("%") || address.includes(".")) return false;
  const halves = address.toLowerCase().split("::"), left = halves[0].split(":").filter(Boolean);
  const right = (halves[1] || "").split(":").filter(Boolean);
  const words = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  const value = words.reduce((n, word) => (n << 16n) | BigInt(parseInt(word, 16)), 0n);
  const inRange = (base: bigint, bits: number) => value >> BigInt(128 - bits) === base >> BigInt(128 - bits);
  // Fail closed outside global unicast; also exclude IETF special-purpose,
  // documentation and 6to4 ranges (which can embed a private IPv4 destination).
  return inRange(0x20000000000000000000000000000000n, 3) &&
    !inRange(0x20010000000000000000000000000000n, 23) &&
    !inRange(0x20010db8000000000000000000000000n, 32) &&
    !inRange(0x20020000000000000000000000000000n, 16) &&
    !inRange(0x3fff0000000000000000000000000000n, 20);
}

export type Address = { address: string; family: number };
type NetworkResult = { status: number; headers: Record<string, string | string[] | undefined>; bytes: Uint8Array };
const TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 3;
const HEADER_BYTES = 16384;

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) { reject(new Error("Product request timed out.")); return; }
    const timer = setTimeout(() => reject(new Error("Product request timed out.")), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
export async function publicAddress(url: URL, remaining = TIMEOUT_MS): Promise<Address> {
  if (remaining <= 0) throw new Error("Product request timed out.");
  const host = productUrl(url.href).hostname;
  const query = async (family: 4 | 6): Promise<Address[]> => {
    try {
      const records = await Deno.resolveDns(host, family === 4 ? "A" : "AAAA");
      return records.map(address => ({ address, family }));
    } catch (error) {
      // NODATA/NXDOMAIN is normal for a missing address family. Other resolver
      // failures must not silently turn a partly checked answer into success.
      if (error instanceof Deno.errors.NotFound) return [];
      throw new Error("Product website DNS could not be verified.");
    }
  };
  const answers = (await timeout(Promise.all([query(4), query(6)]), remaining)).flat();
  if (!answers.length || answers.length > 64 || answers.some(answer =>
    isIP(answer.address) !== answer.family || !isPublicAddress(answer.address))) {
    throw new ProductInputError("This product link does not lead to a public website.");
  }
  return answers.find(answer => answer.family === 4) || answers[0];
}

type Socket = { read(buffer: Uint8Array): Promise<number | null>; write(buffer: Uint8Array): Promise<number>; close(): void };
const contentError = () => new Error("Product content could not be safely downloaded.");
const incompleteError = () => new Error("Product content was incomplete.");
const tooLargeError = () => new Error("Product content is too large.");
function closeSocket(socket?: Socket) { try { socket?.close(); } catch { /* Already consumed by startTls or closed. */ } }

// A deliberately narrow, one-response HTTP/1 client. No pooling, upgrades,
// compression, authentication or implicit redirects. All framing is bounded.
class HttpReader {
  private buffer = new Uint8Array(8192);
  private offset = 0;
  private length = 0;
  private socket: Socket;
  constructor(socket: Socket) { this.socket = socket; }
  private async fill(): Promise<boolean> {
    if (this.offset < this.length) return true;
    let emptyReads = 0;
    do {
      if (++emptyReads > 32) throw incompleteError();
      const n = await this.socket.read(this.buffer);
      if (n === null) return false;
      if (!Number.isInteger(n) || n < 0 || n > this.buffer.length) throw contentError();
      this.offset = 0; this.length = n;
    } while (!this.length);
    return true;
  }
  async line(limit: number): Promise<{ text: string; size: number }> {
    if (limit < 2) throw contentError();
    const bytes: number[] = [];
    while (bytes.length < limit) {
      if (!await this.fill()) throw incompleteError();
      const byte = this.buffer[this.offset++];
      bytes.push(byte);
      if (byte === 10) {
        if (bytes.length < 2 || bytes[bytes.length - 2] !== 13) throw contentError();
        return { text: String.fromCharCode(...bytes.slice(0, -2)), size: bytes.length };
      }
      if (bytes.length > 1 && bytes[bytes.length - 2] === 13) throw contentError();
    }
    throw contentError();
  }
  async take(maximum: number): Promise<Uint8Array | null> {
    if (!await this.fill()) return null;
    const count = Math.min(maximum, this.length - this.offset);
    const bytes = this.buffer.slice(this.offset, this.offset + count);
    this.offset += count;
    return bytes;
  }
}
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
function headerField(line: string): [string, string] {
  const colon = line.indexOf(":");
  if (colon < 1 || !TOKEN.test(line.slice(0, colon))) throw contentError();
  const value = line.slice(colon + 1);
  if (/[^\t\x20-\x7e\x80-\xff]/.test(value)) throw contentError();
  return [line.slice(0, colon).toLowerCase(), value.trim()];
}
async function readHttpResponse(socket: Socket, maxBytes: number): Promise<NetworkResult> {
  const reader = new HttpReader(socket);
  let headerBudget = HEADER_BYTES, status = 0, protocol = "";
  let headers: NetworkResult["headers"] = Object.create(null);
  for (let interim = 0; ; interim++) {
    const statusLine = await reader.line(headerBudget); headerBudget -= statusLine.size;
    const match = /^(HTTP\/1\.[01]) ([1-5][0-9]{2})(?: [\x20-\x7e\x80-\xff]*)?$/.exec(statusLine.text);
    if (!match) throw contentError();
    protocol = match[1]; status = Number(match[2]); headers = Object.create(null);
    while (true) {
      const line = await reader.line(headerBudget); headerBudget -= line.size;
      if (!line.text) break;
      const [key, value] = headerField(line.text), previous = headers[key];
      if (previous !== undefined) {
        if (["content-length", "transfer-encoding", "content-type", "content-encoding", "location"].includes(key)) throw contentError();
        headers[key] = [...(Array.isArray(previous) ? previous : [previous]), value];
      } else headers[key] = value;
    }
    if (status >= 200) break;
    if (status === 101 || interim >= 3 || headers["content-length"] || headers["transfer-encoding"]) throw contentError();
  }
  const lengthHeader = headers["content-length"], transfer = headers["transfer-encoding"];
  if (transfer !== undefined && (typeof transfer !== "string" || transfer.toLowerCase() !== "chunked" || protocol !== "HTTP/1.1" || lengthHeader !== undefined)) throw contentError();
  let declaredLength: number | undefined;
  if (lengthHeader !== undefined) {
    if (typeof lengthHeader !== "string" || !/^[0-9]+$/.test(lengthHeader) || !Number.isSafeInteger(Number(lengthHeader))) throw contentError();
    declaredLength = Number(lengthHeader);
  }
  if ([301, 302, 303, 307, 308].includes(status)) return { status, headers, bytes: new Uint8Array() };
  const encoding = headers["content-encoding"];
  if (status !== 200 || (encoding !== undefined && (typeof encoding !== "string" || encoding.toLowerCase() !== "identity"))) throw contentError();
  if (declaredLength !== undefined && declaredLength > maxBytes) throw tooLargeError();
  // Keep retained storage bounded even when a server drips one byte per read.
  // Retaining each read as a separate array can amplify a 6 MB body enormously.
  const body = new Uint8Array(declaredLength ?? maxBytes); let size = 0;
  const append = (bytes: Uint8Array) => {
    if (size + bytes.length > body.length) throw tooLargeError();
    body.set(bytes, size); size += bytes.length;
  };
  const exact = async (count: number) => {
    while (count > 0) {
      const bytes = await reader.take(count);
      if (!bytes) throw incompleteError();
      append(bytes); count -= bytes.length;
    }
  };
  if (transfer !== undefined) {
    let framingBudget = 65536, chunkCount = 0;
    while (true) {
      if (++chunkCount > 8192) throw contentError();
      const line = await reader.line(Math.min(1024, framingBudget)); framingBudget -= line.size;
      // Extensions are not needed by this importer. Reject rather than parse
      // ambiguous quoted/escaped framing from an untrusted server.
      if (!/^[0-9a-fA-F]+$/.test(line.text) || line.text.length > 12) throw contentError();
      const length = parseInt(line.text, 16);
      if (length > maxBytes - size) throw tooLargeError();
      if (!length) {
        // No trailing metadata may override the validated response headers.
        const end = await reader.line(Math.min(HEADER_BYTES, framingBudget));
        if (end.text) throw contentError();
        break;
      }
      await exact(length);
      const end = await reader.line(2); framingBudget -= end.size;
      if (end.text) throw contentError();
    }
  } else if (declaredLength !== undefined) {
    await exact(declaredLength);
  } else {
    for (;;) {
      const bytes = await reader.take(Math.min(8192, maxBytes - size + 1));
      if (!bytes) break;
      append(bytes);
    }
  }
  if (!size) throw incompleteError();
  return { status, headers, bytes: body.subarray(0, size) };
}

// Deno's native TLS primitive preserves the already pinned TCP destination.
// https.request's servername/lookup options are not supported by Supabase's
// vendored Node HTTP polyfill. Never substitute fetch(hostname) here.
export function requestPinned(url: URL, address: Address, maxBytes: number, ms: number, kind: "page" | "image"): Promise<NetworkResult> {
  return new Promise((resolve, reject) => {
    let socket: Socket | undefined, expired = false;
    if (ms <= 0) { reject(new Error("Product request timed out.")); return; }
    const timer = setTimeout(() => {
      expired = true; closeSocket(socket); reject(new Error("Product request timed out."));
    }, ms);
    const run = async () => {
      url = productUrl(url.href);
      if (isIP(address.address) !== address.family || !isPublicAddress(address.address)) throw new ProductInputError("This product link does not lead to a public website.");
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 6000000) throw contentError();
      try {
        const tcp = await Deno.connect({ hostname: address.address, port: 443, transport: "tcp" });
        socket = tcp;
        // connect() cannot be aborted in this runtime. Its eventual socket is
        // still closed even if the caller has already timed out.
        if (expired) { closeSocket(tcp); throw new Error("Product request timed out."); }
        const tls = await Deno.startTls(tcp, { hostname: url.hostname, alpnProtocols: ["http/1.1"] });
        socket = tls;
        if (expired) { closeSocket(tls); throw new Error("Product request timed out."); }
        const handshake = await tls.handshake();
        if (handshake.alpnProtocol && handshake.alpnProtocol !== "http/1.1") throw contentError();
        if (expired) throw new Error("Product request timed out.");
      } catch {
        throw new Error(expired ? "Product request timed out." : "Product website could not be reached securely.");
      }
      const request = new TextEncoder().encode([
        `GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.hostname}`,
        "User-Agent: LittleLabels-ProductImport/1.0", "Accept-Encoding: identity", "Connection: close",
        `Accept: ${kind === "page" ? "text/html,application/xhtml+xml" : "image/png,image/jpeg,image/webp,image/gif"}`,
        "Accept-Language: en-US,en;q=0.9", "", "",
      ].join("\r\n"));
      let written = 0;
      while (written < request.length) {
        const count = await socket!.write(request.subarray(written));
        if (!Number.isInteger(count) || count <= 0 || count > request.length - written) throw contentError();
        written += count;
      }
      return await readHttpResponse(socket!, maxBytes);
    };
    run().then(resolve, reject).finally(() => { clearTimeout(timer); closeSocket(socket); });
  });
}
export async function fetchProductContent(value: string, kind: "page" | "image", initialAddress?: Address) {
  let url = productUrl(value);
  const deadline = Date.now() + TIMEOUT_MS, seen = new Set<string>();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (seen.has(url.href)) throw new Error("Product website has a redirect loop.");
    seen.add(url.href);
    const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) throw new Error("Product request timed out."); return ms; };
    const address = hop === 0 && initialAddress ? initialAddress : await publicAddress(url, remaining());
    const result = await requestPinned(url, address, kind === "page" ? 1500000 : 6000000, remaining(), kind);
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const location = result.headers.location;
      if (hop === MAX_REDIRECTS || typeof location !== "string" || !location) throw new Error("Product website redirected too many times.");
      url = productUrl(location, url.href); continue;
    }
    const type = String(result.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (kind === "page" && !["text/html", "application/xhtml+xml"].includes(type)) throw new Error("The product link did not return a web page.");
    return { ...result, type, url: url.href };
  }
  throw new Error("Product website redirected too many times.");
}

// Structural checks bound decoder work and reject masquerading/truncated files.
// These are not a full raster decoder; the UI must also handle decode failure.
export function imageMime(bytes: Uint8Array): string {
  if (bytes.length > 6000000) return "";
  const ascii = (offset: number, count: number) => String.fromCharCode(...bytes.subarray(offset, offset + count));
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const le16 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8;
  const le24 = (offset: number) => le16(offset) | bytes[offset + 2] << 16;
  const le32 = (offset: number) => (le24(offset) + bytes[offset + 3] * 16777216) >>> 0;
  const be16 = (offset: number) => bytes[offset] * 256 + bytes[offset + 1];
  const be32 = (offset: number) => bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
  const dimensions = (width: number, height: number) => width > 0 && height > 0 && width <= 10000 && height <= 10000 && width * height <= 25000000;
  if (bytes.length >= 45 && starts([137,80,78,71,13,10,26,10])) {
    let offset = 8, count = 0, hasData = false;
    while (offset + 12 <= bytes.length && ++count <= 8192) {
      const length = be32(offset), type = ascii(offset + 4, 4), end = offset + 12 + length;
      if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return "";
      if (count === 1) {
        if (type !== "IHDR" || length !== 13 || !dimensions(be32(offset + 8), be32(offset + 12))) return "";
        const depths: Record<number, number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
        if (!depths[bytes[offset + 17]]?.includes(bytes[offset + 16]) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) return "";
      } else if (type === "IHDR") return "";
      if (type === "IDAT" && length) hasData = true;
      if (type === "IEND") return length === 0 && hasData && end === bytes.length ? "image/png" : "";
      if (type === "acTL" || type === "fcTL" || type === "fdAT") return ""; // Animated PNG is outside this importer.
      if (type[0] === type[0].toUpperCase() && !["IHDR", "IDAT", "PLTE"].includes(type)) return "";
      if (type === "PLTE" && (hasData || !length || length > 768 || length % 3)) return "";
      offset = end;
    }
    return "";
  }
  if (bytes.length >= 4 && starts([255,216,255]) && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) {
    let offset = 2, hasFrame = false, count = 0;
    while (offset + 4 <= bytes.length && ++count <= 4096) {
      if (bytes[offset++] !== 255) return "";
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) return "";
      const length = be16(offset);
      if (length < 2 || offset + length > bytes.length - 2) return "";
      if ([0xc0,0xc1,0xc2].includes(marker)) {
        if (hasFrame || length < 8 || ![8,12].includes(bytes[offset + 2]) || !dimensions(be16(offset + 5), be16(offset + 3))) return "";
        const components = bytes[offset + 7];
        if (![1,3,4].includes(components) || length !== 8 + 3 * components) return "";
        hasFrame = true;
      } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker)) return "";
      if (marker === 0xda) {
        const components = bytes[offset + 2];
        return hasFrame && components > 0 && components <= 4 && length === 6 + 2 * components && offset + length < bytes.length - 2 ? "image/jpeg" : "";
      }
      offset += length;
    }
    return "";
  }
  if (bytes.length >= 14 && ["GIF87a","GIF89a"].includes(ascii(0,6))) {
    const width = le16(6), height = le16(8);
    if (!dimensions(width, height)) return "";
    let offset = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0), images = 0, pixels = 0, blocks = 0;
    const skipSubblocks = () => {
      while (offset < bytes.length && ++blocks <= 32768) {
        const length = bytes[offset++];
        if (!length) return true;
        offset += length;
        if (offset > bytes.length) return false;
      }
      return false;
    };
    while (offset < bytes.length && ++blocks <= 32768) {
      const marker = bytes[offset++];
      if (marker === 0x3b) return images > 0 && offset === bytes.length ? "image/gif" : "";
      if (marker === 0x21) { // Extension label, followed by size-prefixed blocks.
        if (offset >= bytes.length) return "";
        offset++;
        if (!skipSubblocks()) return "";
      } else if (marker === 0x2c) {
        if (offset + 9 >= bytes.length || ++images > 100) return "";
        const w = le16(offset + 4), h = le16(offset + 6);
        if (!dimensions(w,h) || le16(offset) + w > width || le16(offset + 2) + h > height) return "";
        pixels += w * h;
        if (pixels > 25000000) return "";
        const flags = bytes[offset + 8]; offset += 9;
        if (flags & 128) offset += 3 * (1 << ((flags & 7) + 1));
        if (offset >= bytes.length || bytes[offset] < 2 || bytes[offset++] > 8 || !skipSubblocks()) return "";
      } else return "";
    }
    return "";
  }
  if (bytes.length >= 26 && ascii(0,4) === "RIFF" && ascii(8,4) === "WEBP" && le32(4) + 8 === bytes.length) {
    let offset = 12, image = false, canvasWidth = 0, canvasHeight = 0, count = 0;
    while (offset + 8 <= bytes.length && ++count <= 8192) {
      const type = ascii(offset,4), length = le32(offset + 4), data = offset + 8, end = data + length + (length & 1);
      if (end > bytes.length) return "";
      let width = 0, height = 0;
      if (type === "VP8X") {
        if (count !== 1 || length !== 10 || bytes[data] & 0xc3 || bytes[data + 1] || bytes[data + 2] || bytes[data + 3]) return "";
        canvasWidth = le24(data + 4) + 1; canvasHeight = le24(data + 7) + 1;
        if (!dimensions(canvasWidth,canvasHeight)) return "";
      } else if (type === "VP8 ") {
        if (length < 10 || bytes[data] & 1 || ascii(data + 3,3) !== String.fromCharCode(0x9d,0x01,0x2a)) return "";
        width = le16(data + 6) & 0x3fff; height = le16(data + 8) & 0x3fff;
      } else if (type === "VP8L") {
        if (length < 5 || bytes[data] !== 0x2f || bytes[data + 4] >> 5) return "";
        width = (le16(data + 1) & 0x3fff) + 1;
        height = ((le24(data + 2) >> 6) & 0x3fff) + 1;
      } else if (type === "ANIM" || type === "ANMF") return "";
      if (type === "VP8 " || type === "VP8L") {
        if (image || !dimensions(width,height) || (canvasWidth && (width !== canvasWidth || height !== canvasHeight))) return "";
        image = true;
      }
      offset = end;
    }
    return offset === bytes.length && image ? "image/webp" : "";
  }
  return "";
}
export async function productImageData(url: string): Promise<string> {
  const result = await fetchProductContent(url, "image"), detected = imageMime(result.bytes);
  if (!detected || result.type !== detected) throw new Error("A supported product photo was not available. Upload a photo instead.");
  let binary = "";
  for (let i = 0; i < result.bytes.length; i += 0x8000) binary += String.fromCharCode(...result.bytes.subarray(i, i + 0x8000));
  return `data:${detected};base64,${btoa(binary)}`;
}
