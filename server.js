// MERIDIAN BILLING — subscriptions with a STATE MACHINE and DERIVED recurring revenue.
//
//   STATE MACHINE   a subscription moves trial -> active -> canceled. Only the
//                   allowed transitions exist; the buttons shown depend on state.
//   DERIVED MRR     monthly recurring revenue is the sum of the plan price of
//                   every ACTIVE subscription — nobody types it. A bug that keeps
//                   a canceled subscription in the total is a silent money bug.
//   PERSISTENCE     a new subscription must survive an independent re-read.
//
// Env-gated faults (healthy when DEMO_BUGS is empty):
//   ghostsub        activating returns success but the subscription never persists
//   staleMrr        MRR keeps counting a subscription after it is canceled
//   deadcancel      the Cancel button renders but posting it does nothing
import express from "express";
import cookieParser from "cookie-parser";
import { DatabaseSync } from "node:sqlite";
const app = express();
app.use(express.urlencoded({ extended: true })); app.use(express.json()); app.use(cookieParser());
const BUGS = new Set(String(process.env.DEMO_BUGS || "").split(",").map(s => s.trim()).filter(Boolean));
const RESET_TOKEN = process.env.DEMO_RESET_TOKEN || "bil-reset";
const SESSION = "billing_session_v1";
const USERS = { "ops@meridianbilling.test": { password: "ops12345", name: "Billing Ops" } };
const b64 = s => Buffer.from(String(s)).toString("base64url");
const unb64 = s => { try { return Buffer.from(String(s || ""), "base64url").toString(); } catch { return ""; } };
const currentUser = req => USERS[unb64(req.cookies?.[SESSION])] ? { email: unb64(req.cookies[SESSION]) } : null;

const PLANS = [{ code: "starter", name: "Starter", price: 29 }, { code: "team", name: "Team", price: 99 }, { code: "scale", name: "Scale", price: 299 }];
let seq = 900; const id = () => String(++seq);
const seed = () => ({
  customers: [{ id: "901", name: "Cascade Timber" }, { id: "902", name: "Rainier Foods" }, { id: "903", name: "Puget Devices" }],
  subs: [
    { id: "910", customerId: "901", customer: "Cascade Timber", plan: "team", price: 99, status: "active" },
    { id: "911", customerId: "902", customer: "Rainier Foods", plan: "starter", price: 29, status: "trial" },
    { id: "912", customerId: "903", customer: "Puget Devices", plan: "scale", price: 299, status: "canceled" },
  ],
});
let { customers, subs } = seed();
const DB_PATH = process.env.DEMO_DB || "/data/app.db";
let db = null; try { db = new DatabaseSync(DB_PATH); db.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`); } catch { db = null; }
const persist = () => { if (db) try { db.prepare(`INSERT INTO kv(k,v) VALUES('s',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run(JSON.stringify({ seq, customers, subs })); } catch {} };
(() => { if (db) try { const r = db.prepare(`SELECT v FROM kv WHERE k='s'`).get(); if (r?.v) { const s = JSON.parse(r.v); seq = s.seq; customers = s.customers; subs = s.subs; } } catch {} })();

