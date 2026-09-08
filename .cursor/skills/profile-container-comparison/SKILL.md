---
name: profile-container-comparison
description: >-
  Captures V8 CPU profiles for tatenuki and InferDI container cases and
  summarizes self samples by function and package. Use when the user asks to
  profile tatenuki, explain why a container benchmark is slow, aggregate
  .cpuprofile files, or compare hot paths with InferDI.
---

# Profile Container Comparison

## Goal

Find the hot path in a container comparison case.
Write a short report from measured samples.

## Rules

- Run the script that this skill provides.
- Do not write a one-off profiler.
- Do not use a Vitest bench process as the only profile.
- The bench runner adds samples that hide the container path.
- Write the report under `docs/` or under the related issue directory.
- Do not commit `.cpuprofile` files.
- `.cpu-profile/` is already ignored.

## Procedure

1. Select a built-in scenario name or a saved profile file.
2. Run the script from the repository root with Node type strip mode.
3. Read the printed buckets and library frames.
4. Open the source files that the library frames name.
5. Write the report from the template in [reference.md](reference.md).

## Script

The script path is `.cursor/skills/profile-container-comparison/scripts/profile.ts`.
Run the script with Node type strip mode.

Capture one built-in case:

```sh
node --experimental-strip-types .cursor/skills/profile-container-comparison/scripts/profile.ts run --scenario cached-tatenuki
```

Capture every built-in case:

```sh
node --experimental-strip-types .cursor/skills/profile-container-comparison/scripts/profile.ts run --all
```

Summarize saved profiles:

```sh
node --experimental-strip-types .cursor/skills/profile-container-comparison/scripts/profile.ts summarize .cpu-profile/<revision>/*.cpuprofile
```

Run `mise profile -- run --scenario cached-tatenuki` as an equivalent command.

The `run` command writes profiles and `INDEX.md` to `.cpu-profile/<revision>/`.
The profiler starts after setup. The samples cover the loop only.

## Built-in scenarios

- `cached-tatenuki` and `cached-inferdi` measure a warm singleton `get()`.
- `first-tatenuki` and `first-inferdi` build a small container and resolve `service` once.
- `partial-tatenuki` and `partial-inferdi` build a fresh context and resolve 3 of 1,000 keys.

Pair each tatenuki case with the InferDI case of the same name.
InferDI uses fast mode.

## How to read the summary

The summary counts V8 self samples.
It groups frames by function name and file.
It then assigns each group to a bucket.

- `tatenuki` is code under `packages/tatenuki/`.
- `inferdi` is code from `@inferdi/inferdi`.
- `harness` is the profile loop.
- `bench-runner` is Vitest or tinybench.
- `runtime` is V8, Node internals, GC, idle, or program.
- `other` is the rest.

Use library frames to name the cause.
Use `runtime` GC share to judge allocation cost.
Do not treat harness time as container cost.
Do not compare `hz` from Vitest with `ns/op` from this script as one number.

## After the script

Open the tatenuki and InferDI files that the library frames name.
Confirm the frames against the current source.
State what the samples show.
State what the samples do not show.

## Tests

After you change the script, run:

```sh
node --experimental-strip-types --test .cursor/skills/profile-container-comparison/scripts/cpuprofile.test.ts
```

## Report

Use the template in [reference.md](reference.md).
Keep the report factual.
Keep each sentence to 25 words or less.
