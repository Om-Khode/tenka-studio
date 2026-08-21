import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { RootTabs } from "./RootTabs";
import { Breadcrumb } from "./Breadcrumb";
import { FileToolbar } from "./FileToolbar";
import { useFileStore, deriveEntriesByDir } from "@/store/file-store";
import { seedTree, ROOTS } from "@/store/file-scripts";
import { configureRepos } from "@/services/repo-registry";
import { demoRepoBundle } from "@/services/repos/demo";

/** Mirrors store/file-store.test.ts's `ready()` -- a completed load(), without driving it. */
function ready() {
  const rawByDir = seedTree();
  const overlay = { renames: {}, deleted: [], created: [] };
  useFileStore.setState({
    ...useFileStore.getInitialState(),
    roots: [...ROOTS],
    rawByDir,
    overlay,
    entriesByDir: deriveEntriesByDir(rawByDir, overlay),
    status: "ready",
  });
}

describe("Files navigation chrome", () => {
  beforeEach(ready);

  describe("RootTabs", () => {
    it("renders exactly the three PRD roots", () => {
      render(<RootTabs />);
      expect(screen.getAllByRole("tab")).toHaveLength(3);
    });

    it("marks the active root as selected", () => {
      render(<RootTabs />);
      expect(screen.getByRole("tab", { name: "Desktop" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("switching root moves the store", () => {
      render(<RootTabs />);
      fireEvent.click(screen.getByRole("tab", { name: "Downloads" }));
      expect(useFileStore.getState().currentDirId).toBe("downloads");
    });

    it("stays selected on the root even when the user has descended into it", () => {
      useFileStore.getState().openDir("desktop/captures");
      render(<RootTabs />);
      expect(screen.getByRole("tab", { name: "Desktop" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  describe("Breadcrumb", () => {
    it("shows a single crumb at a root", () => {
      render(<Breadcrumb />);
      expect(screen.getAllByTestId("crumb")).toHaveLength(1);
      expect(screen.getByText("Desktop")).toBeInTheDocument();
    });

    it("shows one crumb per level once descended", () => {
      useFileStore.getState().openDir("desktop/captures");
      render(<Breadcrumb />);
      expect(screen.getAllByTestId("crumb")).toHaveLength(2);
      expect(screen.getByText("captures")).toBeInTheDocument();
    });

    it("clicking an ancestor crumb climbs back to it", () => {
      useFileStore.getState().openDir("desktop/captures");
      render(<Breadcrumb />);
      fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
      expect(useFileStore.getState().currentDirId).toBe("desktop");
    });

    it("renders the current directory as plain text, not a button", () => {
      useFileStore.getState().openDir("desktop/captures");
      render(<Breadcrumb />);
      expect(screen.queryByRole("button", { name: "captures" })).not.toBeInTheDocument();
    });
  });

  describe("FileToolbar", () => {
    it("types into the store's query", () => {
      render(<FileToolbar />);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "notes" } });
      expect(useFileStore.getState().query).toBe("notes");
    });

    it("changes the sort key", () => {
      render(<FileToolbar />);
      fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "modified" } });
      expect(useFileStore.getState().sort).toBe("modified");
    });

    it("resets the demo tree", async () => {
      await useFileStore.getState().remove("desktop/notes.md");
      render(<FileToolbar />);
      fireEvent.click(screen.getByRole("button", { name: /reset/i }));
      expect(useFileStore.getState().overlay.deleted).toEqual([]);
    });

    // Milestone 5b, Task "10c": on /app/files this button offered to
    // "restore the pristine demo tree", of which the machine has none -- and
    // now that live listings are not rendered through the overlay at all, it
    // would also do nothing.
    it("hides the reset button in live mode, where it is both mislabelled and inert", () => {
      configureRepos("live", demoRepoBundle);
      try {
        render(<FileToolbar />);
        expect(
          screen.queryByRole("button", { name: /reset demo files/i }),
        ).not.toBeInTheDocument();
        // The rest of the toolbar is mode-agnostic and stays.
        expect(screen.getByRole("searchbox")).toBeInTheDocument();
      } finally {
        configureRepos("demo", demoRepoBundle);
      }
    });

    it("toggles the preview pane", () => {
      render(<FileToolbar />);
      const before = useFileStore.getState().previewOpen;
      fireEvent.click(screen.getByRole("button", { name: /preview/i }));
      expect(useFileStore.getState().previewOpen).toBe(!before);
    });
  });
});