function mrr() {
  // STALEMRR: keep counting canceled subs in the recurring total.
  return subs.filter(s => s.status === "active" || (BUGS.has("staleMrr") && s.status === "canceled")).reduce((n, s) => n + s.price, 0);
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STYLE = `body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f6f7fb;color:#1c2430}header{background:#3b2f63;color:#fff;padding:12px 20px;display:flex;gap:18px;align-items:center}header a{color:#d7cff0;text-decoration:none;font-weight:500}header a.on{color:#fff;text-decoration:underline}main{max-width:920px;margin:22px auto;padding:0 16px}.card{background:#fff;border:1px solid #e2e0ec;border-radius:8px;padding:18px;margin-bottom:18px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eeecf4}th{font-size:12px;text-transform:uppercase;color:#6a6284}label{display:block;margin:10px 0 4px;font-size:13px;color:#4a4460}input,select{padding:8px 10px;border:1px solid #cdc9dd;border-radius:6px;min-width:230px;font-size:14px}button,.btn{background:#3b2f63;color:#fff;border:0;border-radius:6px;padding:9px 16px;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}.btn.ghost{background:#fff;color:#3b2f63;border:1px solid #cdc9dd}.pill{display:inline-block;padding:2px 9px;border-radius:12px;font-size:12px;background:#ece9f4}.pill.active{background:#e4f6ea;color:#1c6b39}.pill.trial{background:#fff4e0;color:#8a5a12}.pill.canceled{background:#fdecea;color:#8a1c10}.tot{font-size:22px;font-weight:600}.muted{color:#6b7a89;font-size:13px}.err{background:#fdecea;border:1px solid #f5b3ab;color:#8a1c10;padding:9px 12px;border-radius:6px;margin-bottom:12px}`;
const layout = (active, title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · Meridian Billing</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${STYLE}</style></head><body><header><strong>Meridian Billing</strong>${[["/", "Dashboard"], ["/subscriptions", "Subscriptions"], ["/subscriptions?status=active", "Active"], ["/subscriptions/new", "New subscription"]].map(([h, l]) => `<a href="${h}" class="${active === h ? "on" : ""}">${l}</a>`).join("")}<span style="margin-left:auto"><a href="/logout">Sign out</a></span></header><main><h1>${esc(title)}</h1>${body}</main></body></html>`;

app.get("/healthz", (_q, r) => r.type("text").send("ok"));
app.use((req, res, next) => { if (["/login", "/healthz", "/api/reset"].includes(req.path)) return next(); if (!currentUser(req)) return res.redirect("/login"); next(); });
app.get("/login", (_q, res) => res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Sign in · Meridian Billing</title><style>${STYLE}</style></head><body><main><div class="card" style="max-width:380px;margin:60px auto"><h1>Sign in</h1><form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" value="ops@meridianbilling.test"><label for="password">Password</label><input id="password" name="password" type="password" value="ops12345"><p><button type="submit">Sign in</button></p></form></div></main></body></html>`));
app.post("/login", (req, res) => { const u = USERS[String(req.body.email || "").toLowerCase()]; if (!u || u.password !== req.body.password) return res.status(401).send(`<p class="err">Wrong email or password.</p><a href="/login">Back</a>`); res.cookie(SESSION, b64(String(req.body.email).toLowerCase()), { httpOnly: true }); res.redirect("/"); });
app.get("/logout", (_q, res) => { res.clearCookie(SESSION); res.redirect("/login"); });

