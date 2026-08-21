import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { LoadFailure } from "./LoadFailure";
import { useAuthStore } from "@/store/auth-store";
import type { Capability } from "@/types/session";

function authorize(granted: Capability[], effective: Capability[], policy = "local") {
  const usable = new Set<string>(effective);
  useAuthStore.setState({
    phase: "authorized",
    refusal: null,
    session: {
      deviceId: "d1",
      label: "Pixel 8",
      granted,
      effective,
      policy,
      canUse: (c) => usable.has(c),
    },
  });
}

describe("LoadFailure", () => {
  afterEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

  it("keeps the unreachable sentence and the retry when nothing is refused", () => {
    authorize(["files"], ["files"]);
    render(<LoadFailure capability="files" unreachable="She could not reach this folder." onRetry={() => {}} />);
    expect(screen.getByText("She could not reach this folder.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("treats an unlanded probe as unknown, not as refused", () => {
    // Default phase is "unknown". A component's own unit test mounts it with
    // no probe run, and must still see the plain unreachable copy.
    render(<LoadFailure capability="files" unreachable="She could not reach this folder." onRetry={() => {}} />);
    expect(screen.getByText("She could not reach this folder.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("names the missing capability and withdraws the retry on a refusal", () => {
    authorize(["observe"], ["observe"]);
    render(<LoadFailure capability="files" unreachable="She could not reach this folder." onRetry={() => {}} />);
    expect(screen.getByText(/wasn't given access to her files/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not reach/i)).not.toBeInTheDocument();
    // Retrying a 403 gets the same 403. A button here would be a lie.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("distinguishes the listener's ceiling from the device's own grants", () => {
    authorize(["files", "observe"], ["observe"], "funnel");
    render(<LoadFailure capability="files" unreachable="She could not reach this folder." onRetry={() => {}} />);
    expect(screen.getByText(/the connection you're on won't carry it/i)).toBeInTheDocument();
    expect(screen.getByText(/funnel listener/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("reads a 403 the session did not predict as a refusal anyway", () => {
    // The probe hasn't landed, or the daemon changed its mind underneath us.
    render(
      <LoadFailure
        capability="files"
        unreachable="She could not reach this folder."
        onRetry={() => {}}
        error={{ status: 403, code: "forbidden" }}
      />,
    );
    expect(screen.getByText(/she refused that/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("does not invent a retry for a surface that passed none", () => {
    render(<LoadFailure capability="observe" unreachable="She could not reach her telemetry." />);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
