import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/services/msw/server";
import { apiBase } from "@/services/http";
import { clearDevToken } from "@/services/token";
import ConnectPage from "./page";

const push = vi.fn();
// Same reason as app/app/layout.test.tsx: page.tsx imports notFound for the
// public-demo gate, and these tests run with the flag off.
//
// vi.hoisted() (rather than a bare vi.fn()) is required here: Vitest hoists
// this file's component-under-test import (ConnectPage from "./page") above
// ordinary top-level const declarations when it rewrites the module -- so a
// plain const would still be in its temporal dead zone the moment the mock
// factory runs. vi.hoisted pins the declaration to the same hoisted position
// as vi.mock itself.
const notFound = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  notFound,
}));

const BASE = apiBase();

describe("ConnectPage", () => {
  beforeEach(() => {
    clearDevToken();
    push.mockClear();
  });

  it("renders the connect form", () => {
    render(<ConnectPage />);
    expect(screen.getByText(/connect to tenka/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/device token/i)).toBeInTheDocument();
  });

  it("routes to /app once the pasted token is exchanged for a cookie", async () => {
    // 204, no body -- the credential comes back only in `Set-Cookie`, never in
    // a response body a client could log or cache.
    server.use(
      http.post(`${BASE}/v1/session/cookie`, () => new HttpResponse(null, { status: 204 })),
    );
    render(<ConnectPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/device token/i), "good-token");
    await user.click(screen.getByRole("button", { name: /connect/i }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
  });
});
