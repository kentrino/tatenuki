---
title: "Reduce continuation overhead when different roots share an async dependency"
priority: P2
source: async-resolution-benchmark
---

# Abstract

Test replacing the waiting-root async continuation with a direct Promise chain. The experiment did not establish a repeatable improvement, so the runtime change was rejected. Lazy resolution and factory scheduling stay unchanged.

# Problem

Concurrent `get("users")` and `get("audit")` calls each execute a plan containing the shared `database` dependency. One path enters `continueGetPlanAfterFactory()` and the other enters `continueGetPlanAfterPending()`. Both resume a plan after the dependency settles; the waiting path also writes the shared resolved value again. Each root separately tracks its pending work in the container.

These paths correctly share factory execution, but may perform avoidable Promise, continuation, or bookkeeping work. The actual contribution of each operation has not been profiled. Relevant code: [get.ts](../../../../packages/tatenuki/src/get.ts), [container.ts](../../../../packages/tatenuki/src/container.ts).

# Evidence

Local measurement on 2026-09-08, revision `b7e171f88fbf1c66922de14646c2d763f399d04e`, Vitest 4.1.10. The case is `concurrent roots sharing a pending async dependency in a fresh context` in [async-resolution.bench.ts](../../../../benchmarks/container-comparison/src/async-resolution.bench.ts).

| Implementation | Batches/s | Reported error |
| --- | ---: | ---: |
| tatenuki | 1,428,830.43 | ±1.29% |
| InferDI default | 2,004,352.31 | ±1.80% |
| InferDI fast | 1,629,651.10 | ±32.81% |

InferDI default achieved about 1.40x the throughput. The fast-mode result is too noisy to support a conclusion. Each batch creates a fresh context and awaits both roots; the shared database factory executes once. Builders/roots are reused, and no timers or external I/O are measured. Treat this single run as motivation for an experiment, not proof of the suspected cause.

Reproduce from the repository root:

```sh
pnpm --filter @tatenuki/benchmark-container-comparison bench src/async-resolution.bench.ts
```

# Hypothesis

Profile the factory-owner and waiting-caller paths, then experiment with reducing nested Promise continuations or redundant resolved-state updates while retaining one owner for factory finalization. Only share dependency completion if publication, ownership registration, and error propagation remain correctly ordered. Avoid introducing per-node state whose construction cost outweighs the gain.

[Sharing a pending root resolution](../../closed/00017-share-pending-root-resolution/INDEX.md) only joins callers requesting the same key; the two roots here are distinct. Re-measure this case after that change before adding another optimization. This issue does not propose starting independent factories in parallel.

# Acceptance

- Keep one factory invocation and one ownership registration for the shared dependency, with distinct root values and isolated caches between containers.
- Verify shared dependency rejection and retry, one dependent factory failing while another succeeds, disposal while both roots are pending, and overlap with `resolveAll()`. Preserve existing error and cleanup behavior.
- Demonstrate a repeatable improvement in the two-root case against a matching baseline, accounting for reported error and InferDI control movement. Retain both default and fast comparisons, rerunning noisy results before drawing conclusions.
- Check first-get, same-key concurrency, full-resolution, synchronous resolution, construction, and lifecycle controls for regressions. Close with the measurements if the hypothesis does not yield a worthwhile improvement.

# Result

Closed after one measured experiment against baseline `fe9e860`, Vitest 4.1.10, Node.js 26.2.0. The candidate changed only `continueGetPlanAfterPending()` from an async function with a nested await to `pendingValue.then()` returning the remaining plan. Factory ownership and resolved-value publication stayed in their existing paths.

A short CPU profile of one million two-root batches recorded 547 samples: 15 in the waiting continuation, 32 in the factory-owner continuation, 22 in `trackInflight`, and 38 in `untrackInflight`. This coarse profile does not establish the cost of individual operations or justify a broader rewrite.

| Run | Implementation | Baseline batches/s | Candidate batches/s | Change | Baseline / candidate error |
| --- | --- | ---: | ---: | ---: | --- |
| Full async suite | tatenuki | 1,411,864.59 | 1,342,690.43 | -4.90% | ±0.33% / ±4.53% |
| Full async suite | InferDI default | 2,053,502.30 | 2,099,443.26 | +2.24% | ±0.27% / ±0.29% |
| Full async suite | InferDI fast | 2,022,693.46 | 2,099,132.23 | +3.78% | ±0.85% / ±0.59% |
| Filtered repeat | tatenuki | 1,341,856.10 | 1,445,245.79 | +7.70% | ±0.49% / ±0.36% |
| Filtered repeat | InferDI default | 2,015,103.87 | 2,117,706.82 | +5.09% | ±0.31% / ±0.24% |
| Filtered repeat | InferDI fast | 1,974,153.40 | 2,169,983.91 | +9.92% | ±0.61% / ±0.21% |

The first target comparison regressed 4.90%, with candidate error ±4.53%. The filtered repeat improved 7.70%, while unchanged controls improved 5.09% and 9.92%. The gain was not stable or distinguishable from cross-run control movement. The repeat ran the candidate before the restored baseline. These runs do not prove that all continuation optimizations are ineffective.

The full async candidate run also changed first-get by -0.08%, same-key concurrency by -0.37%, and full resolution by -4.80%. These are exploratory results, not gains attributed to the candidate. The runtime change was removed rather than taking an unproven optimization into the full-suite comparison. No performance implementation or success report was committed.

Five regression cases remain: shared rejection and retry, one dependent failing while another succeeds, ownership and isolation with and without `resolveAll()`, and disposal during two pending roots. The focused tests, package check, and `pnpm ready` passed after restoring the runtime: 93 tests and both package builds. The workspace check retains nine existing profiler-test warnings and no errors.

Raw baseline output is in `.bench/fe9e860/INDEX.md` and its five suite JSON files. The same directory holds `candidate-0018.json`, `candidate-0018-repeat.json`, `baseline-0018-repeat.json`, the rejected `candidate-0018.patch`, and `shared-profile.mjs` / `shared.cpuprofile`. Baseline files were not overwritten. Reproduce the target with `pnpm --filter @tatenuki/benchmark-container-comparison bench src/async-resolution.bench.ts`; the repeats add `-t "concurrent roots sharing a pending async dependency"`.