app.get("/", (_q, res) => res.send(layout("/", "Dashboard", `<div class="card"><table><tr><th>Subscriptions</th><td>${subs.length}</td></tr><tr><th>Active</th><td>${subs.filter(s => s.status === "active").length}</td></tr><tr><th>MRR</th><td class="tot">$${mrr()}</td></tr></table></div><div class="card"><a class="btn" href="/subscriptions/new">Add a subscription</a></div>`)));
app.get("/subscriptions", (req, res) => {
  const status = String(req.query.status || "");
  const rows = status ? subs.filter(s => s.status === status) : subs;
  res.send(layout(status === "active" ? "/subscriptions?status=active" : "/subscriptions", status ? `${status[0].toUpperCase() + status.slice(1)} subscriptions` : "Subscriptions",
    `<div class="card">${["", "trial", "active", "canceled"].map(s => `<a class="pill" href="/subscriptions${s ? "?status=" + s : ""}">${s || "All"}</a>`).join(" ")}</div>
<div class="card"><table><tr><th>Ref</th><th>Customer</th><th>Plan</th><th>Price</th><th>Status</th></tr>${rows.map(s => `<tr><td><a href="/subscriptions/${s.id}">SUB-${esc(s.id)}</a></td><td>${esc(s.customer)}</td><td>${esc(s.plan)}</td><td>$${s.price}/mo</td><td><span class="pill ${s.status}">${s.status}</span></td></tr>`).join("") || `<tr><td colspan="4" class="muted">None.</td></tr>`}</table></div>`));
});
app.get("/subscriptions/new", (_q, res) => res.send(layout("/subscriptions/new", "New subscription", `<div class="card"><form method="post" action="/subscriptions/new"><label for="poref">PO reference</label><input id="poref" name="poref" value="PO-2026-001"><label for="customerId">Customer</label><select id="customerId" name="customerId">${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select><label for="plan">Plan</label><select id="plan" name="plan">${PLANS.map(p => `<option value="${p.code}">${p.name} — $${p.price}/mo</option>`).join("")}</select><p><button type="submit">Start on trial</button></p></form></div>`)));
app.post("/subscriptions/new", (req, res) => {
  const c = customers.find(x => x.id === String(req.body.customerId)) || customers[0];
  const plan = PLANS.find(p => p.code === String(req.body.plan)) || PLANS[0];
  const sid = id();
  const sub = { id: sid, customerId: c.id, customer: c.name, plan: plan.code, price: plan.price, status: "trial", poref: String(req.body.poref || "").trim() };
  subs.push(sub); persist();
  res.redirect(`/subscriptions/${sid}`);
});
app.get("/subscriptions/:id", (req, res) => {
  const s = subs.find(x => x.id === req.params.id);
  if (!s) return res.status(404).send(layout("/subscriptions", "Not found", `<div class="card">No such subscription.</div>`));
  const actions = s.status === "trial" ? `<form method="post" action="/subscriptions/${s.id}/activate" style="display:inline"><button>Activate</button></form> <form method="post" action="/subscriptions/${s.id}/cancel" style="display:inline"><button class="btn ghost">Cancel</button></form>`
    : s.status === "active" ? `<form method="post" action="/subscriptions/${s.id}/cancel" style="display:inline"><button class="btn ghost">Cancel</button></form>` : `<span class="muted">Closed.</span>`;
  res.send(layout("/subscriptions", `${s.customer} — ${s.plan}`, `<div class="card"><table><tr><th>Reference</th><td><strong>SUB-${esc(s.id)}</strong></td></tr><tr><th>PO reference</th><td>${esc(s.poref || "—")}</td></tr><tr><th>Customer</th><td>${esc(s.customer)}</td></tr><tr><th>Plan</th><td>${esc(s.plan)} ($${s.price}/mo)</td></tr><tr><th>Status</th><td><span class="pill ${s.status}">${s.status}</span></td></tr></table></div><div class="card">${actions}</div>`));
});
app.post("/subscriptions/:id/activate", (req, res) => {
  const s = subs.find(x => x.id === req.params.id);
  if (!s) return res.status(404).send("no");
  // GHOSTSUB: activation "succeeds" but the state change is not persisted.
  if (s.status === "trial" && !BUGS.has("ghostsub")) { s.status = "active"; persist(); }
  res.redirect(`/subscriptions/${s.id}`);
});
app.post("/subscriptions/:id/cancel", (req, res) => {
  const s = subs.find(x => x.id === req.params.id);
  if (!s) return res.status(404).send("no");
  // DEADCANCEL: the cancel button posts here but nothing happens.
  if (!BUGS.has("deadcancel") && s.status !== "canceled") { s.status = "canceled"; persist(); }
  res.redirect(`/subscriptions/${s.id}`);
});
app.post("/api/reset", (req, res) => { if (req.get("X-Reset-Token") !== RESET_TOKEN) return res.status(403).json({ error: "bad token" }); seq = 900; ({ customers, subs } = seed()); persist(); res.json({ ok: true, counts: { customers: customers.length, subscriptions: subs.length } }); });
app.listen(Number(process.env.PORT || 3000), () => console.log(`meridian-billing on ${process.env.PORT || 3000}; bugs=${[...BUGS].join(",") || "none"}`));
