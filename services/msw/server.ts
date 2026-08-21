/**
 * The one MSW server every test that talks to `services/http.ts` shares.
 * Started/stopped in `vitest.setup.ts`; individual test files add
 * per-test handlers with `server.use(...)` and let `resetHandlers()`
 * (also wired in `vitest.setup.ts`) drop them after each test.
 *
 * `onUnhandledRequest: "error"` is the point of building this at all: a
 * repository task that forgets to stub a route gets a loud failure in that
 * test, not a hung `fetch` waiting on a real daemon that was never running.
 */
import { setupServer } from "msw/node";

export const server = setupServer();
