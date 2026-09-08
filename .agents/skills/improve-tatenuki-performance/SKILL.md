---
name: improve-tatenuki-performance
description: Implements one measured performance improvement in tatenuki. Use when the user gives an improvement direction and asks to implement, test, benchmark, document, and commit it.
---

# Improve Tatenuki Performance

## Required input

Get one improvement direction from the user.

The direction must identify these items:

- The target operation or benchmark case.
- The proposed change or the code area to examine.
- The behavior that must not change.

The user can also give analysis document paths and ask you to select one change.
Select only one change.
State the selected change before you edit code.
Ask for more information if you cannot measure the direction.

Example request:

```text
Use improve-tatenuki-performance.
Direction: Return cached get() values before in-flight tracking.
Keep disposal checks and public behavior unchanged.
Measure the cached singleton get benchmark.
```

## Rules

- Keep the change small.
- Do not change the public API unless the user asks for this change.
- Do not change unrelated files.
- Do not remove unrelated work from the working tree.
- Add a test that protects the required behavior.
- Store raw benchmark output in `.bench/<revision>/`.
- Use short and direct English in issue files and reports.
- Do not push commits unless the user asks you to push them.

## Procedure

### 1. Check the repository

Read these files:

- `packages/tatenuki/src/`
- `packages/tatenuki/package.json`
- `benchmarks/container-comparison/src/`
- `benchmarks/container-comparison/package.json`
- `mise.toml`
- `.gitignore`

Run these commands:

```sh
git status --short --untracked-files=all
git diff
git diff --cached
git log --oneline -10
```

Record all pre-existing changes.
Do not include these changes in a commit for this task.
Stop and ask the user if a pre-existing change can affect the selected benchmark.
Stop and ask the user if a pre-existing change overlaps a file that you must edit.

### 2. Record the baseline

Get the short revision:

```sh
git rev-parse --short HEAD
```

Use this revision as the baseline revision.
If `.bench/<baseline-revision>/` does not contain the required results, run:

```sh
OUTPUT_DIR=.bench mise bench
```

Check that these files exist:

- `.bench/<baseline-revision>/INDEX.md`

Use only the files that apply to the selected change.
Do not edit the baseline files.

### 3. Open an issue

Select the next unused five-digit issue number.
Make a short lowercase slug.
Create this file:

`docs/issues/open/<number>-<slug>/INDEX.md`

Use this default format:

```markdown
# Abstract

<One or two sentences that state the change and the behavior that must not change.>

# Problem

<The slow path and its cause. Optional.>

# Hypothesis

<The expected effect of the change on the target benchmark. Optional.>
```

You can adapt this format to the issue.
`Abstract` is required.
The other sections are optional.
You can add another H1 section when the issue needs it.
Keep the number of H1 sections small.

### 4. Implement one change

Inspect the hot path and its tests.
Make the smallest change that follows the improvement direction.
Add or update a focused regression test.
Do not optimize a different path in the same task.

### 5. Verify the change

Run the focused test first.
Run the package check next.

Use commands of this form:

```sh
pnpm --filter tatenuki test --run <test-file>
pnpm --filter tatenuki check
```

Run the full repository check:

```sh
pnpm ready
```

Fix failures that the change caused.
If a pre-existing failure blocks the work, stop and report it.

### 6. Close the issue

Move the issue directory to:

`docs/issues/closed/<number>-<slug>/`

Keep the issue text accurate.
Do not add benchmark claims before you have benchmark results.

### 7. Commit the implementation

Use Git commands directly.
Do not invoke a commit skill.
Do not delegate the commit to another agent.
Do not use `git add .`.

Inspect the changes again:

```sh
git status --short --untracked-files=all
git diff
git diff --cached
git log --oneline -10
```

Stage only the implementation files, the test files, and the closed issue file.
Use exact file paths with `git add`.
Inspect the staged diff.

```sh
git diff --cached --check -- <exact-task-paths>
git diff --cached -- <exact-task-paths>
```

Create one implementation commit.
Use the repository commit style.
Use a `perf(tatenuki):` prefix for a performance change.
Pass the message with a heredoc.
Do not skip Git hooks.
If the index contained pre-existing changes, use `git commit --only` with all exact task paths.
This command keeps unrelated staged changes out of the commit.

```sh
git commit --only -m "$(cat <<'EOF'
perf(tatenuki): <short reason for the change>

EOF
)" -- <exact-task-paths>
```

### 8. Record the new result

Get the short revision of the implementation commit:

```sh
git rev-parse --short HEAD
```

Run the same benchmark:

```sh
OUTPUT_DIR=.bench mise bench
```

Check that `.bench/<new-revision>/` contains the required results.
Do not commit these files.

### 9. Compare the results

Compare the `hz` values for the baseline revision and the new revision.
Higher `hz` is better.
Calculate the percent change with this formula:

```text
((new hz / baseline hz) - 1) * 100
```

Check the reported measurement error.
Use unchanged implementations as controls.
Do not assign small cross-run changes to the new code without evidence.
Report all target regressions.
If the target does not improve beyond the measurement error, stop and report the result.
Do not write or commit a success report.

### 10. Write the benchmark report

Create this file:

`docs/issues/closed/<number>-<slug>/bench.md`

Use this structure:

```markdown
# Benchmark comparison

Compared baseline `<baseline-revision>` with optimized revision `<new-revision>` using Vitest `<version>`. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- <Target result and percent change.>

## Regressions

- <Regression and measurement context, or state that no regression was found.>
```

State the limits of a one-run comparison.
Keep the report factual.

### 11. Commit the report

Inspect the work tree and the report.
Stage only `bench.md`.
Check that no `.bench/` file is staged.
If the index contains unrelated changes, use `git commit --only` with the report path.

```sh
git add docs/issues/closed/<number>-<slug>/bench.md
git diff --cached --check -- docs/issues/closed/<number>-<slug>/bench.md
git diff --cached -- docs/issues/closed/<number>-<slug>/bench.md
git commit --only -m "$(cat <<'EOF'
docs: summarize <target> benchmark comparison

EOF
)" -- docs/issues/closed/<number>-<slug>/bench.md
```

Do not invoke a commit skill.
Do not delegate the commit to another agent.
Do not skip Git hooks.

### 12. Report the result

Report these items:

- The selected improvement direction.
- The implementation commit.
- The report commit.
- The tests and checks.
- The baseline revision and the new revision.
- The main throughput change.
- The path to `bench.md`.
- All files that remain uncommitted.
