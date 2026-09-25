import { describe, expect, it } from "vitest";
import { parseStartScreen, startPath, startStorageKey } from "./start-screen";

describe("start screen", () => {
  it("defaults to record and only accepts jobs as the other choice", () => {
    expect(parseStartScreen(undefined)).toBe("record");
    expect(parseStartScreen(null)).toBe("record");
    expect(parseStartScreen("")).toBe("record");
    expect(parseStartScreen("record")).toBe("record");
    expect(parseStartScreen("home")).toBe("record");
    expect(parseStartScreen("jobs")).toBe("jobs");
    expect(startPath("record")).toBe("/record");
    expect(startPath("jobs")).toBe("/jobs");
  });

  it("keys the preference by email", () => {
    expect(startStorageKey(" Ada@Example.com ")).toBe("atmosphere-start:ada@example.com");
  });
});
