import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFrame, parseCpuProfile, shortenUrl, summarizeCpuProfile } from "./cpuprofile.ts";

describe("classifyFrame", () => {
  it("puts tatenuki sources in the tatenuki bucket", () => {
    assert.equal(classifyFrame("get", "packages/tatenuki/src/get.ts"), "tatenuki");
  });

  it("puts InferDI sources in the inferdi bucket", () => {
    assert.equal(
      classifyFrame(
        "get",
        "node_modules/.pnpm/@inferdi+inferdi@6.0.2/node_modules/@inferdi/inferdi/dist/index.js",
      ),
      "inferdi",
    );
  });

  it("puts empty scripts and V8 frames in the runtime bucket", () => {
    assert.equal(classifyFrame("(garbage collector)", ""), "runtime");
    assert.equal(classifyFrame("get", "node:internal/util"), "runtime");
  });
});

describe("shortenUrl", () => {
  it("keeps the path from the repository marker", () => {
    assert.equal(
      shortenUrl("file:///Users/dev/typescript/musuhi/packages/tatenuki/src/get.ts"),
      "packages/tatenuki/src/get.ts",
    );
  });
});

describe("summarizeCpuProfile", () => {
  it("groups self samples by function and file", () => {
    const profile = parseCpuProfile(
      JSON.stringify({
        nodes: [
          {
            id: 1,
            callFrame: {
              functionName: "get",
              url: "file:///repo/packages/tatenuki/src/get.ts",
              lineNumber: 1,
              columnNumber: 1,
            },
            hitCount: 0,
          },
          {
            id: 2,
            callFrame: {
              functionName: "get",
              url: "file:///repo/packages/tatenuki/src/container.ts",
              lineNumber: 1,
              columnNumber: 1,
            },
            hitCount: 0,
          },
          {
            id: 3,
            callFrame: { functionName: "(program)", url: "", lineNumber: 0, columnNumber: 0 },
            hitCount: 0,
          },
        ],
        samples: [1, 1, 2, 3],
        startTime: 0,
        endTime: 4000,
      }),
    );

    const summary = summarizeCpuProfile("sample.cpuprofile", profile);
    assert.equal(summary.samples, 4);
    assert.equal(summary.durationMicros, 4000);
    assert.equal(summary.frames[0]?.functionName, "get");
    assert.equal(summary.frames[0]?.url, "packages/tatenuki/src/get.ts");
    assert.equal(summary.frames[0]?.samples, 2);
    const tatenuki = summary.buckets.find((row) => row.bucket === "tatenuki");
    assert.equal(tatenuki?.samples, 3);
  });
});
