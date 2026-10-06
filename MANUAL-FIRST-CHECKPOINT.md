# Little Labels: manual-first translation slice

Local draft only, October 6, 2026. Built on production build 116 / commit f34ad509134a3ddb09c44f32c5754aae6acff771. Original source and reviewed credit-system archives remain intact. This candidate is not published or safe to deploy as a complete commercial release.

## Scope completed

- Type a Label accepts English and optional manually entered second-language wording; Review does not call AI and does not require a translated line
- Typing, single-label review edits and settings changes cannot dispatch translation through either the old base functions or the language patch
- Manual wording, unfinished draft navigation and English-only save semantics are preserved
- AI translation has a separate, explicitly priced “AI Translate · Uses 1 Credit” button. One label into one language costs one approved credit. The visible priced button is the user's action consent; there is no redundant confirmation modal
- The action validates a server-shaped quote, captures account/session/draft/input/navigation/save identity, uses a stable UUID, and blocks repeat dispatch while an operation is pending
- Lost responses, timeout and reload recover/check that same operation rather than starting a new AI call. The recovery journal stores account/operation IDs only, never label text, translations, photos, balances or credentials
- Late results cannot overwrite manual edits, a newer draft, another account or a captured save. A completed result that no longer matches its original context remains discoverable from either panel, with explicit “Use Recovered Translation” or “Keep My Wording” actions
- Invalid quotes, missing/failed recovery storage, zero balance and unavailable AI infrastructure leave manual creation available. A missing optional credit script cannot break the manual workflow

## Approved commercial policy

User approval at 2026-10-06 01:06:56 UTC: translation 1 credit per label/one language; product wording 1 including optional initial translation; photo identification 3 including English wording and optional initial translation; each new low-quality 1024×1024 generated image 10. List translation is 1 credit per label. Manual operations use 0. Background-removal price remains pending its licensing/provider choice.

User approval at 01:07:59 UTC: a provider-billed but unusable result returns customer credits; the business absorbs the supplier cost. Usable billable completion charges once even if not saved/printed. Unknown outcomes remain held pending reconciliation; no blind replay or double billing.

Full non-AI app access is a separate $2.99 one-time purchase. AI Credit Packs are separate one-time $4.99/1,000 or $9.99/2,000 purchases. There is no trial, starter-credit bundle, $0.99 refill or subscription.

Only the translation unit appears in this new client slice. Historical local catalog/SQL/payment fixtures are preserved and still contain superseded terms; they must not be deployed unchanged.

## Deliberate integration boundary

The new client accepts only window.LittleLabelsCreditTestTransport with kind: 'synthetic-test'. No production endpoint or provider adapter is configured, and it never falls back to littleLabelsAIFetch or the existing unmetered translation endpoint.

Without that synthetic transport, the candidate explains that AI credits are not connected in this local test build and the teacher can type manually. It does not pretend to have a live balance or offer a nonfunctional payment button. Full production credit integration remains a later release gate.

Synthetic transport contract:
- balance({ownerAccountId}) returns accountId, available_credits and reserved_credits as nonnegative safe integers
- quote({ownerAccountId, action:'translation', labels:[english], language}) returns those wallet fields plus action, units:1, credits:1, english, language and catalogVersion
- execute adds operationId, confirmedCredits:1, explicitAction:true and catalogVersion. The real server must derive its authoritative owner from verified authentication, never trust this client owner field, and verify current entitlement, balance, input fingerprint, catalog and quotas atomically
- status({ownerAccountId, operationId}) is read-only and must not dispatch a provider call
- Operation responses include accountId, operationId, state and current wallet fields. settled includes action:'translation', units:1, credits:1 and result:{english,language,translation}; refunded includes credits:0. reserved/in_flight/uncertain retain the recovery pointer
- Quote/balance/status waits are bounded at 15 seconds; execute waits at 45 seconds. A client timeout does not abort, refund or replay supplier work

The production server must implement authoritative usage/charge/refund/reconciliation semantics. This client fixture is not proof of ledger atomicity, hosted authorization, provider receipts or payment fulfillment.

## Verification

Run npm test for the aggregate and npm run test:manual-first for the focused slice. The focused suite comprises 12 implementation tests and 22 independently authored adversarial cases.

Independent review found and retested three repairs: completed results disappearing across Type→Review navigation, manual second wording disappearing on English-only roundtrip, and a missing optional credit asset blocking manual creation. Final independent suite: 22/22 passed.

The former automatic-translation tests in tests/workflow-ui.cjs were replaced with manual-first assertions; equivalent explicit paid-action race coverage lives in the two new translation suites. Existing account/save/print/layout/security tests remain in the aggregate.

A real Chromium test was added for 390px and 1280px widths with all external I/O intercepted, but browser launch is blocked in this environment: process_singleton socket() returned Operation not permitted. No screenshot or pixel/browser pass is claimed. The script is tests/manual-translation-browser.cjs and is included in test:browser for a suitable approved environment.

An earlier baseline aggregate was killed at the database stage, exit 137. A later isolated retry passed all 87 PostgreSQL/RLS checks. Final aggregate status is recorded in the adjacent release manifest/log after verification completes. Isolated PGlite coverage does not establish concurrent hosted PostgreSQL behavior.

## Next bounded chunk

Separate $2.99 base-entitlement fulfillment from positive-credit grants in the local payment/ledger contract. Preserve exactly-once account binding and signed-webhook evidence; add tests for base-only zero-credit purchase, credit-only packs, duplicate/lost/out-of-order payment events and owner-account isolation. Keep live Stripe, credentials, migrations and deployment outside that chunk.

After that, wire a tested translation server adapter with server-enforced entitlement/credits, bounded inputs/output budgets, result recovery, approved refunds and provider reconciliation. Only then can this frontend use real AI credits.

Other manual-first gaps remain intentionally outside this slice: Photo/Gallery identification requirement, Product Link import/retry coupling, product review automatic translation, list translation/picture integration and background-removal licensing. All are release blockers before publishing a paid commercial app.

Additional commercial gates: branded One Little Teacher/Little Labels reset email, fresh sign-in verification after password reset, policies/disclosures/support, security advisors, PWA version references, and approved hosting/SMTP/DNS/credential setup. The user verified reset-email delivery and setting a new password; fresh sign-in was not explicitly confirmed; no related account or infrastructure settings were changed here.
