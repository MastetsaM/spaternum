import { describe, expect, it } from "vitest";
import type { Folder, Note } from "../sync/db";
import {
  addTags,
  allTags,
  folderTree,
  isEmpty,
  moveTargets,
  searchNotes,
  shownFolder,
  sortNotes,
  title,
  toSave,
} from "./notes";

const T = "2026-10-28T10:00:00.000Z";

function note(id: string, fields: Partial<Note> = {}): Note {
  return { id, body: id, tags: [], pinned: false, folder_id: null, created_at: T, updated_at: T, ...fields };
}

function folder(id: string, parent_id: string | null = null, name = id): Folder {
  return { id, parent_id, name, created_at: T, updated_at: T };
}

describe("title", () => {
  it("is the first line, without heading marks", () => {
    expect(title("Shopping\nmilk\neggs")).toBe("Shopping");
    expect(title("## Plan  \nmore")).toBe("Plan");
  });

  it("says (empty) when the first line is blank", () => {
    expect(title("\nsecond line")).toBe("(empty)");
  });
});

describe("empty notes", () => {
  it("counts only spaces and new lines as empty", () => {
    expect(isEmpty("")).toBe(true);
    expect(isEmpty("  \n\t ")).toBe(true);
    expect(isEmpty(" a ")).toBe(false);
  });

  it("never writes a new note left empty", () => {
    expect(toSave("", null, null, false)).toEqual({ kind: "none" });
    expect(toSave("", null, null, true)).toEqual({ kind: "none" });
  });

  it("creates a new note once it has text, and saves only changes", () => {
    expect(toSave("Idea", null, null, false)).toEqual({ kind: "write", body: "Idea" });
    expect(toSave("Idea", "Idea", null, true)).toEqual({ kind: "none" });
  });

  it("puts back the previous text when an existing note is cleared and left", () => {
    // Typed "Old" → "O" (saved while typing) → cleared → leaves
    expect(toSave("", "O", "Old", false)).toEqual({ kind: "none" });
    expect(toSave("", "O", "Old", true)).toEqual({ kind: "write", body: "Old" });
    // Cleared without anything saved in between: nothing to undo
    expect(toSave("", "Old", "Old", true)).toEqual({ kind: "none" });
  });

  it("archives a new note that was saved while typing and then cleared", () => {
    expect(toSave("", "I", null, true)).toEqual({ kind: "archive" });
  });
});

describe("note list", () => {
  it("shows pinned first, then last edited first", () => {
    const notes = [
      note("old", { updated_at: "2026-10-01T00:00:00.000Z" }),
      note("new", { updated_at: "2026-10-20T00:00:00.000Z" }),
      note("pinned-old", { pinned: true, updated_at: "2026-09-01T00:00:00.000Z" }),
      note("pinned-new", { pinned: true, updated_at: "2026-10-10T00:00:00.000Z" }),
    ];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(["pinned-new", "pinned-old", "new", "old"]);
  });

  it("shows a note at the top level when its folder isn't on the device", () => {
    const ids = new Set(["a"]);
    expect(shownFolder("a", ids)).toBe("a");
    expect(shownFolder("archived", ids)).toBeNull();
    expect(shownFolder(null, ids)).toBeNull();
  });
});

describe("search", () => {
  const notes = [
    note("1", { body: "Call the Dentist", tags: ["health"] }),
    note("2", { body: "dentist bill", tags: ["money", "health"] }),
    note("3", { body: "Groceries", tags: ["home"] }),
  ];
  const ids = (found: Note[]) => found.map((n) => n.id);

  it("finds text anywhere in the body, any case", () => {
    expect(ids(searchNotes(notes, "DENTIST", []))).toEqual(["1", "2"]);
    expect(ids(searchNotes(notes, "  ", []))).toEqual(["1", "2", "3"]);
  });

  it("filters by tags: a note needs every chosen tag", () => {
    expect(ids(searchNotes(notes, "", ["health"]))).toEqual(["1", "2"]);
    expect(ids(searchNotes(notes, "", ["health", "money"]))).toEqual(["2"]);
    expect(ids(searchNotes(notes, "call", ["health"]))).toEqual(["1"]);
  });

  it("lists the tags in use", () => {
    expect(allTags(notes)).toEqual(["health", "home", "money"]);
  });
});

describe("tags", () => {
  it("adds typed tags trimmed and without duplicates", () => {
    expect(addTags(["work"], " idea ")).toEqual(["work", "idea"]);
    expect(addTags(["work"], "work, home,,")).toEqual(["work", "home"]);
  });
});

describe("folder tree", () => {
  it("lists each folder before its sub-folders, sorted by name, any depth", () => {
    const tree = folderTree([folder("b"), folder("a"), folder("a2", "a"), folder("a1", "a"), folder("a1x", "a1")]);
    expect(tree.map((n) => [n.folder.id, n.depth])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a1x", 2],
      ["a2", 1],
      ["b", 0],
    ]);
  });

  it("shows a folder whose parent isn't on the device at the top level", () => {
    expect(folderTree([folder("x", "archived")]).map((n) => [n.folder.id, n.depth])).toEqual([["x", 0]]);
  });

  it("still shows folders caught in a loop", () => {
    const tree = folderTree([folder("a", "b"), folder("b", "a")]);
    expect(tree.map((n) => [n.folder.id, n.depth])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("never offers to move a folder into itself or its sub-folders", () => {
    const folders = [folder("a"), folder("a1", "a"), folder("a1x", "a1"), folder("b"), folder("b1", "b")];
    expect(moveTargets(folders, "a").map((f) => f.id)).toEqual(["b", "b1"]);
    expect(moveTargets(folders, "a1").map((f) => f.id)).toEqual(["a", "b", "b1"]);
  });
});
