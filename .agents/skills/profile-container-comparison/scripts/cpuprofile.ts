import { readFile } from "node:fs/promises";

export type CpuProfileCallFrame = {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
};

export type CpuProfileNode = {
  id: number;
  callFrame: CpuProfileCallFrame;
  hitCount?: number;
  children?: number[];
};

export type CpuProfile = {
  nodes: CpuProfileNode[];
  startTime?: number;
  endTime?: number;
  samples?: number[];
};

export type Bucket = "tatenuki" | "inferdi" | "harness" | "bench-runner" | "runtime" | "other";

export type FrameRow = {
  samples: number;
  percent: number;
  functionName: string;
  url: string;
  line: number;
  column: number;
  bucket: Bucket;
};

export type BucketRow = {
  bucket: Bucket;
  samples: number;
  percent: number;
};

export type ProfileSummary = {
  file: string;
  samples: number;
  durationMicros: number | undefined;
  frames: FrameRow[];
  buckets: BucketRow[];
};

const REPO_MARKERS = ["/packages/tatenuki/", "/benchmarks/", "/.cursor/skills/", "/node_modules/"];

export function classifyFrame(functionName: string, url: string): Bucket {
  if (
    functionName === "(garbage collector)" ||
    functionName === "(program)" ||
    functionName === "(idle)" ||
    url === "" ||
    url.startsWith("node:")
  ) {
    return "runtime";
  }
  if (url.includes("packages/tatenuki/")) {
    return "tatenuki";
  }
  if (url.includes("/@inferdi") || url.includes("inferdi/dist/")) {
    return "inferdi";
  }
  if (url.includes("profile-container-comparison/") || url.endsWith("harness.ts")) {
    return "harness";
  }
  if (url.includes("tinybench@") || url.includes("vitest@") || url.includes("vite-plus")) {
    return "bench-runner";
  }
  return "other";
}

