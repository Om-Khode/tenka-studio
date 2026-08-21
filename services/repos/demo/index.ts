import type { RepoBundle } from "../types";
import { DemoMemoryRepo } from "./memory";
import { DemoSettingsRepo } from "./settings";
import { DemoPersonalityRepo } from "./personality";
import { DemoFilesRepo } from "./files";
import { DemoCommandsRepo } from "./commands";
import { DemoChatRepo } from "./chat";
import { DemoSystemRepo } from "./system";

export {
  DemoMemoryRepo,
  DemoSettingsRepo,
  DemoPersonalityRepo,
  DemoFilesRepo,
  DemoCommandsRepo,
  DemoChatRepo,
  DemoSystemRepo,
};

/** The complete demo-mode bundle. `/demo/*` never touches the network -- see
 * demo-no-network.test.ts, which enforces it by scanning this module's own
 * source tree rather than by trusting the import graph alone. */
export const demoRepoBundle: RepoBundle = {
  memory: new DemoMemoryRepo(),
  settings: new DemoSettingsRepo(),
  personality: new DemoPersonalityRepo(),
  files: new DemoFilesRepo(),
  commands: new DemoCommandsRepo(),
  chat: new DemoChatRepo(),
  system: new DemoSystemRepo(),
};
