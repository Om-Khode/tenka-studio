import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { Sidebar } from "./Sidebar";
import { useChatStore } from "@/store/chat-store";

describe("Sidebar", () => {
  it("renders all 6 nav links pointing at /demo/*", () => {
    render(<Sidebar activePath="/demo" basePath="/demo" mode="demo" />);
    const expected = [
      ["Dashboard", "/demo"],
      ["Chat", "/demo/chat"],
      ["Commands", "/demo/commands"],
      ["Files", "/demo/files"],
      ["Memory", "/demo/memory"],
      ["Settings", "/demo/settings"],
    ];
    for (const [label, href] of expected) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("builds every nav href from basePath, not a hardcoded /demo", () => {
    render(<Sidebar activePath="/app" basePath="/app" mode="live" />);
    const expected = [
      ["Dashboard", "/app"],
      ["Chat", "/app/chat"],
      ["Commands", "/app/commands"],
      ["Files", "/app/files"],
      ["Memory", "/app/memory"],
      ["Settings", "/app/settings"],
    ];
    for (const [label, href] of expected) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("marks the active route", () => {
    render(<Sidebar activePath="/demo/chat" basePath="/demo" mode="demo" />);
    expect(screen.getByRole("link", { name: /chat/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("renders the paired-device card in demo mode", () => {
    render(<Sidebar activePath="/demo" basePath="/demo" mode="demo" />);
    expect(screen.getByText("DEMO-DESKTOP")).toBeInTheDocument();
  });

  it("hides the paired-device card in live mode -- no repository backs its latency/uptime numbers yet", () => {
    render(<Sidebar activePath="/app" basePath="/app" mode="live" />);
    expect(screen.queryByText("DEMO-DESKTOP")).not.toBeInTheDocument();
  });
});

describe("Sidebar chat badge", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
  });

  it("shows no chat badge when there are no conversations", () => {
    render(<Sidebar activePath="/demo" basePath="/demo" mode="demo" />);
    const chatLink = screen.getByRole("link", { name: /chat/i });
    expect(chatLink.textContent).toBe("Chat");
  });

  it("shows the live conversation count when conversations exist", () => {
    useChatStore.getState().createConversation();
    useChatStore.getState().createConversation();
    render(<Sidebar activePath="/demo" basePath="/demo" mode="demo" />);
    expect(screen.getByRole("link", { name: /chat/i }).textContent).toContain("2");
  });

  it("shows no memory badge before memory has loaded", () => {
    render(<Sidebar activePath="/demo" basePath="/demo" mode="demo" />);
    expect(screen.getByRole("link", { name: /memory/i }).textContent).toBe("Memory");
  });
});
