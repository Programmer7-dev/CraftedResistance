# Crafted Resistance shop backend

This is the Cloudflare Worker that makes automatic purchases possible. The GitHub Pages site is
static: it cannot keep the Stripe secret key, verify a Stripe webhook, or store entitlements. The
Worker does those three things and exposes a tiny text API for the game.

```
game (desktop or Android)
  |  POST /api/checkout   player id + claim key + sku
  v
Worker  ---> Stripe Checkout Session (price is chosen here, not by the browser)
  |
  |  Stripe redirects the browser to shop-thanks.html
  |  Stripe calls POST /api/stripe-webhook
  v
KV entitlement (paid, claim hash, sku, session id)

shop-thanks.html  ---> http://127.0.0.1:<port>/claim  (desktop only)
  |                         |
  |                         v
  |                    game refreshes, delivers, claims
  v
game also polls /api/entitlements while SHOP is open (desktop and Android)
```

## What you need

- A Stripe account with Checkout enabled.
- A Cloudflare account and a KV namespace.
- Node.js 18+ (only for `npx wrangler`; not needed by the game).
- Permission to deploy a Worker. No monthly payment is required for the free Worker/KV tier at
  the volume a small game shop sees.

## 1. Create the KV namespace

From this `shop-worker` folder:

```bash
npx wrangler login
npx wrangler kv namespace create ENTITLEMENTS
```

Copy the `id` into `wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

## 2. Add the Stripe secrets

Use a **test** key first. `STRIPE_SECRET_KEY` starts with `sk_test_` or `sk_live_`.

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

For the webhook secret you need the endpoint first, so deploy now (the secret can be set to any
placeholder and replaced after step 3):

```bash
npx wrangler deploy
```

Wrangler prints a URL such as:

```
https://craftedresistance-shop.your-account.workers.dev
```

That is the **shop API URL**.

## 3. Add the Stripe webhook

In the Stripe Dashboard:

1. Developers -> Webhooks -> Add endpoint.
2. Endpoint URL: `https://<your-worker>/api/stripe-webhook`
3. Events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
4. Copy the signing secret (`whsec_...`) and set it:

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler deploy
```

The Worker verifies the `Stripe-Signature` header and rejects timestamps older than five minutes.
It never trusts a client saying "I paid"; only a signed Stripe event or a direct Stripe API check
can mark a session paid.

## 4. Point the game at the Worker

The game reads the `shopApi` setting from `settings.properties`. Either:

- edit the file and set `shopApi=https://<your-worker>.workers.dev`, or
- launch the game with `-Dcr.shopApi=https://<your-worker>.workers.dev`.

On desktop the file is normally `%USERPROFILE%\.craftedresistance\settings.properties` on
Windows, or `~/.craftedresistance/settings.properties` on macOS and Linux. On Android it is the
app's private files directory (`settings.properties`). The shop shows `SHOP NOT CONFIGURED` until
this value is present.

## 5. Test the flow

1. Run the game with Stripe **test** keys.
2. Pause -> SHOP -> buy 10 Uranium.
3. On the Stripe page use card `4242 4242 4242 4242`, any future expiry and any CVC.
4. Stripe redirects to `shop-thanks.html`.
5. Click **Return to game** (desktop). The local callback server tells the game to check.
6. The shop should show `PURCHASE COMPLETE - ITEM DELIVERED`, and the uranium should be in the
   inventory or on the floor if the inventory was full.
7. Test a weapon, then try buying the same weapon again: the shop should show
   `ALREADY OWNED - IN YOUR INVENTORY` or `IN A CHEST` and require CONFIRM.

You can also open the Worker root URL; it returns `Crafted Resistance shop is running.`.

## 6. Go live

1. Replace `STRIPE_SECRET_KEY` with the live key.
2. Add the same webhook endpoint in live mode and set the live signing secret.
3. Redeploy.
4. Buy one cheap item yourself and verify it arrives.

Never put `sk_live_...` or `whsec_...` in the GitHub Pages repository, in `script.js`, or in the
game. Only `SITE_URL` is public configuration in `wrangler.toml`.

## Prices

The authoritative prices are in `CATALOG` in `worker.js`. The game's `ShopCatalog.java` mirrors
them for display and delivery, and `shop.html` lists them for shoppers. If you change a price,
change all three. Do not rename an existing SKU: it is stored in Stripe metadata and in the KV
entitlement.

Current grouping:

| SKU | Price |
| --- | --- |
| `URANIUM_10` | USD 1.99 |
| `WEAPON_HAMMER`, `WEAPON_GUN`, `WEAPON_CRYO_LAUNCHER` | USD 2.99 |
| `WEAPON_PLASMA_CANNON`, `WEAPON_SONIC_PULSE_CANNON`, `WEAPON_PARTICLE_BEAM` | USD 3.99 |
| `WEAPON_VOID_LAUNCHER`, `WEAPON_NANITE_LAUNCHER` | USD 4.99 |
| `WEAPON_ANTIMATTER_GUN`, `WEAPON_ANTIMATTER_BLADE` | USD 5.99 |

## API (plain text)

All game endpoints are `POST` with `application/x-www-form-urlencoded`.

### `POST /api/checkout`

Fields: `player`, `key`, `sku`, `port` (0 on Android).

Response: `OK <stripe checkout url>` or `ERR <reason>`.

The Worker computes the price, creates the session, and puts the claim hash and SKU in both
`metadata` and `payment_intent_data.metadata`. The game's claim key never appears in the browser.

### `POST /api/entitlements`

Fields: `player`, `key`.

Response:

```
OK
cs_test_...|URANIUM_10
cs_test_...|WEAPON_GUN
```

Only paid sessions whose claim hash matches are returned. The game keeps a local delivered-session
list so a refresh cannot hand out the same item twice.

### `POST /api/claim`

Fields: `player`, `key`, `session`.

Response: `OK <sku>` or `ERR <reason>`. Idempotent. If the webhook has not arrived yet, the Worker
asks Stripe directly before marking the entitlement delivered.

### `GET /api/session?session_id=...`

JSON for the thank-you page: `{paid, status, sku, amount, currency}`.

### `GET /api/download`

JSON: `{count}` — how many devices have been counted.

### `POST /api/download`

JSON body: `{device, build}`. `device` is a random id the downloads page keeps in
`localStorage` (`cr.download.device`); only its SHA-256 hash is stored, so the KV record cannot
identify a visitor. The first request from a device increments the total; later ones return the
same total with `counted: false`.

```json
{"count": 42, "counted": true}
```

The total lives in the KV key `downloads:total`, device records in `downloads:device:<hash>`.
Point the site at the Worker with `CONFIG.downloadApi` in `script.js`; leave it empty to hide the
total. The counter needs either the optional `DOWNLOADS` namespace or the existing
`ENTITLEMENTS` one. KV has no atomic increment, so a sudden burst of first downloads could lose
a count or two; move the counter to a Durable Object if that ever matters.

### `POST /api/stripe-webhook`

Stripe-only. Verifies the signature and writes the entitlement to KV.

## Limits and notes

- The local callback server binds only to `127.0.0.1` on desktop. It is a nudge, not an authority:
  it calls the same refresh endpoint, and the Worker still checks Stripe.
- Android has no loopback server. It opens the browser and picks the purchase up by polling while
  the shop is open (or the next time the shop is opened).
- `success_url` is only a redirect target. A user can visit it manually, but it grants nothing.
- The Worker's free tier is enough for a small shop, but check current Cloudflare and Stripe fees
  before launch.
- Refunds, taxes and chargebacks are handled in Stripe. This code does not implement a refund UI.
