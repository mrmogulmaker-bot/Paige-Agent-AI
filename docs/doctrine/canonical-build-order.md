# Paige Agent AI — Canonical Build Order

**Status:** Owner-locked 2026-08-04. Supersedes ad-hoc sequencing chatter. Both Cowork and Claude Code reference this doc as the single source of truth for "what wave are we on / what fires next / what blocks what." This repo copy at `docs/doctrine/canonical-build-order.md` is the source of truth; Cowork's local disk copy is the backup mirror.

**Update discipline:** whenever a wave completes or sequencing changes, ship a doc commit that updates the change log and marks completed waves ✅. Never let it drift. It is a **living** doc (no date suffix) — always current, never a snapshot.

---

## The 9-wave main pipeline

### WAVE 1 — Currently firing (parallel workstreams)
Fires: 2026-08-04

- **§10 merge-base CI fix** (PR #360 → merged 9bf4e9c1) ✅
- **Task #240** — Phase 2 Integrations cluster (n8n + Zapier + MCP; OAuth deferred per owner)
- **Task #243** — `<PaigeAttribution>` byline primitive (foundational — unblocks #244/#245/#246/#247) — PR #361 (in flight)
- **Task #93** — Doctrine paste slice (folds in §39/§40/§41/§242 + all pending amendments)

### WAVE 2 — Fires once #243 lands (~2-4 days after Wave 1)
- **Task #244** — "About Your Paige Team" canonical page (tri-scope: /team, /admin/team, /agency/team)
- **Task #245** — Command Center VP attribution + ambient 10-department status blocks
- **Task #246** — Agent-to-agent addressability (Vibe Studio design-agent pattern extended platform-wide)
- **Task #247** — Custom Specialists section (blocked by #244; owner-owed Marketplace-share decision — defaults tenant-private)

### WAVE 3 — Practice Blueprints v2 (per #196)
- Task #164 · Task #181 · Task #185

### WAVE 4 — Owner Trilogy pillar BUILDS (per #196)
- Task #80 (Systems Check) · Task #81 (Vault L1) · Twin Direction A · Task #203 · Task #100 · Task #97 (Integrity substrate)

### WAVE 5 — L8 Memory Fabric (per #196)
- Task #138 · Task #206

### WAVE 6 — Paige Quality Wave (per #196)
- Task #189 · Task #190 · Task #220 · Task #180

### WAVE 7 — Playwright post-deploy verification (per #196)
- Task #179

### WAVE 8 — BETA LAUNCH prep (per #196)
- Task #135 · Task #74 · Task #194 · Task #195 · Task #129 · Task #192 + P1 hotfixes

### WAVE 9 — SOC 2 (per #196)
- Task #136

---

## Wave S — Super Admin uplift (RUNS ALONGSIDE WAVES 1-9)

Owner-approved 2026-08-04. Parent task: **Task #45 Paige on Paige**. Runs in parallel because tri-scope primitives (§242) already serve operator-scope, and Task #83 (Super Admin Restructure) already shipped the foundation.

### Wave S1 — Fires NOW (parallel to Wave 1)
- **Task #163 URGENT** — kill "Founder Inbox" tile (leaks "Lovable" + owner email, §45 sellability violation) — tile already removed (d3da54a9); §213.e residual sweep PR #362 (in flight)
- **Task #226** — Super Admin Team/Roles surface (platform-operator staff)
- **Task #248** — Fleet management + tenant provisioning surface

### Wave S2 — Fires alongside Wave 2 (uses Wave 1's primitives)
- Super Admin variant of "About Your Paige Team" (`/admin/team` route on same #244 build)
- Super Admin Command Center — operator-scope status blocks (extends #245)

### Wave S3 — Fires alongside Wave 4 (Owner Trilogy pillar BUILDS)
- Operator-scope Systems Check (Paige monitoring PAIGE's own infrastructure)
- Operator-scope Business Vault (Paige Agent AI corporate obligations per Task #173)
- Operator-scope Competitive Intelligence + Newswire (GHL/Viktor.com monitoring)
- Operator-scope Twin Capabilities Direction A (browser agents that operate the platform)

---

## Wave S critical constraints

1. **Shared tri-scope primitives — NO forks.** Every Wave S build grep-checks per §18 before starting: if tenant-scope equivalent exists, EXTEND it, don't fork. If not, the Wave S task may need to BUILD the shared primitive first.
2. **Same discipline as Wave 1-9.** Right-sized §1 crew, §32 dual-leg + §39 peer-gate on §9-adjacent code, §11/§25 design pass, §37 producer inventory, §9 tenant/operator isolation checks, §213 "every account of a type runs identical code."
3. **1-3 concurrent crews max.** Per §14 right-sizing. Not "permanent Super Admin team" — per-task crews, same shape as Wave 1-9.

---

## Ambient interleaved (fires alongside every wave)

- §46 Cowork operating rhythm — pipeline flows paste-by-paste, no morning drop-offs
- §32 post-deploy scans — every ship, no exceptions
- Design crew (§1/§5/§11/§25) — mandatory on every design-touching task
- §37 producer inventory — on every contract-changing endpoint
- §9 tenant isolation checks — every count/attribution surface
- §213 "every account of a type runs identical code" — every new build

---

## The one-line pipeline

| Wave | Fires | Contents |
|---|---|---|
| **W1 (now)** | 2026-08-04 | §10 CI fix (merged ✅) → #240 + #243 parallel + #93 doctrine paste |
| **S1 (now)** | 2026-08-04 | #163 + #226 + #248 (parallel to W1) |
| **W2** | ~2-4 days after W1 | #244 + #245 + #246 → #247 |
| **S2** | With W2 | Super Admin variants of #244/#245 |
| **W3** | After W2 | Practice Blueprints v2 (#164, #181, #185) |
| **W4** | After W3 | Owner Trilogy pillar BUILDS (#80, #81, Twin A, #203, #100, #97) |
| **S3** | With W4 | Operator-scope Trilogy pillars |
| **W5** | After W4 | L8 Memory Fabric (#138, #206) |
| **W6** | After W5 | Paige Quality Wave (#189, #190, #220, #180) |
| **W7** | After W6 | Playwright verification (#179) |
| **W8** | After W7 | BETA LAUNCH prep (#135, #74, #194, #195, #129, #192) |
| **W9** | After BETA | SOC 2 (#136) |

---

## Change log

- **2026-08-04** — Initial filing. Owner-approved Wave S parallel execution. #248 filed for Wave S1 fleet/provisioning surface. #45 updated as Wave S orchestration parent. §10 CI fix merged (9bf4e9c1).
- **2026-08-04** — Filed to `docs/doctrine/canonical-build-order.md` (living doc, no date suffix, doctrine home per Task #214). Wave 1 in progress: §10 ✅ merged; #243 `<PaigeAttribution>` built + design-crew-verified (array-guard §32 + surface-neutral `leadIn` folded) → PR #361; Wave S1 #163 tile already removed (d3da54a9), §213.e residual sweep (3 real leaks: owner first-name in an admin preview input, Plaid-config copy, `voiceOrchestrator.json` "Lovable") → PR #362. #240 Integrations + #93 doctrine paste + S1 #226/#248 queued next (≤3 concurrent crews).
