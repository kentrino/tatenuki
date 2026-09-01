import { describe, expect, it } from "vite-plus/test";
import { hasCycle } from "./hasCycle.ts";

describe("hasCycle", () => {
  it("returns false for an acyclic graph", async () => {
    expect(
      await hasCycle(
        {
          application: ["repository", "logger"],
          repository: ["logger"],
          logger: [],
        },
        "application",
      ),
    ).toBe(false);
  });

  it("returns true for a reachable cycle", async () => {
    expect(
      await hasCycle(
        {
          first: ["second"],
          second: ["third"],
          third: ["first"],
        },
        "first",
      ),
    ).toBe(true);
  });

  it("ignores cycles that are not reachable from the starting key", async () => {
    expect(
      await hasCycle(
        {
          root: ["leaf"],
          leaf: [],
          first: ["second"],
          second: ["first"],
        },
        "root",
      ),
    ).toBe(false);
  });
});
