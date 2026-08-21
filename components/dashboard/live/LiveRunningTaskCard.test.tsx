import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { LiveRunningTaskCard } from "./LiveRunningTaskCard";
import { useEventStreamStore } from "@/hooks/useEventStream";

describe("LiveRunningTaskCard", () => {
  afterEach(() => useEventStreamStore.getState().reset());

  it("does not present the connect-time frame's active model as a running task", () => {
    // app.py's /v1/events handler sends `phase="connected",
    // detail=<active model>` as the first frame on every new socket, so
    // `detail` there is not a task description at all. Rendering it blindly
    // put "gemini-2.5-flash-lite" under RUNNING TASK the instant you
    // connected -- with the same string already correct in the Active Model
    // card beside it.
    useEventStreamStore.setState({
      connection: "open",
      activity: {
        phase: "connected",
        detail: "gemini-2.5-flash-lite",
        cursorFollows: null,
        step: null,
        tier: null,
      },
    });

    render(<LiveRunningTaskCard />);

    expect(screen.queryByText(/gemini-2\.5-flash-lite/)).not.toBeInTheDocument();
    expect(screen.getByText(/nothing running/i)).toBeInTheDocument();
  });

  it("renders a real task's detail and its step progress", () => {
    useEventStreamStore.setState({
      connection: "open",
      activity: {
        phase: "ACTING",
        detail: "filling the form",
        cursorFollows: true,
        step: [3, 4],
        tier: "browser",
      },
    });

    render(<LiveRunningTaskCard />);

    expect(screen.getByText(/filling the form/i)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: /task progress/i });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
  });

  it("separates a disconnected socket from an idle assistant", () => {
    // Two different facts -- one about her, one about the socket. Conflating
    // them is how the card came to claim a pending stream while the stream
    // was connected and talking.
    useEventStreamStore.setState({ connection: "reconnecting", activity: null });
    render(<LiveRunningTaskCard />);
    expect(screen.getByText(/not connected to her event stream/i)).toBeInTheDocument();
  });
});
