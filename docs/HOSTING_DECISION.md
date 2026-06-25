# Where does Vox Composer actually run? (A decision we need to make)

Written after discovering, live, that the public demo (`https://voxcomposer.app/demo`)
can never talk to a real VoxMaster — not a bug, a browser security boundary. This
doc lays out the problem, the realistic options, and a recommendation, so we can
pick one and stop building features on top of an assumption that doesn't hold.

## 1. The problem

A browser will not let an **HTTPS** page open a plain, unencrypted **`ws://`**
connection to a device on the local network. This is "mixed content" — there's no
permission prompt, no override, no code fix. It exists specifically to stop a
public website from reaching into someone's home network.

VoxMaster (the ESP32 hub) only ever speaks plain `ws://voxmaster.local/voxlink` —
it's a small embedded device with no practical way to hold a browser-trusted TLS
certificate for a `.local` mDNS name. So:

- Composer served from **anywhere HTTPS** (a public domain, most PaaS hosts,
  Cloudflare Pages, etc.) → **can never** reach a real Master. Confirmed live
  tonight: the Master itself was perfectly healthy and reachable over plain
  `ws://` from the same network the whole time; the demo's HTTPS origin was the
  only thing standing in the way.
- Composer served from **plain HTTP** on the same LAN as the Master → works today,
  no changes needed.

This was always going to be true — the public demo was never going to be able to
drive a real show. We just hadn't hit it yet because nobody had pointed the demo
at real hardware before.

## 2. What's already decided (context, not up for grabs)

Both repos already converge on a **local-first, no-cloud-required** posture —
this doc works within that, not against it:

- VoxMaster's own [`SECURITY.md`](../../VOXMASTER/docs/SECURITY.md): *"VoxMaster
  is a local-network show hub, not an internet service... the hub lives on your
  LAN, optionally reachable remotely via Tailscale... do not port-forward port 80
  to the public internet."*
- VoxMaster's [`PAIRING.md`](../../VOXMASTER/docs/PAIRING.md): the Master is the
  sole source of truth for device pairing — Composer is a consumer of its
  roster, not a second authority.
- Composer's own `README.md`: *"It runs entirely in the browser, works fully
  offline... media stays local by design."*
- Composer's `storage/db.ts`: all show/audio data already lives in browser
  IndexedDB. No account, no server, today.
- `apps/server`'s own description: *"Single-user, no cloud required"* — and its
  Prisma schema is SQLite specifically so there's no database container to run.
  Multi-user/Postgres/Clerk auth are explicitly marked **deferred, optional**.

So: no accounts today, all data local today, no cloud dependency today. The
question this doc answers is narrower — **what process actually serves the
Composer web app to a customer's browser**, since that's what determines whether
it can reach their Master at all.

## 3. The options

### A — VoxMaster serves Composer itself

The P4 hosts Composer's built static files (same pattern it already uses for its
own small built-in control page). Customer visits `voxmaster.local`, Composer is
just there.

**Pros**
- Zero install. Zero separate hosting. Zero accounts, ever.
- Same-origin (plain HTTP, served by the device itself) — the mixed-content
  problem doesn't exist; not "worked around," genuinely doesn't apply.
- Matches the local-first/no-cloud posture as literally as possible — the whole
  product is one box.

**Cons**
- **Flash budget.** The Master's filesystem partition is small (hundreds of KB,
  shared with show storage and the remote registry). Composer's current build is
  ~350KB JS+CSS and growing — needs a real measurement, and it competes with
  firmware features for the same scarce space.
- **Couples Composer's release cycle to firmware.** Every Composer UI fix means
  re-flashing real hardware to test it, and shipping it means an OTA firmware
  update — much slower and riskier than a normal web deploy.
- **Hurts open-source contribution.** Today, anyone can clone `VOXCOMPOSER` and
  run/modify the editor with zero hardware. If Composer's *production* path is
  "baked into the firmware image," contributing to or testing the real
  experience requires an ESP32 board and a flash cycle — a much higher bar than
  "clone, `pnpm install`, `pnpm dev`."
