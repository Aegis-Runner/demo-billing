# Restyle brief — Meridian Billing

> **New look, same behaviour.** This app is an automated-testing **target** for AegisRunner's
> crawler, which grounds real assertions against its DOM and URLs. You may freely replace the CSS,
> the HTML structure, the templating, and even the framework — but every **contract** in
> "Preserve exactly" below must survive unchanged, or the tests that run against this app break silently.

## What this app is (verbatim from `server.js`)
> MERIDIAN BILLING — subscriptions with a STATE MACHINE and DERIVED recurring revenue.
> 
>   STATE MACHINE   a subscription moves trial -> active -> canceled. Only the
>                   allowed transitions exist; the buttons shown depend on state.
>   DERIVED MRR     monthly recurring revenue is the sum of the plan price of
>                   every ACTIVE subscription — nobody types it. A bug that keeps
>                   a canceled subscription in the total is a silent money bug.
>   PERSISTENCE     a new subscription must survive an independent re-read.
> 
> Env-gated faults (healthy when DEMO_BUGS is empty):
>   ghostsub        activating returns success but the subscription never persists
>   staleMrr        MRR keeps counting a subscription after it is canceled
>   deadcancel      the Cancel button renders but posting it does nothing

## Preserve EXACTLY (load-bearing for the crawler)

**Routes** — keep every path + method (paths and `:id` shape are part of the contract):
```
GET  /login
POST /login
GET  /logout
GET  /
GET  /subscriptions
GET  /subscriptions/new
POST /subscriptions/new
GET  /subscriptions/:id
POST /subscriptions/:id/activate
POST /subscriptions/:id/cancel
POST /api/reset
```

**Create → detail flow**
- Create form field `name=` attributes (keep these names): `poref`, `customerId`, `plan`
- On a successful create the server **redirects to the new record's detail URL** (e.g. `/subscriptions/${sid}`) — keep the redirect, not an inline success page.
- The **listing** must render each record's **visible identity** (its ref/name) as a **link to its detail page**.
- A detail URL for a record that does not exist must return **HTTP 404** (not a generic 200).

**Auth** — login form `POST /login` with fields `email` + `password`; session cookie **`billing_session_v1`**; demo creds `ops@meridianbilling.test / ops12345`. Everything except `/login`, `/healthz`, `/api/reset` requires the session.

**Reset + fault injection** — DO NOT remove or rename:
- `POST /api/reset` guarded by request header **`X-Reset-Token`** (default `bil-reset`) → restores seed data.
- `GET /healthz` → `ok`.
- `DEMO_BUGS` env toggles faults: `staleMrr`, `ghostsub`, `deadcancel`. Healthy when empty. Keep **every** `BUGS.has("…")` branch and its exact flag name.

## Free to change
The stylesheet / design system, HTML markup + class names, the templating engine, the framework
(Express → Next / Fastify / Astro / Remix / …), and any client-side interactivity — provided the server
still serves the routes above with the **same field names, redirect targets, visible record identities,
404s, auth, `/api/reset`, `/healthz`, and `DEMO_BUGS` toggles**.

## Ship
- Keep a `Dockerfile` that builds a container listening on `PORT` and serving `/healthz`.
- Push to this repo's own remote: `https://github.com/Aegis-Runner/demo-billing.git`.

---
_Auto-generated from `server.js`; if anything here disagrees with the code, the code wins — re-read it._