export function shortenUrl(url: string): string {
  const withoutScheme = url.replace(/^file:\/\//, "");
  for (const marker of REPO_MARKERS) {
    const index = withoutScheme.indexOf(marker);
    if (index !== -1) {
      return withoutScheme.slice(index + 1);
    }
  }
  return withoutScheme;
}

export function parseCpuProfile(source: string): CpuProfile {
  const parsed: unknown = JSON.parse(source);
  if (typeof parsed !== "object" || parsed === null || !("nodes" in parsed)) {
    throw new Error("CPU profile must be a JSON object with a nodes array.");
  }
  return parsed as CpuProfile;
}

export function summarizeCpuProfile(file: string, profile: CpuProfile): ProfileSummary {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const counts = new Map<number, number>();

  if (profile.samples !== undefined && profile.samples.length > 0) {
    for (const id of profile.samples) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  } else {
    for (const node of profile.nodes) {
      if ((node.hitCount ?? 0) > 0) {
        counts.set(node.id, node.hitCount ?? 0);
      }
    }
  }

  const grouped = new Map<string, Omit<FrameRow, "percent" | "bucket">>();
  let samples = 0;
  for (const [id, count] of counts) {
    const node = byId.get(id);
    if (node === undefined) {
      continue;
    }
    samples += count;
    const functionName = node.callFrame.functionName || "(anonymous)";
    const url = shortenUrl(node.callFrame.url);
    // V8 positions are zero-based; zero in the report means unavailable.
    const line = node.callFrame.lineNumber + 1;
    const column = node.callFrame.columnNumber + 1;
    const key = JSON.stringify([functionName, node.callFrame.url, line, column]);
    const current = grouped.get(key);
    if (current === undefined) {
      grouped.set(key, { samples: count, functionName, url, line, column });
    } else {
      current.samples += count;
    }
  }

  const frames = [...grouped.values()]
    .map((row) => ({
      samples: row.samples,
      percent: samples === 0 ? 0 : (100 * row.samples) / samples,
      functionName: row.functionName,
      url: row.url,
      line: row.line,
      column: row.column,
      bucket: classifyFrame(row.functionName, row.url),
    }))
    .sort(
      (left, right) =>
        right.samples - left.samples || left.functionName.localeCompare(right.functionName),
    );

  const bucketCounts = new Map<Bucket, number>();
  for (const frame of frames) {
    bucketCounts.set(frame.bucket, (bucketCounts.get(frame.bucket) ?? 0) + frame.samples);
  }

  const buckets: BucketRow[] = (
    ["tatenuki", "inferdi", "harness", "bench-runner", "runtime", "other"] as const
  )
    .filter((bucket) => (bucketCounts.get(bucket) ?? 0) > 0)
    .map((bucket) => ({
      bucket,
      samples: bucketCounts.get(bucket) ?? 0,
      percent: samples === 0 ? 0 : (100 * (bucketCounts.get(bucket) ?? 0)) / samples,
    }));

  const durationMicros =
    profile.startTime !== undefined && profile.endTime !== undefined
      ? profile.endTime - profile.startTime
      : undefined;

  return { file, samples, durationMicros, frames, buckets };
}

export async function summarizeCpuProfileFile(file: string): Promise<ProfileSummary> {
  return summarizeCpuProfile(file, parseCpuProfile(await readFile(file, "utf8")));
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function frameLocation(row: FrameRow): string {
  if (!row.url) return "-";
  return row.line > 0 ? `${row.url}:${row.line}:${row.column}` : row.url;
}

function renderFrameRows(frames: readonly FrameRow[], limit: number): string {
  const rows = frames.slice(0, limit);
  return rows
    .map((row) => {
      const samples = String(row.samples).padStart(5);
      const percent = formatPercent(row.percent).padStart(6);
      const bucket = row.bucket.padEnd(12);
      const location = ` ${frameLocation(row)}`;
      return `${samples}  ${percent}  ${bucket}  ${row.functionName}${location}`;
    })
    .join("\n");
}

export function renderTextSummary(summary: ProfileSummary, limit: number): string {
  const duration =
    summary.durationMicros === undefined
      ? "unknown duration"
      : `${(summary.durationMicros / 1000).toFixed(1)} ms`;
  const bucketLines = summary.buckets
    .map(
      (row) =>
        `${row.bucket.padEnd(12)}  ${String(row.samples).padStart(5)}  ${formatPercent(row.percent)}`,
    )
    .join("\n");
  const libraryFrames = summary.frames.filter(
    (frame) => frame.bucket === "tatenuki" || frame.bucket === "inferdi",
  );

  return `${summary.file}: ${summary.samples} samples (${duration})

Buckets
${bucketLines}

Top frames
${renderFrameRows(summary.frames, limit)}

Library frames (all sampled locations)
${libraryFrames.length === 0 ? "(none)" : renderFrameRows(libraryFrames, libraryFrames.length)}`;
}

export function renderMarkdownSummary(summary: ProfileSummary, limit: number): string {
  const duration =
    summary.durationMicros === undefined
      ? "unknown"
      : `${(summary.durationMicros / 1000).toFixed(1)} ms`;
  const bucketRows = summary.buckets
    .map((row) => `| ${row.bucket} | ${row.samples} | ${formatPercent(row.percent)} |`)
    .join("\n");
  const frameRows = summary.frames
    .slice(0, limit)
    .map(
      (row) =>
        `| ${row.samples} | ${formatPercent(row.percent)} | ${row.bucket} | \`${row.functionName}\` | \`${frameLocation(row)}\` |`,
    )
    .join("\n");
  const tatenukiRows = summary.frames
    .filter((row) => row.bucket === "tatenuki")
    .map(
      (row) =>
        `| ${row.samples} | ${formatPercent(row.percent)} | \`${row.functionName}\` | \`${frameLocation(row)}\` |`,
    )
    .join("\n");

  return `## ${summary.file}

- Samples: ${summary.samples}
- Duration: ${duration}

### Buckets

| Bucket | Samples | Share |
| --- | ---: | ---: |
${bucketRows}

### Top frames

| Samples | Share | Bucket | Function | File |
| ---: | ---: | --- | --- | --- |
${frameRows}

### Tatenuki source locations (all sampled locations)

Shares use all profile self samples. Locations identify function starts, not hot statements.
Match locations against the captured source revision to recover class names and TypeScript signatures.
Absent frames do not prove zero cost; optimized code can inline functions.

| Self samples | Share | Function | File:line:column (1-based) |
| ---: | ---: | --- | --- |
${tatenukiRows || "| - | - | (none) | - |"}
`;
}
