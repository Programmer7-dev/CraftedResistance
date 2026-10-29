/**
 * Crafted Resistance shop Worker.
 *
 * The static GitHub Pages site cannot hold a Stripe secret or verify a payment. This Worker is
 * the only place that talks to Stripe with the secret key:
 *
 *   POST /api/checkout      creates a Checkout Session with a server-side price
 *   POST /api/entitlements  lists paid purchases for an installation
 *   POST /api/claim         marks a purchase delivered (idempotent)
 *   GET  /api/session       reads a session for the thank-you page
 *   GET  /api/download      reads the per-device download total
 *   POST /api/download      counts one download, at most once per device
 *   POST /api/stripe-webhook verifies Stripe's signature and stores the entitlement
 *
 * The client sends a player id and a random claim key. Only a SHA-256 hash of
 * player + ":" + key is stored, so a database leak does not expose a usable key.
 *
 * Bindings:
 *   ENTITLEMENTS        KV namespace
 *   DOWNLOADS           KV namespace (download counter; may be the same namespace)
 *   STRIPE_SECRET_KEY   secret
 *   STRIPE_WEBHOOK_SECRET secret
 *   SITE_URL            variable, e.g. https://programmer7-dev.github.io/CraftedResistance
 */

const CATALOG = {
    URANIUM_10: {
        name: "10 Uranium",
        amount: 199,
        kind: "BLOCK_PACK",
        block: "URANIUM",
        count: 10
    },
    WEAPON_HAMMER: {name: "Hammer", amount: 299, kind: "WEAPON", weapon: "HAMMER"},
    WEAPON_GUN: {name: "Gun", amount: 299, kind: "WEAPON", weapon: "GUN"},
    WEAPON_CRYO_LAUNCHER: {name: "Cryo Launcher", amount: 299, kind: "WEAPON", weapon: "CRYO_LAUNCHER"},
    WEAPON_PLASMA_CANNON: {name: "Plasma Cannon", amount: 399, kind: "WEAPON", weapon: "PLASMA_CANNON"},
    WEAPON_SONIC_PULSE_CANNON: {
        name: "Sonic Pulse Cannon", amount: 399, kind: "WEAPON", weapon: "SONIC_PULSE_CANNON"
    },
    WEAPON_PARTICLE_BEAM: {name: "Particle Beam", amount: 399, kind: "WEAPON", weapon: "PARTICLE_BEAM"},
    WEAPON_VOID_LAUNCHER: {name: "Void Launcher", amount: 499, kind: "WEAPON", weapon: "VOID_LAUNCHER"},
    WEAPON_NANITE_LAUNCHER: {name: "Nanite Launcher", amount: 499, kind: "WEAPON", weapon: "NANITE_LAUNCHER"},
    WEAPON_ANTIMATTER_GUN: {name: "Antimatter Gun", amount: 599, kind: "WEAPON", weapon: "ANTIMATTER_GUN"},
    WEAPON_ANTIMATTER_BLADE: {
        name: "Antimatter Blade", amount: 599, kind: "WEAPON", weapon: "ANTIMATTER_BLADE"
    }
};

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = url.origin;

        if (request.method === "OPTIONS") {
            return new Response(null, {status: 204, headers: corsHeaders(env)});
        }

        try {
            if (url.pathname === "/" && request.method === "GET") {
                return text("Crafted Resistance shop is running.", 200, env);
            }
            if (url.pathname === "/api/checkout" && request.method === "POST") {
                return checkout(request, env, origin);
            }
            if (url.pathname === "/api/entitlements" && request.method === "POST") {
                return entitlements(request, env);
            }
            if (url.pathname === "/api/claim" && request.method === "POST") {
                return claim(request, env);
            }
            if (url.pathname === "/api/session" && request.method === "GET") {
                return sessionStatus(request, env);
            }
            if (url.pathname === "/api/download") {
                if (request.method === "GET") return downloadTotal(env);
                if (request.method === "POST") return recordDownload(request, env);
                return text("ERR METHOD NOT ALLOWED", 405, env);
            }
            if (url.pathname === "/api/stripe-webhook" && request.method === "POST") {
                return stripeWebhook(request, env);
            }
            return text("NOT FOUND", 404, env);
        } catch (error) {
            console.error("shop worker error", error && error.stack ? error.stack : error);
            return text("ERR SHOP ERROR", 500, env);
        }
    }
};

