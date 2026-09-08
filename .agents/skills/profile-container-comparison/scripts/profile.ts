import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { Session } from "node:inspector/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  renderMarkdownSummary,
  renderTextSummary,
  summarizeCpuProfile,
  summarizeCpuProfileFile,
  type CpuProfile,
  type ProfileSummary,
} from "./cpuprofile.ts";
import { isScenario, prepareScenario, runScenario, SCENARIOS, type Scenario } from "./harness.ts";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);

type Format = "text" | "json" | "markdown";

function usage(): string {
  return `Usage:
  node --experimental-strip-types ${scriptPath} summarize <file.cpuprofile>...
  node --experimental-strip-types ${scriptPath} run --scenario <name>
  node --experimental-strip-types ${scriptPath} run --all
  node --experimental-strip-types ${scriptPath} loop --scenario <name> --iterations <n>

summarize options:
  --limit <n>              Top frame count (default: 20)
  --format text|json|markdown
  --output <file>          Write the rendered summary

run options:
  --scenario <name>        One of: ${SCENARIOS.join(", ")}
  --all                    Run every built-in scenario
  --duration-ms <n>        Target profile duration (default: 2500)
  --iterations <n>         Fixed iteration count. This overrides --duration-ms
  --output-dir <dir>       Directory for profiles (default: .cpu-profile/<revision>)
  --limit <n>              Top frame count in the printed summary
  --format text|json|markdown
`;
}

function parseArgs(argv: string[]): {
  command: "summarize" | "run" | "loop" | "help";
  values: Record<string, string | undefined>;
  files: string[];
} {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help", values: {}, files: [] };
  }

  const command = argv[0];
  if (command !== "summarize" && command !== "run" && command !== "loop") {
    throw new Error(`Unknown command: ${command}`);
  }

  const values: Record<string, string | undefined> = {};
  const files: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      return { command: "help", values: {}, files: [] };
    }
    if (argument === "--all") {
      values.all = "true";
      continue;
    }
    if (!argument.startsWith("--")) {
      files.push(argument);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }

  return { command, values, files };
}

