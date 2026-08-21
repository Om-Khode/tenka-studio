# TENKA Studio — Product Requirements

> **Back-filled 2026-08-07.** Specs 1–3 were written against a PRD that was
> never committed to this repo. This document reconstructs it from three
> sources: what specs 1–3 quote verbatim, what shipped on `master`, and the
> real assistant, [Om-Khode/TENKA](https://github.com/Om-Khode/TENKA).
> Milestone 4's requirements were agreed directly and are not a
> reconstruction. Where this document and a shipped
> spec disagree, the shipped spec wins — then fix this file.

## What Studio is

A portfolio-grade Next.js 15 frontend for TENKA, a local-first desktop AI
assistant. Studio is a **frontend plus an API client**. It contains no AI
logic, no automation, and no model calls of its own; every intelligent
behaviour it displays belongs to the Python assistant it will eventually talk
to.

Until spec 5 it runs in **Demo Mode**: no backend, no network, local Zustand
stores producing scripted but plausible activity. Demo Mode is not a
throwaway prototype — the demo layout *is* the live layout. Spec 5 swaps the
data source, not the components.

Demo Mode does not end at spec 5. `/demo/*` keeps its scripted data
permanently so the deployed build works unattended with no backend; spec 5
adds a second route tree, `/app/*`, bound to the real assistant.

## Audience

An interviewer clicking through the deployed demo, unattended, on a laptop.
Every page must be legible and complete without narration, must not require a
backend, and must survive keyboard-only navigation.

## Brand

Design tokens port **verbatim** from the marketing site's
`src/styles/tenka.css` — dark-only, bone-on-near-black,
amber/moss/steel/gold/blue/fail accents, Inter + JetBrains Mono. Components
port as *patterns*, not code: the marketing site is Vite + React 18 + raw CSS
+ GSAP; Studio is Next.js + Tailwind v4.

## Milestone plan (locked)

1. Setup + Landing + AppShell + Dashboard
2. Chat — mock streaming, markdown, multi-conversation
3. Commands + Files — mocked; one shared action → progress → confirm shape
4. Memory + Settings — mocked
5. Backend integration — a FastAPI daemon inside the assistant, all six
   pages live on `/app`, and the security primitives spec 6 attaches to
6. QR pairing / auth — remote access
7. Polish pass — a11y, animation, perf swept continuously, final pass at end

Each gets its own spec → plan → build cycle, back-to-back.

## Pages

### Landing

Minimal dark hero. "Try Demo" enters `/demo`. "Connect to TENKA" is disabled
with a tooltip until spec 5, which enables it to enter `/app` against a local
daemon. Spec 6 extends it to a paired remote instance.

### AppShell

Sidebar with six nav destinations (Dashboard, Chat, Commands, Files, Memory,
Settings), badges on Chat and Memory, and a paired-device card showing a
clearly-fake `DEMO-DESKTOP`. Topbar carries a breadcrumb, a `DEMO MODE`
badge, a visual-only `⌘K` badge, and an `ESC-hold` badge wired to abort the
running mock task.

### Dashboard

The signature page. A running task with an animated step sequence and a live
abort; CPU/RAM/battery meters; the active model; routing economics (what a
request cost and which tier served it); a recent-commands feed; what she
learned today; and the six personality trait bars.

### Chat

Mock streaming replies, markdown with syntax-highlighted code, multiple
conversations with persistence, message actions, and a composer.

### Commands

Large action buttons — Open Chrome, Open VS Code, Take Screenshot, Lock PC,
Volume Up, Volume Down. Each action shows progress. Destructive or
system-level actions confirm first.

### Files

Desktop, Downloads, and Documents. View files, download them, rename, and
delete with confirmation. Explicitly **not** a complete file explorer.

### Memory

The assistant's knowledge, made inspectable. Three stores share one page:

- **Knowledge** — typed entities with their facts and relationships. A fact
  carries a confidence, may record when the event happened as distinct from
  when it was learned, and may be superseded by a newer fact rather than
  overwritten. Every row can answer *why do you think that?* by pointing at
  the conversation turn it came from.
- **Preferences** — learned likes and dislikes, with their change history.
  Read and forget only; preferences are learned, never authored.
- **Taught procedures** — multi-step routines the user taught by voice.

Users can search across a store, inspect any item, and forget it. Editing
facts is out of scope — corrections happen by talking to the assistant.

### Settings

Every runtime setting the real assistant exposes, rendered from a registry
rather than hand-built per control. A setting carries a group, a
human-readable description, a control type, a default, and whether changing
it needs a restart. Values resolve DB → environment variable → default.

> **Corrected during spec 5.** This document previously said a row owned by an
> environment variable is not user-editable. It is: `core/runtime_config.py`
> reads the DB *before* the environment, so an env var is a fallback, not an
> override, and saving a value legitimately takes precedence from then on. Each
> row reports which layer owns its current value — `db`, `env`, or `default` —
> and the page says so, but it does not lock the control.

Alongside the registry:

- **Personality** — base persona picker with the six trait bars and a sample
  line in the chosen voice.
- **Backup & restore** — encrypted cloud backup status, back up now, and
  restore from a recovery phrase.
- **Enrollment** — enrolled voice profiles and known faces, with forget.
  Read-only: capture needs a microphone and camera.
- **Danger zone** — forget all memory, reset personality, reset all settings.
  All confirmed.

## Cross-cutting requirements

- **One feedback vocabulary.** Every user-fired action across every page
  resolves to the same result shape and reports through the same toast
  system.
- **Async-shaped from the start.** Stores model loading and failure even
  while the data is local, so spec 5 changes the source and not the
  components.
- **Error boundaries.** A top-level boundary plus a route-scoped boundary per
  built page. A failing pane fails alone.
- **Persistence is an overlay.** What the user changed is persisted; the
  seed data is not. A stale persisted blob can never resurrect deleted
  content or shadow a code-level change.
- **Keyboard and screen-reader support** are continuous requirements, not a
  spec-7 task. Spec 7 is a sweep, not the first pass.
- **Verification gate.** `build`, `lint`, `typecheck`, and `test` must all be
  clean before a milestone is called done.

## Remote access (spec 6 target, decided during spec 5)

TENKA stays local-first: no central backend, no cloud AI, no cloud memory, no
command server. Remote control is a transport question only, and the remote API
is just another input source into the same pipeline as voice and the desktop UI.

The device token is bound to the instance secret, **not** to a URL. A pairing QR
therefore carries a *list* of candidate endpoints; the phone prefers the LAN
address and falls back to a tunnel. Changing transport never forces a re-pair.

| Mode | Setup cost | Hostname | Reachable by |
| --- | --- | --- | --- |
| `lan` | none | direct IP / mDNS | same network only |
| `quick` | none | random `*.trycloudflare.com`, rotates each start | anyone with the URL |
| `named` | Cloudflare account **and a domain the user owns** | stable | anyone with the URL |
| `tailnet` | Tailscale login | stable `*.ts.net` | the user's devices; public only via Funnel |

Intended path: try remote on `quick` with zero setup, then offer an upgrade to a
stable hostname. Cloudflare hands out no free subdomain for a named tunnel, so
the no-friction stable option is Tailscale; the Cloudflare named tunnel remains
for users who already own a domain. Transport is a preference and a
self-registering adapter, never a branch in code.

Cloudflare terminates TLS, so tunnelled traffic is decrypted at their edge.
Application-layer encryption — keys derived during pairing, payloads sealed
before HTTP — is what keeps the local-first claim true. Spec 5 reserves the
envelope; spec 6 implements it.

## Non-goals

- Studio never implements AI behaviour, automation, or model routing.
- Files is not a general file manager.
- Memory is not a fact editor.
- No light mode. The marketing site is dark-only.
- No visual-regression tooling before spec 7.