function catalogItem(sku) {
    return typeof sku === "string" && Object.prototype.hasOwnProperty.call(CATALOG, sku)
        ? CATALOG[sku] : null;
}

async function checkout(request, env, origin) {
    const form = await request.formData();
    const player = String(form.get("player") || "").trim();
    const key = String(form.get("key") || "").trim();
    const sku = String(form.get("sku") || "").trim();
    const port = clampPort(String(form.get("port") || "0"));
    const item = catalogItem(sku);

    if (!isPlayer(player) || !isClaimKey(key)) {
        return text("ERR INVALID INSTALLATION", 400, env);
    }
    if (!item) {
        return text("ERR UNKNOWN ITEM", 400, env);
    }
    if (!env.STRIPE_SECRET_KEY) {
        return text("ERR SHOP IS NOT CONFIGURED", 503, env);
    }

    const claimHash = await sha256Hex(player + ":" + key);
    const site = siteUrl(env);
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("client_reference_id", player);
    body.set("success_url",
        site + "/shop-thanks.html?session_id={CHECKOUT_SESSION_ID}&port=" + port
        + "&api=" + encodeURIComponent(origin));
    body.set("cancel_url", site + "/shop.html?cancelled=1");
    body.set("allow_promotion_codes", "true");
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", "usd");
    body.set("line_items[0][price_data][unit_amount]", String(item.amount));
    body.set("line_items[0][price_data][product_data][name]", item.name);
    body.set("metadata[sku]", sku);
    body.set("metadata[player]", player);
    body.set("metadata[claim_hash]", claimHash);
    body.set("payment_intent_data[metadata][sku]", sku);
    body.set("payment_intent_data[metadata][player]", player);
    body.set("payment_intent_data[metadata][claim_hash]", claimHash);

    const session = await stripe(env, "checkout/sessions", body);
    if (!session || !session.url) {
        return text("ERR STRIPE DID NOT RETURN A CHECKOUT URL", 502, env);
    }
    return text("OK " + session.url, 200, env);
}

