import type { FileNode } from "@/types/file";

export const ROOTS = ["desktop", "downloads", "documents"] as const;
export type Root = (typeof ROOTS)[number];

export const ROOT_LABELS: Record<Root, string> = {
  desktop: "Desktop",
  downloads: "Downloads",
  documents: "Documents",
};

/**
 * A fixed instant, not Date.now(). Every seeded timestamp is derived from it,
 * so the tree is byte-identical across reloads and the persisted mutation
 * overlay always lands on the rows it was recorded against.
 */
export const SEED_EPOCH = 1_754_000_000_000;
const HOUR = 3_600_000;

/** Big enough that a naive non-virtualized list would visibly stutter. */
export const DOWNLOADS_BULK_COUNT = 800;

const KB = 1024;

function file(
  dir: string,
  name: string,
  ageHours: number,
  sizeBytes: number,
  extra: Partial<FileNode> = {},
): FileNode {
  return {
    id: `${dir}/${name}`,
    name,
    kind: "file",
    sizeBytes,
    modifiedAt: SEED_EPOCH - ageHours * HOUR,
    ...extra,
  };
}

function dir(parent: string, name: string, ageHours: number): FileNode {
  return {
    id: `${parent}/${name}`,
    name,
    kind: "dir",
    sizeBytes: 0,
    modifiedAt: SEED_EPOCH - ageHours * HOUR,
  };
}

/**
 * Stands in for a real capture. A PNG large enough to look like a screenshot
 * would be tens of kilobytes of base64 in source; an SVG renders legibly, is
 * a few hundred bytes, and downloads as a valid file matching its extension.
 */
export const SCREENSHOT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
     <rect width="480" height="270" fill="#0b0e10"/>
     <rect x="0" y="0" width="480" height="28" fill="#15191c"/>
     <circle cx="16" cy="14" r="4" fill="#d4a574"/>
     <rect x="16" y="52" width="150" height="180" rx="6" fill="#15191c"/>
     <rect x="182" y="52" width="282" height="98" rx="6" fill="#15191c"/>
     <rect x="182" y="166" width="282" height="66" rx="6" fill="#15191c"/>
     <rect x="32" y="72" width="96" height="8" rx="4" fill="#6b8e7a"/>
     <rect x="32" y="92" width="72" height="8" rx="4" fill="#3a3f43"/>
     <rect x="198" y="72" width="180" height="8" rx="4" fill="#8a9aa8"/>
     <rect x="198" y="90" width="140" height="8" rx="4" fill="#3a3f43"/>
   </svg>`,
)}`;

const NOTES_MD = `# tonight

- ship the commands page
- ask her to stop autoplaying while I'm reading
- the routing table is the whole pitch, lead with it
`;

const ROUTER_PY = `def route(goal: str) -> Stack:
    if preference := prefs.get(goal):
        return preference
    if url_pattern.match(goal):
        return Stack.BROWSER
    if proc := running_process_for(goal):
        return Stack.APPS
    return Stack.VISION  # last resort, never first
`;

const TENKA_CSS = `:root {
  --bg: #0b0e10;
  --bone: #f2ede4;
  --amber: #d4a574;
}
`;

const PACKING_MD = `# packing

passport · charger · the good headphones
`;

/** Deterministic filler: names, sizes and dates all derived from the index. */
function bulkDownloads(): FileNode[] {
  const out: FileNode[] = [];
  for (let i = 0; i < DOWNLOADS_BULK_COUNT; i++) {
    const n = String(i + 1).padStart(4, "0");
    out.push(
      file("downloads", `invoice-${n}.pdf`, i, 40 * KB + i * 137, {
        contentKind: "binary",
      }),
    );
  }
  return out;
}

/**
 * Builds the whole mock filesystem as a per-directory listing map — the same
 * shape a real GET /files?path= returns, one entry per directory, so spec 5
 * can fetch lazily without reshaping anything.
 */
export function seedTree(): Record<string, FileNode[]> {
  const tree: Record<string, FileNode[]> = {};

  tree.desktop = [
    dir("desktop", "captures", 6),
    file("desktop", "notes.md", 2, NOTES_MD.length, {
      contentKind: "text",
      content: NOTES_MD,
    }),
    file("desktop", "router.py", 9, ROUTER_PY.length, {
      contentKind: "code",
      content: ROUTER_PY,
      language: "python",
    }),
    file("desktop", "wallpaper.svg", 30, 620, {
      contentKind: "image",
      content: SCREENSHOT_SVG,
    }),
  ];

  tree["desktop/captures"] = [
    file("desktop/captures", "capture-old.svg", 48, 620, {
      contentKind: "image",
      content: SCREENSHOT_SVG,
    }),
  ];

  tree.downloads = [
    dir("downloads", "invoices", 1),
    dir("downloads", "installers", 20),
    ...bulkDownloads(),
  ];

  tree["downloads/invoices"] = [
    file("downloads/invoices", "summary.md", 3, 180, {
      contentKind: "text",
      content: "# invoices\n\nQ2 totals are in the spreadsheet, not here.\n",
    }),
  ];

  tree["downloads/installers"] = [
    file("downloads/installers", "setup-1.4.2.exe", 22, 48 * KB * 1024, {
      contentKind: "binary",
    }),
  ];

  tree.documents = [
    dir("documents", "trips", 72),
    file("documents", "tenka.css", 14, TENKA_CSS.length, {
      contentKind: "code",
      content: TENKA_CSS,
      language: "css",
    }),
    file("documents", "resume.pdf", 200, 190 * KB, { contentKind: "binary" }),
  ];

  tree["documents/trips"] = [
    file("documents/trips", "packing.md", 80, PACKING_MD.length, {
      contentKind: "text",
      content: PACKING_MD,
    }),
  ];

  return tree;
}
