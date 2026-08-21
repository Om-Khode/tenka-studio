import { create } from "zustand";
import { SCRIPTED_TASKS, LEARNED_FACTS_POOL, HISTORY_CAP, FACTS_CAP } from "./demo-scripts";
import type { CompletedTask, LearnedFact, SystemStats, DemoTask } from "@/types/demo";

export const VOLUME_STEP_PCT = 10;

interface DemoEngineState {
  currentTaskIndex: number;
  currentStepIndex: number;
  /**
   * A command the user fired from /demo/commands. While this is set it *is*
   * the current task, and the scripted autoplay loop yields to it. Exactly one
   * slot, which is what makes the Commands grid's disabled state truthful
   * rather than decorative.
   */
  userTask: DemoTask | null;
  taskHistory: CompletedTask[];
  learnedFacts: LearnedFact[];
  systemStats: SystemStats;
  tasksCompletedToday: number;
  spendTodayUsd: number;
  factsAppendedCount: number;
  getCurrentTask: () => DemoTask;
  startUserTask: (task: DemoTask) => boolean;
  advanceStep: () => void;
  abortCurrentTask: () => void;
  jitterStats: () => void;
  setVolume: (direction: "up" | "down") => number;
}

const initialStats: SystemStats = {
  cpuPct: 34,
  ramGb: 6.2,
  ramTotalGb: 16,
  batteryPct: 82,
  batteryCharging: true,
  volumePct: 50,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Retires whichever task currently holds the slot. A user-fired task frees the
 * slot and leaves the scripted cursor alone; a scripted task advances it. Both
 * land in taskHistory, so the Dashboard's Recent Commands feed is honest about
 * what the user actually ran.
 */
function finishTask(state: DemoEngineState, ok: boolean): Partial<DemoEngineState> {
  const isUser = state.userTask !== null;
  const task = isUser ? state.userTask! : SCRIPTED_TASKS[state.currentTaskIndex];

  const completed: CompletedTask = {
    id: `${task.id}-${Date.now()}-${Math.random()}`,
    title: task.title,
    stack: task.steps[task.steps.length - 1].stack,
    visionCalls: task.visionCalls,
    finishedAt: Date.now(),
    ok,
  };

  const taskHistory = [completed, ...state.taskHistory].slice(0, HISTORY_CAP);
  const tasksCompletedToday = state.tasksCompletedToday + 1;
  const spendTodayUsd = state.spendTodayUsd + (ok ? task.costUsd : 0);

  let learnedFacts = state.learnedFacts;
  let factsAppendedCount = state.factsAppendedCount;
  const shouldAppendFact =
    tasksCompletedToday % 2 === 0 &&
    factsAppendedCount < LEARNED_FACTS_POOL.length &&
    learnedFacts.length < FACTS_CAP;
  if (shouldAppendFact) {
    learnedFacts = [
      ...learnedFacts,
      {
        id: `fact-${factsAppendedCount}`,
        text: LEARNED_FACTS_POOL[factsAppendedCount],
        createdAt: Date.now(),
      },
    ];
    factsAppendedCount += 1;
  }

  return {
    userTask: null,
    currentStepIndex: 0,
    currentTaskIndex: isUser
      ? state.currentTaskIndex
      : (state.currentTaskIndex + 1) % SCRIPTED_TASKS.length,
    taskHistory,
    tasksCompletedToday,
    spendTodayUsd,
    learnedFacts,
    factsAppendedCount,
  };
}

export const useDemoStore = create<DemoEngineState>((set, get) => ({
  currentTaskIndex: 0,
  currentStepIndex: 0,
  userTask: null,
  taskHistory: [],
  learnedFacts: [],
  systemStats: initialStats,
  tasksCompletedToday: 0,
  spendTodayUsd: 0,
  factsAppendedCount: 0,

  getCurrentTask: () => get().userTask ?? SCRIPTED_TASKS[get().currentTaskIndex],

  startUserTask: (task) => {
    if (get().userTask) return false;
    set({ userTask: task, currentStepIndex: 0 });
    return true;
  },

  advanceStep: () => {
    const state = get();
    const task = state.getCurrentTask();
    const isLastStep = state.currentStepIndex >= task.steps.length - 1;

    if (!isLastStep) {
      set({ currentStepIndex: state.currentStepIndex + 1 });
      return;
    }

    set(finishTask(state, true));
  },

  abortCurrentTask: () => {
    set(finishTask(get(), false));
  },

  jitterStats: () => {
    const s = get().systemStats;
    set({
      systemStats: {
        ...s,
        cpuPct: clamp(s.cpuPct + (Math.random() * 6 - 3), 20, 45),
        ramGb: clamp(s.ramGb + (Math.random() * 0.4 - 0.2), 5, 8),
        batteryPct: clamp(
          s.batteryPct + (s.batteryCharging ? 1 : -1) * Math.random() * 0.5,
          0,
          100,
        ),
      },
    });
  },

  setVolume: (direction) => {
    const s = get().systemStats;
    const next = clamp(
      s.volumePct + (direction === "up" ? VOLUME_STEP_PCT : -VOLUME_STEP_PCT),
      0,
      100,
    );
    set({ systemStats: { ...s, volumePct: next } });
    return next;
  },
}));
