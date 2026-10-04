# Product Link import

Product Link remains available for public HTTPS retailer pages. Every import is a draft for the teacher to review; it is not proof of a retailer's product identity or permission to reuse its artwork.

## Network boundary

- Accept public HTTPS URLs on port 443 only, with no embedded credentials. URL parsing normalizes the hostname and rejects local-use names, numeric IP URL forms, invalid hostnames, controls and backslashes.
- Resolve both IPv4 and IPv6. Reject private, loopback, link-local, metadata, reserved, multicast, documentation, transition and other nonpublic address ranges. A mixed public/private DNS answer fails closed.
- Connect to the validated numeric IP, then negotiate verified TLS for the original hostname on that same socket. The request must not resolve the hostname a second time. The original hostname is used for SNI and Host; no user cookies or authorization headers are forwarded.
- Follow only a bounded set of explicit redirects. Every redirect destination and extracted image uses the same URL, DNS and pinned-connection checks. Relative images resolve against the final page URL.
- Limit redirect depth, elapsed time, HTTP headers and streamed content. Request identity encoding; unsupported compressed responses fail closed. Pages require HTML MIME. Photos require an approved raster MIME matching their content; HTML, SVG, missing MIME and mismatched content are not photos.
- A blank image address stays blank. It must never resolve to and download the product page as an image.

The native Deno transport is intentional. Supabase's vendored Node HTTPS shim does not implement all Node connection options, so resolving DNS before a normal fetch or relying on a custom Node lookup hook does not establish safe IP pinning.

## Wording and review

The frontend sends the selected language code. The backend accepts the same fixed language list as Settings, defaults legacy requests to Spanish, and uses the selected language in a separate instruction from the untrusted product title. English Only forces the second line empty. The existing `spanish` persistence field remains a compatibility slot for the selected second language; no database migration is needed.

Missing or rejected photos remain in review with retry and manual-photo upload. No generated photo is silently substituted, and Product Link does not offer the separately paused representative-picture tool. If a product title cannot be read, a URL-derived draft is explicitly flagged for teacher review. Imported images that fail browser decoding also return to manual-photo review.

Navigation, new drafts, account changes and language changes invalidate outstanding work. Photo retries update the photo while preserving teacher-edited wording. Save retries continue using the existing stable, account-bound snapshot.

## Tests and release

- `npm test`: existing account, print, access and PostgreSQL/RLS tests plus Product Link frontend, endpoint and adversarial transport cases
- `deno run --no-remote --no-npm --no-lock tests/product-link-deno-smoke.ts`: native Deno 2.1.4 mock smoke with no network permission; checks exact socket pinning, TLS hostname/handshake, partial reads and cleanup
- `npm run test:browser`: existing Chromium flows plus mobile Product Link language, retry, upload and stale-navigation tests
- All Product Link security tests use synthetic DNS, TLS/HTTP streams, retailer content and AI responses. No private-network probes, customer content, real AI charges or production test accounts are required
- Deploy only `batch-labels/index.ts`, `batch-labels/product-network.ts` and the unchanged `_shared/access.ts` into the existing project, with JWT verification enabled
- Re-read deployed files and metadata, compare source to the reviewed commit, check unauthenticated/invalid-JWT rejection, and verify the published frontend build

This change does not alter activation, quotas, row-level policies, credentials, renderer geometry or accepted print layout. Security tests and deployed-source verification are not a live paid retailer/AI end-to-end test. Sites may still block automated retrieval; manual-photo fallback is expected in that case.

## References

- [Supabase runtime native network exports](https://github.com/supabase/edge-runtime/blob/main/ext/runtime/js/denoOverrides.js)
- [Supabase HTTP compatibility implementation](https://github.com/supabase/edge-runtime/blob/main/ext/node/polyfills/http.ts)
- [Deno TLS implementation](https://github.com/denoland/deno/blob/v2.1.4/ext/net/ops_tls.rs)
- [IANA IPv4 special-purpose ranges](https://www.iana.org/assignments/iana-ipv4-special-registry/)
- [IANA IPv6 special-purpose ranges](https://www.iana.org/assignments/iana-ipv6-special-registry/)

Import budgets: inbound JSON is capped at 64 KiB with a 5-second read deadline; each page/photo download has a 12-second total deadline, at most three redirects and 16 KiB response headers. HTML is capped at 1.5 MB and raster photos at 6 MB. URL syntax and language are checked before quota reservation. Once DNS/content retrieval begins, that import is an attempted text request and counts against the existing quota even when the retailer is unavailable or rejected.
