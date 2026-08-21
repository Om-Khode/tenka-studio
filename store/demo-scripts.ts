import type { DemoTask } from "@/types/demo";

export const HISTORY_CAP = 8;
export const FACTS_CAP = 6;

export const SCRIPTED_TASKS: DemoTask[] = [
  {
    id: "task-spotify",
    title: 'Play Bohemian Rhapsody on Spotify',
    costUsd: 0.0041,
    visionCalls: 0,
    steps: [
      { id: "s1", label: "resolve intent → code_executor", stack: "LOCAL", status: "done" },
      { id: "s2", label: "spotify web player → auth wall", stack: "BROWSER", status: "failed" },
      { id: "s3", label: "replanned → desktop client, accessibility tree", stack: "APPS", status: "done" },
      { id: "s4", label: "confirm playback, cache procedure", stack: "LOCAL", status: "done" },
    ],
  },
  {
    id: "task-vscode",
    title: "Open VS Code, pull latest tenka repo",
    costUsd: 0.0012,
    visionCalls: 0,
    steps: [
      { id: "s1", label: "resolve intent", stack: "LOCAL", status: "done" },
      { id: "s2", label: "open vscode → tenka repo", stack: "APPS", status: "done" },
      { id: "s3", label: "git pull → terminal", stack: "APPS", status: "done" },
    ],
  },
  {
    id: "task-youtube",
    title: "Search youtube for the Vercel keynote",
    costUsd: 0.0037,
    visionCalls: 1,
    steps: [
      { id: "s1", label: "resolve intent", stack: "LOCAL", status: "done" },
      { id: "s2", label: "search youtube for the vercel keynote", stack: "BROWSER", status: "done" },
      { id: "s3", label: "click the third item in the results", stack: "VISION", status: "done" },
    ],
  },
];

/**
 * Same invented person as store/memory-scripts.ts's graph, and it has to stay
 * that way: this pool and that graph are read on adjacent pages, so a second
 * sibling under a different name reads as her getting it wrong rather than as
 * two fixtures written months apart. Sakuta is the graph's `sibling` edge, and
 * a brother in its turn excerpt.
 */
export const LEARNED_FACTS_POOL: string[] = [
  "spotify → desktop client beats web player",
  "Sakuta = brother · mentioned 2×",
  "you ship on Fridays. she stopped suggesting Monday.",
];
