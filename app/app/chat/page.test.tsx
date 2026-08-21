import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import LiveChatPage from "./page";
import { useChatStore } from "@/store/chat-store";
import { configureRepos } from "@/services/repo-registry";
import { liveRepoBundle } from "@/services/repos/http";
import { demoRepoBundle } from "@/services/repos/demo";

describe("Live chat page", () => {
  beforeEach(() => {
    configureRepos("live", liveRepoBundle);
    useChatStore.setState({ ...useChatStore.getInitialState(), hasHydrated: true });
  });

  afterEach(() => {
    configureRepos("demo", demoRepoBundle);
  });

  it("renders the composer and thread without mounting the demo's scripted-reply stream", () => {
    render(<LiveChatPage />);
    expect(screen.getByRole("textbox", { name: /message/i })).toBeInTheDocument();
    // MessageThread's own empty-state copy for "no conversation active" --
    // not a scripted reply.
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });
});
