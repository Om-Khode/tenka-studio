import { seedMemory, MEMORY_LOAD_DELAY_MS } from "@/store/memory-scripts";
import type { MemoryScope } from "@/types/memory";
import type { MemoryRepo, MemorySnapshot } from "../types";

/**
 * Wraps store/memory-scripts.ts. The scripted latency is kept on purpose --
 * memory-store.ts's load() renders a skeleton and an error branch against
 * this delay today, and removing it here would leave both unexercised.
 *
 * Forgetting stays store-internal in demo mode: memory-store.ts's
 * forgetEntity/forgetPreference/forgetProcedure/forgetAll write directly to
 * the persisted `overlay` diff and never call this repo today. `forget()`
 * and `forgetAll()` exist only so this class satisfies `MemoryRepo` --
 * they resolve immediately and touch nothing, because there is nothing here
 * to delete. The seed is regenerated whole on every `load()`; the overlay,
 * not this repo, is what makes a forgotten row stay gone.
 */
export class DemoMemoryRepo implements MemoryRepo {
  async load(): Promise<MemorySnapshot> {
    await new Promise((resolve) => setTimeout(resolve, MEMORY_LOAD_DELAY_MS));
    return seedMemory();
  }

  async forget(scope: MemoryScope, itemId: string): Promise<void> {
    // No-op by design -- see class doc. Referenced, not used, so this
    // satisfies MemoryRepo without an unused-parameter lint warning.
    void scope;
    void itemId;
  }

  async forgetAll(): Promise<void> {
    // No-op by design -- see class doc.
  }
}
