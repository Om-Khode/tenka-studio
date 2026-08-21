import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Composer } from "./Composer";
import { useChatStore } from "@/store/chat-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import { liveRepoBundle } from "@/services/repos/http";
import { ApiError } from "@/services/http";

describe("Composer", () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.setState(useChatStore.getInitialState());
  });

  it("sends the typed message and clears the textarea", () => {
    render(<Composer />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "tell me about routing" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(useChatStore.getState().conversations[0].messages[0].content).toBe(
      "tell me about routing"
    );
    expect(input).toHaveValue("");
  });

  it("sends on Enter", () => {
    render(<Composer />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "cost?" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(useChatStore.getState().conversations).toHaveLength(1);
  });

  it("does not send on Shift+Enter (newline instead)", async () => {
    const user = userEvent.setup();
    render(<Composer />);
    const textarea = screen.getByRole("textbox");

    await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");

    // user-event only inserts the "\n" if the keydown's default action was
    // NOT prevented, so this proves preventDefault() is skipped for Shift+Enter
    // (not just that sendMessage was skipped).
    expect(textarea).toHaveValue("line one\nline two");
    expect(useChatStore.getState().conversations).toEqual([]);
  });

  it("disables send when the input is empty or whitespace", () => {
    render(<Composer />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("shows a stop button instead of send while streaming, and stops on click", () => {
    useChatStore.getState().sendMessage("routing");
    render(<Composer />);
    expect(screen.queryByRole("button", { name: /^send/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(useChatStore.getState().streamingMessageId).toBeNull();
  });

  it("does not send a second message while streaming", () => {
    useChatStore.getState().sendMessage("routing");
    render(<Composer />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "another" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(useChatStore.getState().conversations[0].messages).toHaveLength(2);
  });

  describe("a send the daemon refused", () => {
    beforeEach(() => configureRepos("live", liveRepoBundle));
    afterEach(() => {
      configureRepos("demo", demoRepoBundle);
      vi.restoreAllMocks();
    });

    it("puts the user's text back in the textarea", async () => {
      vi.spyOn(liveRepoBundle.chat, "sendMessage").mockRejectedValue(new ApiError(409, "busy"));
      render(<Composer />);
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "what did you do with my file" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
      expect(input).toHaveValue(""); // cleared optimistically
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      // Without this the toast says "try again" with nothing left to try.
      expect(input).toHaveValue("what did you do with my file");
      expect(useChatStore.getState().rejectedDraft).toBeNull();
    });

    it("does not clobber something the user started typing while the send was in flight", async () => {
      vi.spyOn(liveRepoBundle.chat, "sendMessage").mockRejectedValue(new ApiError(409, "busy"));
      render(<Composer />);
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "first" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
      fireEvent.change(input, { target: { value: "second" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(input).toHaveValue("second");
    });
  });
});
