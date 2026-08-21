import type { RepoBundle } from "../types";
import { HttpMemoryRepo } from "./memory";
import { HttpSettingsRepo } from "./settings";
import { HttpPersonalityRepo } from "./personality";
import { HttpFileRepo } from "./files";
import { HttpCommandRepo } from "./commands";
import { HttpChatRepo } from "./chat";
import { HttpSystemRepo } from "./system";

export {
  HttpMemoryRepo,
  HttpSettingsRepo,
  HttpPersonalityRepo,
  HttpFileRepo,
  HttpCommandRepo,
  HttpChatRepo,
  HttpSystemRepo,
};

/**
 * The complete live-mode bundle -- the `Http*` counterpart to
 * services/repos/demo/index.ts's `demoRepoBundle`. `app/app/layout.tsx`
 * binds this with `configureRepos("live", liveRepoBundle)`; nothing else
 * should construct these classes directly, so a stray `new Http*Repo()`
 * elsewhere in the tree is always a sign something bypassed the seam.
 */
export const liveRepoBundle: RepoBundle = {
  memory: new HttpMemoryRepo(),
  settings: new HttpSettingsRepo(),
  personality: new HttpPersonalityRepo(),
  files: new HttpFileRepo(),
  commands: new HttpCommandRepo(),
  chat: new HttpChatRepo(),
  system: new HttpSystemRepo(),
};
