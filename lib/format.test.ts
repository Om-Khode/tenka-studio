import { describe, it, expect } from "vitest";
import { formatBytes, formatDate, formatAgo } from "./format";

describe("formatBytes", () => {
  // Moved here from components/files/FileList.test.tsx with the function
  // itself (milestone 5b, Task 12); these four cases are unchanged.
  it("renders a dash for a size that does not exist, and units elsewhere", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("scales past MB, which BackupPanel's old mb() could not", () => {
    // The decision this sweep made visible: a 2 GB backup used to read
    // "2048.0 MB".
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
  });

  it("stops at GB rather than inventing a unit it has no label for", () => {
    expect(formatBytes(3 * 1024 ** 4)).toBe("3072.0 GB");
  });

  it("leaves the demo backup figure exactly where it was", () => {
    // store/system-store.ts seeds 41_000_000 bytes and BackupPanel's test
    // asserts "39.1 MB" -- both formatters agree on it, so consolidating
    // changed nothing a demo user sees.
    expect(formatBytes(41_000_000)).toBe("39.1 MB");
  });

  it("treats a negative size as no size at all", () => {
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatDate", () => {
  it("is stable regardless of the viewer's timezone", () => {
    // 23:30 UTC on the 3rd is the 4th in Asia/Kolkata. Pinning timeZone: UTC
    // is what keeps this the 3rd for everyone -- the property all five of the
    // deduplicated copies existed to guarantee.
    expect(formatDate("2026-07-03T23:30:00Z")).toBe("03 Jul");
  });

  it("takes a Date as well as an ISO string", () => {
    // FileNode.modifiedAt is an epoch number turned Date; every daemon
    // payload is an ISO string. One formatter serves both.
    expect(formatDate(new Date(Date.UTC(2026, 6, 3)))).toBe("03 Jul");
    expect(formatDate(Date.UTC(2026, 6, 3))).toBe("03 Jul");
  });
});

describe("formatAgo", () => {
  it("reports one coarse unit", () => {
    expect(formatAgo(0)).toBe("0s");
    expect(formatAgo(15_000)).toBe("15s");
    expect(formatAgo(134_000)).toBe("2m");
    expect(formatAgo(3 * 3_600_000 + 60_000)).toBe("3h");
  });

  it("never reports a negative age", () => {
    // Clock skew between the daemon's stamp and the browser's is real; "-2s
    // ago" would read as a bug in the page rather than in the clocks.
    expect(formatAgo(-500)).toBe("0s");
  });
});
