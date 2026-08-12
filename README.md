# Meridian Billing

A fictional demo application used as an AegisRunner testing target (no third-party IP).

## What it exercises

```
MERIDIAN BILLING — subscriptions with a STATE MACHINE and DERIVED recurring revenue.

  STATE MACHINE   a subscription moves trial -> active -> canceled. Only the
                  allowed transitions exist; the buttons shown depend on state.
  DERIVED MRR     monthly recurring revenue is the sum of the plan price of
                  every ACTIVE subscription — nobody types it. A bug that keeps
                  a canceled subscription in the total is a silent money bug.
  PERSISTENCE     a new subscription must survive an independent re-read.

Env-gated faults (healthy when DEMO_BUGS is empty):
  ghostsub        activating returns success but the subscription never persists
  staleMrr        MRR keeps counting a subscription after it is canceled
  deadcancel      the Cancel button renders but posting it does nothing
```

## Run

```sh
docker build -t demo-billing .
docker run -p 3000:3000 -e DEMO_RESET_TOKEN=changeme demo-billing
```

Fault injection is env-gated via `DEMO_BUGS` (comma-separated); healthy when empty. Reset via `POST /api/reset` with header `X-Reset-Token`.
