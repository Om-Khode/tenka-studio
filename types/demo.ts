export type StackTag = "BROWSER" | "APPS" | "VISION" | "LOCAL" | "QUEUED";
export type StepStatus = "pending" | "running" | "done" | "failed";

export interface TaskStep {
  id: string;
  label: string;
  stack: StackTag;
  status: StepStatus;
}

export interface DemoTask {
  id: string;
  title: string;
  steps: TaskStep[];
  costUsd: number;
  visionCalls: number;
}

export interface CompletedTask {
  id: string;
  title: string;
  stack: StackTag;
  visionCalls: number;
  finishedAt: number;
  ok: boolean;
}

export interface LearnedFact {
  id: string;
  text: string;
  createdAt: number;
}

export interface SystemStats {
  cpuPct: number;
  ramGb: number;
  ramTotalGb: number;
  batteryPct: number;
  batteryCharging: boolean;
  volumePct: number;
}
