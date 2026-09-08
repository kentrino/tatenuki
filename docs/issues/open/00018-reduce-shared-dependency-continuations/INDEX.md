---
title: "Reduce continuation overhead when different roots share an async dependency"
priority: P2
source: async-resolution-benchmark
---

# Abstract

Investigate Promise and continuation overhead when different requested keys wait for the same asynchronous dependency. Preserve lazy resolution and existing factory scheduling behavior.

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