async function entitlements(request, env) {
    const form = await request.formData();
    const player = String(form.get("player") || "").trim();
    const key = String(form.get("key") || "").trim();
    if (!isPlayer(player) || !isClaimKey(key)) {
        return text("ERR INVALID INSTALLATION", 400, env);
    }
    if (!env.ENTITLEMENTS) {
        return text("ERR SHOP STORAGE IS NOT CONFIGURED", 503, env);
    }

    const claimHash = await sha256Hex(player + ":" + key);
    const prefix = "ent:" + player + ":";
    const lines = [];
    let cursor = undefined;
    do {
        const options = {prefix};
        if (cursor) options.cursor = cursor;
        const page = await env.ENTITLEMENTS.list(options);
        for (const listKey of page.keys) {
            const record = await env.ENTITLEMENTS.get(listKey.name, {type: "json"});
            if (!record || !record.paid || !record.claimHash) continue;
            if (!safeEqual(record.claimHash, claimHash)) continue;
            if (!record.sessionId || !catalogItem(record.sku)) continue;
            lines.push(record.sessionId + "|" + record.sku);
        }
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    // The game keeps its own delivered-session list, so returning paid purchases even after a
    // previous claim lets a reinstall restore them without handing out duplicates.
    return text("OK\n" + lines.join("\n"), 200, env);
}

async function claim(request, env) {
    const form = await request.formData();
    const player = String(form.get("player") || "").trim();
    const key = String(form.get("key") || "").trim();
    const sessionId = String(form.get("session") || "").trim();
    if (!isPlayer(player) || !isClaimKey(key) || !isSessionId(sessionId)) {
        return text("ERR INVALID REQUEST", 400, env);
    }
    if (!env.ENTITLEMENTS) {
        return text("ERR SHOP STORAGE IS NOT CONFIGURED", 503, env);
    }

    const claimHash = await sha256Hex(player + ":" + key);
    const storageKey = "ent:" + player + ":" + sessionId;
    let record = await env.ENTITLEMENTS.get(storageKey, {type: "json"});
    if (!record) {
        return text("ERR PURCHASE NOT FOUND", 404, env);
    }
    if (!record.claimHash || !safeEqual(record.claimHash, claimHash)) {
        return text("ERR NOT YOUR PURCHASE", 403, env);
    }

    // The webhook normally sets paid. If it has not arrived yet, ask Stripe directly; a forged
    // request still cannot make an unpaid session paid.
    if (!record.paid) {
        if (!env.STRIPE_SECRET_KEY) {
            return text("ERR PAYMENT NOT CONFIRMED", 402, env);
        }
        const session = await stripe(env, "checkout/sessions/" + encodeURIComponent(sessionId), null, "GET");
        if (!sessionIsPaidFor(session, player, claimHash)) {
            return text("ERR PAYMENT NOT CONFIRMED", 402, env);
        }
        record.paid = true;
        record.amount = session.amount_total || 0;
        record.currency = session.currency || "usd";
        await env.ENTITLEMENTS.put(storageKey, JSON.stringify(record));
    }

    if (!record.delivered) {
        record.delivered = true;
        record.deliveredAt = new Date().toISOString();
        await env.ENTITLEMENTS.put(storageKey, JSON.stringify(record));
    }
    return text("OK " + record.sku, 200, env);
}

async function sessionStatus(request, env) {
    const url = new URL(request.url);
    const sessionId = String(url.searchParams.get("session_id") || "").trim();
    if (!isSessionId(sessionId)) {
        return json({paid: false, error: "INVALID SESSION"}, 400, env);
    }
    if (!env.STRIPE_SECRET_KEY) {
        return json({paid: false, error: "SHOP NOT CONFIGURED"}, 503, env);
    }
    const session = await stripe(env, "checkout/sessions/" + encodeURIComponent(sessionId), null, "GET");
    return json({
        paid: isPaidStatus(session),
        status: session.payment_status || session.status || "unknown",
        sku: session.metadata && session.metadata.sku ? session.metadata.sku : null,
        amount: session.amount_total || 0,
        currency: session.currency || "usd"
    }, 200, env);
}

async function stripeWebhook(request, env) {
    if (!env.STRIPE_WEBHOOK_SECRET) {
        return text("ERR WEBHOOK NOT CONFIGURED", 503, env);
    }
    const signature = request.headers.get("stripe-signature");
    if (!signature) return text("ERR MISSING SIGNATURE", 400, env);

    const payload = await request.text();
    if (!(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
        return text("ERR BAD SIGNATURE", 400, env);
    }

    let event;
    try {
        event = JSON.parse(payload);
    } catch (ignored) {
        return text("ERR BAD PAYLOAD", 400, env);
    }

    if (event.type === "checkout.session.completed"
        || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data && event.data.object;
        if (isPaidStatus(session)) {
            await recordPaidSession(env, session);
        }
    }
    return text("OK", 200, env);
}

async function recordPaidSession(env, session) {
    const metadata = session.metadata || {};
    const player = String(metadata.player || session.client_reference_id || "").trim();
    const sku = String(metadata.sku || "").trim();
    const claimHash = String(metadata.claim_hash || "").trim();
    if (!isPlayer(player) || !catalogItem(sku) || claimHash.length !== 64) {
        console.error("paid session missing complete metadata", session.id);
        return;
    }
    if (!env.ENTITLEMENTS) {
        throw new Error("ENTITLEMENTS is not bound");
    }
    const storageKey = "ent:" + player + ":" + session.id;
    const existing = await env.ENTITLEMENTS.get(storageKey, {type: "json"});
    if (existing) return;   // webhooks are delivered more than once
    const record = {
        sessionId: session.id,
        player,
        sku,
        claimHash,
        paid: true,
        delivered: false,
        amount: session.amount_total || 0,
        currency: session.currency || "usd",
        createdAt: new Date().toISOString()
    };
    await env.ENTITLEMENTS.put(storageKey, JSON.stringify(record));
}

function isPaidStatus(session) {
    return !!session
        && (session.payment_status === "paid"
            || session.payment_status === "no_payment_required");
}

function sessionIsPaidFor(session, player, claimHash) {
    const metadata = session.metadata || {};
    return isPaidStatus(session)
        && session.client_reference_id === player
        && metadata.claim_hash
        && safeEqual(String(metadata.claim_hash), claimHash)
        && metadata.player === player;
}

/* ---------- download counter ----------
   The page is static, so the Worker keeps the total. The browser sends one random id
   per device; only its SHA-256 hash is stored, so the KV record cannot be turned back
   into anything that identifies a visitor. A device that has already been recorded is
   never counted again, which makes the total "downloads, once per device". */
const DOWNLOAD_TOTAL_KEY = "downloads:total";
const DOWNLOAD_DEVICE_PREFIX = "downloads:device:";

function downloadStore(env) {
    // A separate namespace is tidier, but falling back to ENTITLEMENTS means the
    // counter works without any extra setup. Keys are prefixed, so they cannot clash.
    return env.DOWNLOADS || env.ENTITLEMENTS || null;
}

async function downloadTotal(env) {
    const store = downloadStore(env);
    if (!store) return json({count: 0, error: "DOWNLOAD STORAGE NOT CONFIGURED"}, 503, env);
    return json({count: await readDownloadTotal(store)}, 200, env);
}

async function recordDownload(request, env) {
    const store = downloadStore(env);
    if (!store) return json({count: 0, error: "DOWNLOAD STORAGE NOT CONFIGURED"}, 503, env);

    let body;
    try {
        body = await request.json();
    } catch (ignored) {
        return json({count: await readDownloadTotal(store), error: "BAD PAYLOAD"}, 400, env);
    }

    const device = String((body && body.device) || "").trim();
    const build = String((body && body.build) || "").slice(0, 64);

    if (!isDeviceId(device)) {
        return json({count: await readDownloadTotal(store), error: "INVALID DEVICE"}, 400, env);
    }

    const deviceKey = DOWNLOAD_DEVICE_PREFIX + await sha256Hex("download-device:" + device);
    const seen = await store.get(deviceKey);
    if (seen) {
        return json({count: await readDownloadTotal(store), counted: false}, 200, env);
    }

    await store.put(deviceKey, JSON.stringify({
        firstSeen: new Date().toISOString(),
        build: build || null
    }));

    const count = await readDownloadTotal(store) + 1;
    await store.put(DOWNLOAD_TOTAL_KEY, String(count));
    return json({count, counted: true}, 200, env);
}

async function readDownloadTotal(store) {
    const raw = await store.get(DOWNLOAD_TOTAL_KEY);
    const total = Number(raw);
    return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}

function isDeviceId(value) {
    return typeof value === "string" && /^[A-Za-z0-9-]{16,64}$/.test(value);
}

async function stripe(env, path, body, method) {
    if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
    const options = {
        method: method || "POST",
        headers: {Authorization: "Bearer " + env.STRIPE_SECRET_KEY}
    };
    if (body) {
        options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        options.body = body.toString();
    }
    const response = await fetch("https://api.stripe.com/v1/" + path, options);
    let data;
    try {
        data = await response.json();
    } catch (ignored) {
        throw new Error("Stripe returned invalid JSON");
    }
    if (!response.ok) {
        const message = data && data.error && data.error.message
            ? data.error.message : "Stripe request failed";
        throw new Error(message);
    }
    return data;
}

async function verifyStripeSignature(payload, header, secret) {
    let timestamp = null;
    const signatures = [];
    for (const part of header.split(",")) {
        const split = part.indexOf("=");
        if (split < 0) continue;
        const name = part.slice(0, split).trim();
        const value = part.slice(split + 1).trim();
        if (name === "t") timestamp = value;
        if (name === "v1") signatures.push(value);
    }
    if (!timestamp || signatures.length === 0) return false;
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) return false;
    const expected = await hmacHex(secret, timestamp + "." + payload);
    for (const signature of signatures) {
        if (safeEqual(signature, expected)) return true;
    }
    return false;
}

async function sha256Hex(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return hex(new Uint8Array(digest));
}

async function hmacHex(secret, value) {
    const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(secret),
        {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
    return hex(new Uint8Array(signature));
}

function hex(bytes) {
    let out = "";
    for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
    return out;
}

function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function isPlayer(value) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

function isClaimKey(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

function isSessionId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

function clampPort(value) {
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : 0;
}

function siteUrl(env) {
    const configured = env.SITE_URL || "https://programmer7-dev.github.io/CraftedResistance";
    return configured.replace(/\/+$/, "");
}

function corsHeaders(env) {
    let allowed = siteUrl(env);
    try {
        allowed = new URL(allowed).origin;
    } catch (ignored) {
        // keep the raw value if SITE_URL is somehow not a full URL
    }
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };
}

function text(body, status, env, extra) {
    return new Response(body, {
        status,
        headers: Object.assign({
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
        }, corsHeaders(env), extra || {})
    });
}

function json(body, status, env) {
    return new Response(JSON.stringify(body), {
        status,
        headers: Object.assign({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }, corsHeaders(env))
    });
}
