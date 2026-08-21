import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { usePersonalityStore } from "./personality-store";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";
import type { RepoBundle } from "@/services/repos/types";
import type { PersonalityPayload } from "@/services/repos/types";

const PAYLOAD: PersonalityPayload = {
  base: "tsundere",
  available: ["warm_honest", "tsundere", "minimal"],
  traits: { warmth: 35, curiosity: 55, directness: 85, playfulness: 70, discipline: 60, patience: 30 },
  sampleLine: "It is already broken. I fixed it.",
};

function reset() {
  usePersonalityStore.setState(usePersonalityStore.getInitialState());
}

describe("personality-store", () => {
  beforeEach(reset);
  afterEach(() => configureRepos("demo", demoRepoBundle));

  it("starts idle and reaches ready through loading", async () => {
    const stub: RepoBundle = {
      ...demoRepoBundle,
      personality: { load: async () => PAYLOAD, setBase: async () => PAYLOAD, reset: async () => PAYLOAD },
    };
    configureRepos("demo", stub);

    const pending = usePersonalityStore.getState().load();
    expect(usePersonalityStore.getState().status).toBe("loading");
    await pending;
    expect(usePersonalityStore.getState().status).toBe("ready");
    expect(usePersonalityStore.getState().payload).toEqual(PAYLOAD);
  });

  it("reaches the error branch instead of hanging forever when load() rejects", async () => {
    const stub: RepoBundle = {
      ...demoRepoBundle,
      personality: {
        load: async () => {
          throw new Error("simulated repository failure");
        },
        setBase: async () => PAYLOAD,
        reset: async () => PAYLOAD,
      },
    };
    configureRepos("demo", stub);

    await usePersonalityStore.getState().load();
    expect(usePersonalityStore.getState().status).toBe("error");
  });

  it("setBase() applies immediately and clears `saving` even when it rejects", async () => {
    const stub: RepoBundle = {
      ...demoRepoBundle,
      personality: {
        load: async () => PAYLOAD,
        setBase: async () => {
          throw new Error("simulated PATCH failure");
        },
        reset: async () => PAYLOAD,
      },
    };
    configureRepos("demo", stub);

    await expect(usePersonalityStore.getState().setBase("minimal")).rejects.toThrow(
      "simulated PATCH failure",
    );
    // The finally must have run even though setBase() itself rejected --
    // otherwise the picker would stay disabled forever after one failure.
    expect(usePersonalityStore.getState().saving).toBe(false);
  });

  it("setBase() replaces payload with whatever the repository resolves", async () => {
    const stub: RepoBundle = {
      ...demoRepoBundle,
      personality: { load: async () => PAYLOAD, setBase: async () => PAYLOAD, reset: async () => PAYLOAD },
    };
    configureRepos("demo", stub);

    await usePersonalityStore.getState().setBase("tsundere");
    expect(usePersonalityStore.getState().payload).toEqual(PAYLOAD);
  });

  it("reset() replaces payload the same way setBase() does", async () => {
    const DEFAULT_PAYLOAD: PersonalityPayload = { ...PAYLOAD, base: "warm_honest" };
    const stub: RepoBundle = {
      ...demoRepoBundle,
      personality: { load: async () => PAYLOAD, setBase: async () => PAYLOAD, reset: async () => DEFAULT_PAYLOAD },
    };
    configureRepos("demo", stub);

    await usePersonalityStore.getState().reset();
    expect(usePersonalityStore.getState().payload).toEqual(DEFAULT_PAYLOAD);
  });
});
