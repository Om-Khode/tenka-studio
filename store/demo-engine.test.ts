import { describe, it, expect, beforeEach } from "vitest";
import { useDemoStore } from "./demo-engine";
import { SCRIPTED_TASKS, HISTORY_CAP, LEARNED_FACTS_POOL } from "./demo-scripts";

function resetStore() {
  useDemoStore.setState(useDemoStore.getInitialState());
}

describe("demo-engine: step advancement", () => {
  beforeEach(resetStore);

  it("starts at task 0, step 0", () => {
    const s = useDemoStore.getState();
    expect(s.currentTaskIndex).toBe(0);
    expect(s.currentStepIndex).toBe(0);
  });

  it("advanceStep moves to the next step within the same task", () => {
    useDemoStore.getState().advanceStep();
    expect(useDemoStore.getState().currentStepIndex).toBe(1);
    expect(useDemoStore.getState().currentTaskIndex).toBe(0);
  });

  it("completing all steps of a task pushes it to history and starts the next scripted task", () => {
    const store = useDemoStore.getState();
    const stepCount = SCRIPTED_TASKS[0].steps.length;
    for (let i = 0; i < stepCount; i++) store.advanceStep();

    const after = useDemoStore.getState();
    expect(after.currentTaskIndex).toBe(1);
    expect(after.currentStepIndex).toBe(0);
    expect(after.taskHistory).toHaveLength(1);
    expect(after.taskHistory[0].title).toBe(SCRIPTED_TASKS[0].title);
    expect(after.taskHistory[0].ok).toBe(true);
    expect(after.tasksCompletedToday).toBe(1);
    expect(after.spendTodayUsd).toBeCloseTo(SCRIPTED_TASKS[0].costUsd);
  });

  it("cycles back to task 0 after the last scripted task completes", () => {
    const store = useDemoStore.getState();
    for (const task of SCRIPTED_TASKS) {
      for (let i = 0; i < task.steps.length; i++) store.advanceStep();
    }
    expect(useDemoStore.getState().currentTaskIndex).toBe(0);
  });

  it("caps taskHistory at HISTORY_CAP, dropping the oldest completions while keeping the newest first", () => {
    const store = useDemoStore.getState();
    // complete enough tasks to exceed the cap (cycle through scripted tasks repeatedly)
    const totalCompletions = HISTORY_CAP + 2;
    const completedIds: string[] = [];
    for (let cycle = 0; cycle < totalCompletions; cycle++) {
      const task = SCRIPTED_TASKS[useDemoStore.getState().currentTaskIndex];
      for (let i = 0; i < task.steps.length; i++) store.advanceStep();
      // the task just completed is always unshifted to the front of taskHistory
      completedIds.push(useDemoStore.getState().taskHistory[0].id);
    }

    const after = useDemoStore.getState();
    expect(after.taskHistory.length).toBeLessThanOrEqual(HISTORY_CAP);
    expect(after.taskHistory).toHaveLength(HISTORY_CAP);

    // the most-recently-completed task must be at index 0
    expect(after.taskHistory[0].id).toBe(completedIds[totalCompletions - 1]);

    // the earliest-completed tasks (evicted once the cap was exceeded) must be gone
    const survivingIds = after.taskHistory.map((t) => t.id);
    expect(survivingIds).not.toContain(completedIds[0]);
    expect(survivingIds).not.toContain(completedIds[1]);
  });

  it("appends a learned fact after every 2nd completed task, until the pool is exhausted", () => {
    const store = useDemoStore.getState();
    for (let cycle = 0; cycle < 4; cycle++) {
      const task = SCRIPTED_TASKS[useDemoStore.getState().currentTaskIndex];
      for (let i = 0; i < task.steps.length; i++) store.advanceStep();
    }
    // 4 tasks completed → facts appended after task 2 and task 4 → 2 facts
    expect(useDemoStore.getState().learnedFacts).toHaveLength(2);
    expect(useDemoStore.getState().learnedFacts[0].text).toBe(LEARNED_FACTS_POOL[0]);
  });

  it("stops appending facts once the 3-entry pool is exhausted (boundary at completions 6 and 8)", () => {
    const store = useDemoStore.getState();

    // completions 1-6: facts append after completions 2, 4, and 6 (pool indices 0, 1, 2)
    for (let cycle = 0; cycle < 6; cycle++) {
      const task = SCRIPTED_TASKS[useDemoStore.getState().currentTaskIndex];
      for (let i = 0; i < task.steps.length; i++) store.advanceStep();
    }
    const afterSix = useDemoStore.getState();
    expect(afterSix.learnedFacts).toHaveLength(3);
    expect(afterSix.learnedFacts[2].text).toBe(LEARNED_FACTS_POOL[2]);
    expect(afterSix.factsAppendedCount).toBe(3);

    // completions 7-8: pool is exhausted, so completion 8 (even) must be a no-op for facts
    for (let cycle = 0; cycle < 2; cycle++) {
      const task = SCRIPTED_TASKS[useDemoStore.getState().currentTaskIndex];
      for (let i = 0; i < task.steps.length; i++) store.advanceStep();
    }
    const afterEight = useDemoStore.getState();
    expect(afterEight.learnedFacts).toHaveLength(3);
    expect(afterEight.factsAppendedCount).toBe(3);

    // no duplicate facts were introduced
    const texts = afterEight.learnedFacts.map((f) => f.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("demo-engine: abort", () => {
  beforeEach(resetStore);

  it("abortCurrentTask records the in-progress task as not-ok and advances to the next task", () => {
    const store = useDemoStore.getState();
    store.advanceStep(); // partway through task 0
    store.abortCurrentTask();

    const after = useDemoStore.getState();
    expect(after.taskHistory).toHaveLength(1);
    expect(after.taskHistory[0].ok).toBe(false);
    expect(after.currentTaskIndex).toBe(1);
    expect(after.currentStepIndex).toBe(0);
  });
});

describe("demo-engine: system stats jitter", () => {
  beforeEach(resetStore);

  it("jitterStats keeps cpuPct within 20-45 and batteryPct within 0-100", () => {
    const store = useDemoStore.getState();
    for (let i = 0; i < 50; i++) store.jitterStats();
    const s = useDemoStore.getState().systemStats;
    expect(s.cpuPct).toBeGreaterThanOrEqual(20);
    expect(s.cpuPct).toBeLessThanOrEqual(45);
    expect(s.batteryPct).toBeGreaterThanOrEqual(0);
    expect(s.batteryPct).toBeLessThanOrEqual(100);
  });
});

describe("user-fired commands", () => {
  beforeEach(resetStore);

  const task = () => ({
    id: "cmd-run-1",
    title: "Open VS Code",
    costUsd: 0.001,
    visionCalls: 0,
    steps: [
      { id: "s1", label: "one", stack: "LOCAL" as const, status: "done" as const },
      { id: "s2", label: "two", stack: "APPS" as const, status: "done" as const },
    ],
  });

  it("starts empty", () => {
    expect(useDemoStore.getState().userTask).toBeNull();
  });

  it("getCurrentTask returns the scripted task while the slot is empty", () => {
    expect(useDemoStore.getState().getCurrentTask().id).toBe(SCRIPTED_TASKS[0].id);
  });

  it("startUserTask fills the slot, resets the step cursor, and reports success", () => {
    const ok = useDemoStore.getState().startUserTask(task());
    expect(ok).toBe(true);
    expect(useDemoStore.getState().userTask?.title).toBe("Open VS Code");
    expect(useDemoStore.getState().currentStepIndex).toBe(0);
    expect(useDemoStore.getState().getCurrentTask().title).toBe("Open VS Code");
  });

  it("rejects a second command while the slot is occupied", () => {
    useDemoStore.getState().startUserTask(task());
    useDemoStore.getState().advanceStep();
    const second = useDemoStore.getState().startUserTask({ ...task(), id: "cmd-run-2" });
    expect(second).toBe(false);
    expect(useDemoStore.getState().userTask?.id).toBe("cmd-run-1");
    expect(useDemoStore.getState().currentStepIndex).toBe(1);
  });

  it("advances within the user task without touching the scripted cursor", () => {
    const before = useDemoStore.getState().currentTaskIndex;
    useDemoStore.getState().startUserTask(task());
    useDemoStore.getState().advanceStep();
    expect(useDemoStore.getState().currentStepIndex).toBe(1);
    expect(useDemoStore.getState().currentTaskIndex).toBe(before);
  });

  it("completing a user task lands it in history and frees the slot", () => {
    useDemoStore.getState().startUserTask(task());
    useDemoStore.getState().advanceStep();
    useDemoStore.getState().advanceStep();
    const { userTask, taskHistory } = useDemoStore.getState();
    expect(userTask).toBeNull();
    expect(taskHistory[0].title).toBe("Open VS Code");
    expect(taskHistory[0].ok).toBe(true);
  });

  it("completing a user task leaves the scripted cursor where it was", () => {
    const before = useDemoStore.getState().currentTaskIndex;
    useDemoStore.getState().startUserTask(task());
    useDemoStore.getState().advanceStep();
    useDemoStore.getState().advanceStep();
    expect(useDemoStore.getState().currentTaskIndex).toBe(before);
  });

  it("aborting a user task frees the slot and records a failure", () => {
    useDemoStore.getState().startUserTask(task());
    useDemoStore.getState().abortCurrentTask();
    expect(useDemoStore.getState().userTask).toBeNull();
    expect(useDemoStore.getState().taskHistory[0].ok).toBe(false);
  });

  it("aborting with an empty slot still advances the scripted loop, as before", () => {
    const before = useDemoStore.getState().currentTaskIndex;
    useDemoStore.getState().abortCurrentTask();
    expect(useDemoStore.getState().currentTaskIndex).toBe(
      (before + 1) % SCRIPTED_TASKS.length,
    );
  });
});

describe("volume", () => {
  beforeEach(resetStore);

  it("starts at a sane default", () => {
    expect(useDemoStore.getState().systemStats.volumePct).toBe(50);
  });

  it("steps up and down by VOLUME_STEP_PCT and returns the new level", () => {
    expect(useDemoStore.getState().setVolume("up")).toBe(60);
    expect(useDemoStore.getState().setVolume("down")).toBe(50);
  });

  it("clamps at 100 and 0 instead of running away", () => {
    for (let i = 0; i < 12; i++) useDemoStore.getState().setVolume("up");
    expect(useDemoStore.getState().systemStats.volumePct).toBe(100);
    for (let i = 0; i < 14; i++) useDemoStore.getState().setVolume("down");
    expect(useDemoStore.getState().systemStats.volumePct).toBe(0);
  });
});