async function findRepositoryRoot(start: string): Promise<string> {
  let current = start;
  while (true) {
    try {
      await access(join(current, "packages/tatenuki/src/index.ts"));
      await access(join(current, "benchmarks/container-comparison/package.json"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new Error("Run this script from the musuhi repository.");
      }
      current = parent;
    }
  }
}

async function gitOutput(repositoryRoot: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return stdout.trim();
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseFormat(value: string | undefined): Format {
  if (value === undefined) {
    return "text";
  }
  if (value !== "text" && value !== "json" && value !== "markdown") {
    throw new Error("format must be text, json, or markdown.");
  }
  return value;
}

function renderSummaries(
  summaries: readonly ProfileSummary[],
  format: Format,
  limit: number,
): string {
  if (format === "json") {
    return JSON.stringify(summaries, null, 2);
  }
  if (format === "markdown") {
    return summaries.map((summary) => renderMarkdownSummary(summary, limit)).join("\n");
  }
  return summaries.map((summary) => renderTextSummary(summary, limit)).join("\n\n");
}

function pickIterations(nsPerOperation: number, durationMs: number): number {
  const target = Math.ceil((durationMs * 1_000_000) / Math.max(nsPerOperation, 1));
  return Math.min(Math.max(target, 10_000), 500_000_000);
}

async function calibrate(
  repositoryRoot: string,
  scenario: Scenario,
  durationMs: number,
): Promise<number> {
  const probe = await runScenario(repositoryRoot, scenario, 5_000);
  return pickIterations(probe.nsPerOperation, durationMs);
}

async function captureLoop(
  work: () => Promise<void>,
): Promise<{ profile: CpuProfile; elapsedMs: number }> {
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  try {
    await session.post("Profiler.setSamplingInterval", { interval: 1000 });
  } catch {
    // Some Node builds omit this method. Keep the default interval.
  }
  await session.post("Profiler.start");
  const start = performance.now();
  try {
    await work();
    const elapsedMs = performance.now() - start;
    const result = await session.post("Profiler.stop");
    return { profile: result.profile as CpuProfile, elapsedMs };
  } finally {
    session.disconnect();
  }
}

async function captureScenario(
  repositoryRoot: string,
  scenario: Scenario,
  outputDir: string,
  iterations: number,
): Promise<{
  timing: Awaited<ReturnType<typeof runScenario>>;
  profileFile: string;
  summary: ProfileSummary;
}> {
  await mkdir(outputDir, { recursive: true });
  const profileFile = join(outputDir, `${scenario}.cpuprofile`);
  const work = await prepareScenario(repositoryRoot, scenario, iterations);
  const { profile, elapsedMs } = await captureLoop(work);
  await writeFile(profileFile, `${JSON.stringify(profile)}\n`, "utf8");
  return {
    timing: {
      scenario,
      iterations,
      elapsedMs,
      nsPerOperation: (elapsedMs * 1_000_000) / iterations,
    },
    profileFile,
    summary: summarizeCpuProfile(profileFile, profile),
  };
}

async function commandSummarize(
  files: string[],
  values: Record<string, string | undefined>,
): Promise<string> {
  if (files.length === 0) {
    throw new Error("summarize requires one or more .cpuprofile files.");
  }
  const limit = parsePositiveInteger("limit", values.limit, 20);
  const format = parseFormat(values.format);
  const summaries = await Promise.all(files.map((file) => summarizeCpuProfileFile(resolve(file))));
  const rendered = renderSummaries(summaries, format, limit);
  if (values.output !== undefined) {
    await writeFile(values.output, `${rendered}\n`, "utf8");
  }
  return rendered;
}

async function commandRun(values: Record<string, string | undefined>): Promise<string> {
  const repositoryRoot = await findRepositoryRoot(process.cwd());
  const selected: Scenario[] = [];
  if (values.scenario !== undefined) {
    if (!isScenario(values.scenario)) {
      throw new Error(`Unknown scenario: ${values.scenario}`);
    }
    selected.push(values.scenario);
  } else if (values.all === "true") {
    selected.push(...SCENARIOS);
  } else {
    throw new Error("run requires --scenario <name> or --all.");
  }

  const revision = await gitOutput(repositoryRoot, "rev-parse", "--short", "HEAD");
  const outputDir = resolve(values["output-dir"] ?? join(repositoryRoot, ".cpu-profile", revision));
  const durationMs = parsePositiveInteger("duration-ms", values["duration-ms"], 2500);
  const fixedIterations =
    values.iterations === undefined
      ? undefined
      : parsePositiveInteger("iterations", values.iterations, 1);
  const limit = parsePositiveInteger("limit", values.limit, 20);
  const format = parseFormat(values.format);

  const summaries: ProfileSummary[] = [];
  const notes: string[] = [];

  for (const scenario of selected) {
    const iterations = fixedIterations ?? (await calibrate(repositoryRoot, scenario, durationMs));
    const { timing, profileFile, summary } = await captureScenario(
      repositoryRoot,
      scenario,
      outputDir,
      iterations,
    );
    summaries.push(summary);
    notes.push(
      `${scenario}: ${timing.iterations} iterations, ${timing.nsPerOperation.toFixed(2)} ns/op, ${profileFile}`,
    );
  }

  const rendered = `${notes.join("\n")}\n\n${renderSummaries(summaries, format, limit)}`;
  const indexFile = join(outputDir, "INDEX.md");
  await writeFile(
    indexFile,
    `# Container comparison profiles

- Revision: \`${revision}\`
- Working tree: ${(await gitOutput(repositoryRoot, "status", "--porcelain")) ? "dirty (includes uncommitted changes)" : "clean"}
- Node.js: \`${process.version}\`
- Command argv: \`${JSON.stringify([process.execPath, ...process.execArgv, scriptPath, ...process.argv.slice(2)])}\`
- Timings include profiler overhead and each scenario's sync or async loop.

${notes.map((note) => `- ${note}`).join("\n")}

${summaries.map((summary) => renderMarkdownSummary(summary, limit)).join("\n")}
`,
    "utf8",
  );
  return `${rendered}\n\nWrote ${indexFile}`;
}

async function commandLoop(
  values: Record<string, string | undefined>,
  repositoryRoot: string,
): Promise<string> {
  const scenario = values.scenario;
  if (scenario === undefined || !isScenario(scenario)) {
    throw new Error("loop requires --scenario with a known name.");
  }
  if (values.iterations === undefined) {
    throw new Error("loop requires --iterations <n>.");
  }
  const iterations = parsePositiveInteger("iterations", values.iterations, 1);
  const timing = await runScenario(repositoryRoot, scenario, iterations);
  return JSON.stringify(timing);
}

export async function main(argv: string[]): Promise<string> {
  const parsed = parseArgs(argv);
  if (parsed.command === "help") {
    return usage();
  }
  if (parsed.command === "summarize") {
    return commandSummarize(parsed.files, parsed.values);
  }
  const repositoryRoot = await findRepositoryRoot(process.cwd());
  if (parsed.command === "loop") {
    return commandLoop(parsed.values, repositoryRoot);
  }
  return commandRun(parsed.values);
}

const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath;
if (isEntry) {
  main(process.argv.slice(2))
    .then((output) => {
      process.stdout.write(`${output}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
