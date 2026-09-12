# ADR 0001: Prepaid credits for AI key takeaways

Date: 2026-09-11
Status: `ready-for-agent` (decisions agreed; implementation pending)

## Context

The three deterministic presets (authors/year, authors/year/title, title) run
entirely in the browser and stay free. The key-takeaway presets call a hosted
language model through the Papername Worker, so they cost money per use. The
Worker, D1 schema, invite-code activation, and a 30-per-month quota exist in
code but have never been deployed. The PRD deferred pricing to after the beta.

This ADR records the decisions from the 2026-09-11 design interview so that
the beta runs on the model that will actually be sold.

## Decisions

### Product

1. Deterministic presets remain free and local. Only the two takeaway presets
   touch the Worker.
2. A fifth preset, `gist` (popup label "Key takeaway"), produces
   `[Key takeaway].pdf`. It falls back to the title, then to the citation,
   using the same ladder as the `title` preset. No new fallback reasons.
3. A key takeaway is a **claim**, not a keyword list: 4–10 English words,
   at most 120 characters, no terminal or path punctuation, no author/year
   repetition. This replaces the 6–12 word rule in the Worker validator, the
   client validator, the eval runner, the PRD, and the popup example.

### Pricing

4. Usage-based, **prepaid credit packs**, one-time purchases, credits never
   expire. Launch sizes: 300 names for about USD 5 and 1500 names for about
   USD 15. No subscriptions, no postpaid metering.
5. **Anonymous trial**: 10 lifetime names per install, provisioned
   automatically on the first takeaway attempt after consent. No code, no
   email. The trial token is the user's identity; purchased and gift keys add
   credits to that same balance.
6. **Gift keys** are issued from the existing invite generator and redeemed
   through the same endpoint as purchased keys, distinguished by prefix. The
   owner's personal unlimited access is a gift key carrying a very large
   credit amount (for example 1,000,000); no special-case code.
7. **Payment rail**: a merchant of record with built-in license keys
   (Lemon Squeezy, Polar, or Gumroad; vendor chosen by comparing the fixed
   per-transaction fee at implementation time). Integration is pull-style:
   the Worker's redeem endpoint validates a key against the merchant's license
   API once, maps the product to a credit amount, marks it activated, and
   stores only a hash. No webhooks, no email provider, no tax filing.
8. **Purchases stay off during the beta.** No buy link, no price copy; the
   coffee-interest button remains the demand signal. The merchant call is
   added only after the PRD retention gate is met.

### Billing rule

9. One credit is **pre-decremented atomically** before the model call.
10. The credit is **refunded** when the provider fails or when the Worker's
    own provider call exceeds 2.5 seconds (the download has already fallen
    back by then). The rule is server-side and trusts nothing from the client.
11. An "insufficient abstract" response **is charged**: the model ran, and
    charging makes junk input consume the caller's own credits rather than
    the owner's provider bill.
12. Cloudflare rate-limiting rules (dashboard, not code): the register
    endpoint per IP per day; the gist endpoint per bearer token per minute
    (about 30).
13. No cross-user server-side cache of takeaways. The "Papername stores
    nothing about your papers" promise stands. Only the per-tab client cache
    exists.

### Speed

14. The takeaway request **starts on download intent**: a pointer press on a
    recognized PDF link or button on a supported page (the Scholar
    `pointerdown` listener is the precedent). The background stores the
    pending promise on the tab's article context; the filename hook reuses it.
    Deadline: about 2.5 seconds from the press. When no press was observed,
    the existing 1.5-second hold from the filename hook applies.
15. A completed takeaway stays attached to the tab context so saving the same
    paper again from a viewer costs nothing and waits for nothing.
16. **Model selection by measurement**, not by name. Bar, in priority order:
    provider p95 under about 1.2 seconds for a ~500-token input and ~30-token
    structured output, measured from a Cloudflare Worker; then the 60-case
    eval at 90% fidelity / 80% usefulness with the 4–10 word rule; then 100%
    format validity; cost is a tiebreaker only. Candidates: the fastest
    non-reasoning OpenAI tier, one or two peers from a fresh search, and one
    or two open models on Workers AI or a fast host. Reasoning stays off. A
    second provider implementation is built only if every OpenAI candidate
    fails the bar. The model name stays in a Worker environment variable.

### Feedback and privacy

17. **In-page toast** from the content script (shadow root), shown only in
    the two takeaway presets, on by default with a popup switch, auto-dismiss
    in about four seconds, never blocks input. Messages:
    - "Preparing key takeaway…" then "Named: <filename>";
    - fallback reasons: no abstract / out of names / took too long, each
      ending "used the title instead";
    - low-balance notice when few names remain (the only upsell surface).
    The toolbar badge is the secondary cue. No OS notifications.
18. **Telemetry off by default.** A token is registered lazily, only when the
    user turns telemetry on or uses a takeaway. Free-preset users who do
    neither never contact the server. Beta testers are asked to switch it on.
19. Consent copy changes from "when you download" to "when you press a PDF
    link", because the request now starts before the download.

## Consequences

- `docs/PRD.md` and `CONTEXT.md` must be updated: preset count, word bounds,
  quota model, invite → key vocabulary, telemetry default, and the removal of
  the "billing is not built" clause in favor of "purchases are switched off".
- The initial D1 migration is rewritten rather than followed by a second one:
  installs/balances, keys (gift or purchase, credit amount, redeemed-by,
  redeemed-at), telemetry counters unchanged; monthly usage removed.
- Worker endpoints become `POST /v1/register`, `POST /v1/redeem`,
  `POST /v1/gist`, `POST /v1/events`. `/v1/activate` is removed.
- Extension: preset `gist`; press trigger and pending-request reuse in the
  decision path; toast; popup "Redeem a key", balance display, toast switch,
  hidden buy link.
- Eval runner: word bounds, per-case latency, multiple candidate models.

## Rejected alternatives

- Subscription with included quota: recurring-billing lifecycle is most of
  the maintenance cost of payments.
- Postpaid metering: unpredictable bills, non-payment risk, invoicing.
- Bring-your-own-API-key as the primary path: zero revenue, technical users
  only. May return later as an escape hatch.
- Page-load prefetch: several times more calls than downloads, unbillable,
  and widens the consent scope to every article page opened.
- Stripe direct: seller-of-record tax obligations for a solo maintainer.
- Cross-user takeaway cache: breaks the no-persistence promise for savings
  that are negligible in dollars.
