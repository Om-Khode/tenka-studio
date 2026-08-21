import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./services/msw/server";

// Global for every test in the suite, not just services/http.test.ts — every
// Http*Repo (Batch 2) and the connect screen (Task 8) reuse this same server
// rather than each standing up its own. "error" over the default "warn" is
// deliberate: an unstubbed call should fail the test that made it, not hang
// waiting on a daemon that was never running, and not print a warning that
// nobody reads until the suite is already red for an unrelated reason.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
