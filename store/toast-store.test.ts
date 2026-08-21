import { describe, it, expect, beforeEach, vi } from "vitest";
import { useToastStore } from "./toast-store";

describe("toast-store", () => {
  beforeEach(() => {
    useToastStore.setState(useToastStore.getInitialState());
  });

  it("starts empty", () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("push appends a toast and returns its id", () => {
    const id = useToastStore.getState().push({ ok: true, title: "Chrome opened" });
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].title).toBe("Chrome opened");
    expect(toasts[0].ok).toBe(true);
  });

  it("gives every toast a distinct id", () => {
    const a = useToastStore.getState().push({ ok: true, title: "one" });
    const b = useToastStore.getState().push({ ok: true, title: "two" });
    expect(a).not.toBe(b);
  });

  it("dismiss removes only the named toast", () => {
    const a = useToastStore.getState().push({ ok: true, title: "one" });
    useToastStore.getState().push({ ok: false, title: "two" });
    useToastStore.getState().dismiss(a);
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe("two");
  });

  it("dismissing an unknown id is a no-op, not a throw", () => {
    useToastStore.getState().push({ ok: true, title: "one" });
    expect(() => useToastStore.getState().dismiss("nope")).not.toThrow();
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("carries an undo callback through untouched", () => {
    const undo = vi.fn();
    useToastStore.getState().push({ ok: true, title: "Deleted", undo });
    useToastStore.getState().toasts[0].undo?.();
    expect(undo).toHaveBeenCalledOnce();
  });

  it("caps the queue at MAX_TOASTS, dropping the oldest", () => {
    for (let i = 0; i < 6; i++) {
      useToastStore.getState().push({ ok: true, title: `t${i}` });
    }
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(4);
    expect(toasts[0].title).toBe("t2");
    expect(toasts[3].title).toBe("t5");
  });

  it("clear empties the queue", () => {
    useToastStore.getState().push({ ok: true, title: "one" });
    useToastStore.getState().clear();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
