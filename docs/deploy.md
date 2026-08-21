# Deploying the public demo

The `/demo` tree is the public artifact. It needs no server: no route handlers
anywhere under `app/`, no `middleware.ts`, no `next/headers`, no `next/image`, no
dynamic route segments, fonts self-hosted through `@fontsource`, and all data
from `services/repos/demo/` plus `store/*-scripts.ts` and `localStorage`. MSW is
a test dependency only. Verified in a browser against a production build with no
assistant installed and no daemon running: all six demo pages render, and the
only network requests are Next's own RSC prefetches to its own origin.

The live tree (`/app/*`, `/connect`) is **excluded** from the public build. A
page served over HTTPS cannot fetch a visitor's `http://127.0.0.1` daemon —
mixed content, plus Private Network Access — so it 404s rather than shipping
broken. `services/deployment.ts` owns that switch.

## The flag

| Variable | Value | Where |
| --- | --- | --- |
| `NEXT_PUBLIC_DEMO_ONLY` | `1` | Vercel: Production **and** Preview |
| `NEXT_PUBLIC_DEMO_ONLY` | unset | local `npm run dev`, `npm test`, desktop builds |

Exactly the string `1`. `true`, `yes`, and `false` all read as off, by design —
see `services/deployment.test.ts`.

Preview carries the same value as Production on purpose: a preview URL that
behaves differently from production is a preview that proves nothing.

The flag is read at **build** time, not run time — Next inlines
`process.env.NEXT_PUBLIC_*` into the client bundle. Setting it in the shell
before `npm start` does nothing; it has to be set before `npm run build`.

`/app` and `/connect` still appear in the build's route manifest as prerendered
entries even with the flag on. That is expected: the gate is a `notFound()` call
inside a client component, so the route exists and answers **HTTP 404** at
request time. Confirmed in a browser, status line and all — it is a real 404,
not a soft one, and it renders `app/not-found.tsx` rather than Next's stock page.

## Vercel project

1. Import `Om-Khode/tenka-studio` (Hobby plan is enough).
2. Framework preset: Next.js, auto-detected. Root directory: repo root.
3. Build command, output directory, install command: defaults. There is no
   `vercel.json` and there should not be one.
4. Environment variables: add the row above to Production and Preview.
5. `master` is the production branch. Every other branch gets a preview URL
   automatically.

## Before promoting a deploy

1. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run api:check`.
2. Build and serve the public shape locally:

   ```powershell
   $env:NEXT_PUBLIC_DEMO_ONLY="1"; npm run build
   npm start
   ```

   Then, with no assistant running, check: the landing page carries the public
   copy and no `Connect to TENKA` button; all six demo routes render with data;
   `/app` and `/connect` return the 404 page; a command fired from
   `/demo/commands` still advances through its scripted steps.
3. Open the Vercel **preview** URL and repeat step 2's clicks there.
4. Promote.

If `npm start` dies with `EADDRINUSE`, a previous `next start` is still holding
port 3000 — killing the npm wrapper does not always take the server with it.
Find it with `netstat -ano | findstr :3000` and stop that PID.

## The demo data is a fiction, and must stay one

`store/memory-scripts.ts` and `store/system-store.ts`'s `demoSystemSeed()`
describe a person: a name, a relocation, a sibling, a GPU, enrolled voices and
faces. Everything there is invented, deliberately — it used to be the
developer's own life, which was harmless on one laptop and a published fact
sheet the moment this became a URL. Both files carry a comment saying so.

When adding a realistic-looking row, invent it. The instinct to reach for your
own details is exactly how the previous version happened.

## Not set up, on purpose

No analytics. No custom domain — one Vercel setting when it is wanted, no code
change. No static export: the app builds cleanly as one, but Next on Vercel
costs nothing here and keeps a server route possible if milestone 6's remote
transport ever wants one.

## When milestone 6 lands

Milestone 6 adds QR pairing and remote transports (LAN, Cloudflare, Tailscale)
— the work that lets a hosted Studio reach a real assistant. At that point
`NEXT_PUBLIC_DEMO_ONLY` is the row to remove, plus whatever the transport needs.
The flag describes today's transport, not a permanent shape.
