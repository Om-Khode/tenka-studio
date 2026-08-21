import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RaiseDeviceDialog } from "./RaiseDeviceDialog";
import { ApiError } from "@/services/http";

const { mintMock } = vi.hoisted(() => ({ mintMock: vi.fn() }));

vi.mock("@/services/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/http")>();
  return { ...actual, apiSend: mintMock };
});

const device = {
  deviceId: "phone-1",
  label: "Pixel 8",
  grants: ["observe", "execute", "system_control"],
  createdAt: new Date().toISOString(),
  lastSeenAt: null,
  pairedOn: "tailnet",
  raises: [],
};

const tailnet = {
  name: "tailnet",
  running: true,
  url: "https://phone.tailnet.ts.net",
  ceiling: ["observe", "recall", "chat_send", "screen", "files"],
  raisable: ["execute", "system_control"],
  pairable: true,
};

const stoppedTailnet = { ...tailnet, running: false, url: null };

describe("RaiseDeviceDialog", () => {
  const onOpenChange = vi.fn();
  const onRaised = vi.fn();

  beforeEach(() => {
    mintMock.mockReset();
    onOpenChange.mockReset();
    onRaised.mockReset();
  });

  it("offers only the capabilities this device holds that the transport may ever raise", () => {
    render(
      <RaiseDeviceDialog
        open
        onOpenChange={onOpenChange}
        device={device}
        transports={[tailnet]}
        onRaised={onRaised}
      />,
    );
    // device holds execute AND system_control, tailnet.raisable names both --
    // both boxes must appear, and only those two.
    expect(screen.getByRole("checkbox", { name: /execute/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /system control/i })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("keeps raise disabled until at least one capability and a reason are given", async () => {
    render(
      <RaiseDeviceDialog
        open
        onOpenChange={onOpenChange}
        device={device}
        transports={[tailnet]}
        onRaised={onRaised}
      />,
    );
    const submit = screen.getByRole("button", { name: /^raise$/i });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /execute/i }));
    expect(submit).toBeDisabled(); // still no reason

    await userEvent.type(screen.getByLabelText(/reason/i), "debugging a crash");
    expect(submit).toBeEnabled();
  });

  it("disables raise, with an explanation, when the transport is not running", () => {
    render(
      <RaiseDeviceDialog
        open
        onOpenChange={onOpenChange}
        device={device}
        transports={[stoppedTailnet]}
        onRaised={onRaised}
      />,
    );
    expect(screen.getByText(/not running/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^raise$/i })).toBeDisabled();
  });

  it("reports no transport at all when nothing overlaps this device's grants", () => {
    const observeOnly = { ...device, grants: ["observe"] };
    render(
      <RaiseDeviceDialog
        open
        onOpenChange={onOpenChange}
        device={observeOnly}
        transports={[tailnet]}
        onRaised={onRaised}
      />,
    );
    expect(screen.getByText(/no transport can ever carry more/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^raise$/i })).not.toBeInTheDocument();
  });

  it("mints with exactly the ticked capabilities, the transport and the reason", async () => {
    mintMock.mockResolvedValueOnce({
      deviceId: "phone-1",
      transport: "tailnet",
      capabilities: ["execute"],
      expiresInSeconds: 3600,
      reason: "debugging a crash",
    });
    render(
      <RaiseDeviceDialog
        open
        onOpenChange={onOpenChange}
        device={device}
        transports={[tailnet]}
        onRaised={onRaised}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /execute/i }));
    await userEvent.type(screen.getByLabelText(/reason/i), "debugging a crash");
    await userEvent.click(screen.getByRole("button", { name: /^raise$/i }));

    expect(mintMock).toHaveBeenCalledWith("POST", "/v1/devices/phone-1/raise", {
      transport: "tailnet",
      capabilities: ["execute"],
      minutes: 60,
      reason: "debugging a crash",
    });
    expect(onRaised).toHaveBeenCalledWith(
      expect.objectContaining({ transport: "tailnet", capabilities: ["execute"] }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("names the daemon's own refusal for a 409 rather than a generic failure", async () => {
    mintMock.mockRejectedValueOnce(new ApiError(409, "conflict"));
    render(
      <RaiseDeviceDialog
        open
        onOpenChange={onOpenChange}
        device={device}
        transports={[tailnet]}
        onRaised={onRaised}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /execute/i }));
    await userEvent.type(screen.getByLabelText(/reason/i), "debugging a crash");
    await userEvent.click(screen.getByRole("button", { name: /^raise$/i }));

    expect(await screen.findByText(/not running/i)).toBeInTheDocument();
    expect(onRaised).not.toHaveBeenCalled();
  });
});