- The P4 is not starved for CPU (it's already serving a UI, LVGL, WiFi, and the
  show engine fine), so "horsepower" isn't really the constraint here — *storage
  and release-cycle coupling* are.

### B — A local self-hosted server (this is what `apps/server` is already for)

Customer runs a small local backend on a PC/NAS on their own network (Docker
Compose today; eventually a one-click installer). It serves the Composer SPA
over plain HTTP and optionally adds a local SQLite-backed show library. Because
it's plain HTTP, it can freely open `ws://` to the Master — no browser
restriction at all, regardless of what machine on the LAN is running it.

**Pros**
- **Already the documented plan** — `apps/server`'s README and
  `docs/self-hosting.md`'s "Option 2" describe exactly this; it just isn't built
  yet. We're not inventing new scope, we're finishing planned scope.
- Decouples Composer releases from firmware entirely — normal web app release
  cadence.
- Keeps the open-source contribution model exactly as easy as it is today — it's
  a normal Node+React project, no hardware required to run or modify the bulk of
  it.
- Other devices on the same LAN (a tablet backstage, a second laptop) can point
  a browser at that PC's address and use the same Composer instance — sharing a
  single local install is a natural side effect, not extra work.
- Growth path is already designed in: SQLite → Postgres, no-login → Clerk, all
  behind env vars, **opt-in**, not required.

**Cons**
- Requires an install step (`docker compose up`, or eventually a packaged
  installer) — not zero-friction like option A.
- Need to actually build it; right now it's a documented intent, not running
  code.

### C — Public hosted site + cloud relay (the "make voxcomposer.app fully work" option)

Keep a public HTTPS site, add a cloud relay/proxy that bridges HTTPS↔local
`ws://`, with some pairing/auth flow tying a browser session to a specific
customer's Master (the same shape as how Tailscale, ngrok, or consumer smart-home
clouds solve "reach my home device from anywhere").

**Pros**
- The only option where a customer can manage a show from literally anywhere,
  no LAN required.

**Cons**
- Real infrastructure project: a relay server to run and pay for, an
  account/pairing system to design and secure, an ongoing security surface
  (anything that can reach into a customer's LAN from the public internet is a
  meaningfully bigger attack surface than "stay on the LAN").
- Directly contradicts the no-cloud-required posture stated everywhere else in
  both repos, unless explicitly scoped as **optional** on top of A or B.
- Not a quick win — this is a "later, if customers actually ask for it" feature,
  not a blocker for shipping.

## 4. Direct answers to "how does it work for a customer"

- **Accounts/login:** No, not for the core product. Single-user, no-login is the
  default and the only thing that exists today. Multi-user accounts are an
  explicitly-deferred, opt-in feature for later (option B's growth path), not a
  requirement to use Composer.
- **Where's their data:** Locally. Either in the browser (IndexedDB, today's only
  mechanism) or, once option B exists, in a local SQLite file on whatever
  machine is running the local server. It never leaves the customer's network
  unless they explicitly export a `.vox`/`.zip` and send it somewhere themselves.
- **Access from outside their home network:** Not by default, and not today,
  regardless of which option we pick — the Master itself is LAN-only by design
  (per its own `SECURITY.md`). If true away-from-home access ever matters, the
  existing, already-decided answer for the *Master* is Tailscale, not a public
  port — the same pattern would extend naturally to whichever machine is running
  Composer's local server (option B), without needing option C's relay at all.

## 5. Recommendation

**Build option B** (finish `apps/server` as the real local self-host path) as
the production answer for "how a customer actually runs Composer and talks to a
real Master." Keep the public demo (option A's opposite — static-only, no
Master, mock data) explicitly labeled as preview/marketing, which is exactly
what tonight's HTTPS warning banner already does.

Revisit option A only if option B's install friction turns out to be a real
adoption blocker for the target customer (a haunt operator, not a developer) —
it's not free, but the engineering shape would be "package the existing local
server behind a one-click installer," not "reinvent it as a firmware feature."

Treat option C as a possible *future, optional* layer on top of B (e.g. "run
Tailscale if you want to edit a show from the road"), never as the default path.
