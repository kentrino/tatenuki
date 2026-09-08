---
title: "Share pending resolution for concurrent gets of the same key"
priority: P1
source: async-resolution-benchmark
---

# Abstract

Share an unfinished root resolution between concurrent `get()` calls for the same key. Preserve factory invocation counts, value identity, container isolation, retries, and disposal behavior.

# Problem

`FullyDefinedContainer.get()` calls `getPlan()` and `runGetPlan()` for each unresolved request. When eight callers request the same service while its database dependency is pending, each caller creates its own continuation and tracks it as in-flight. The pending factory map prevents duplicate factory execution, but does not share the complete root resolution.

Relevant code: [container.ts](../../../../packages/tatenuki/src/container.ts), [get.ts](../../../../packages/tatenuki/src/get.ts).

# Evidence

Local measurement on 2026-09-08, revision `b7e171f88fbf1c66922de14646c2d763f399d04e`, Vitest 4.1.10. The case is `8 concurrent reads of the same async service in a fresh context` in [async-resolution.bench.ts](../../../../benchmarks/container-comparison/src/async-resolution.bench.ts).

| Implementation | Batches/s | Reported error |
| --- | ---: | ---: |
| tatenuki | 503,451.78 | ±0.24% |
| InferDI default | 1,032,218.28 | ±0.22% |
| InferDI fast | 944,307.83 | ±0.38% |

InferDI default achieved about 2.05x the throughput. Each batch includes fresh context creation and eight awaited calls; this is not individual-call throughput. Builders/roots are reused and initialization yields through a Promise without external I/O. This single run identifies a candidate, not a proven cause or an expected optimization gain.

Reproduce from the repository root:

```sh
pnpm --filter @tatenuki/benchmark-container-comparison bench src/async-resolution.bench.ts
```

# Hypothesis

A per-container entry for an actively resolving root could let later callers join its work before repeating the plan lookup, traversal, and in-flight registration. Allocate additional state only when needed and remove entries after both fulfillment and rejection. Confirm the suspected overhead through profiling or an isolated implementation experiment before choosing the design.

This concerns unfinished resolution, unlike [the reverted fulfilled-Promise cache](../../closed/00016-reuse-cached-get-promise/INDEX.md). [Skipping synchronous in-flight tracking](../../closed/00015-skip-sync-get-inflight/INDEX.md) is already present in the measured baseline.

# Acceptance

- Preserve the Promise-returning API, factory invocation counts, shared value identity, container isolation, and existing retry behavior after rejection. Public Promise identity need not change.
- Verify concurrent success and rejection, retry after failure, and disposal during pending resolution. Disposal must await owned work and dispose each owned value once; new requests after disposal must still reject. Check interaction with overlapping `resolveAll()` calls.
- Compare baseline and candidate repeatedly on the same machine, including this eight-caller case and first-get, cached-get, full-resolution, construction, and lifecycle controls. Assess gains against reported error and InferDI control movement; reject changes that merely move cost into ordinary single-caller cases.
- Keep different-root optimization separate: see [shared dependency continuations](../../open/00018-reduce-shared-dependency-continuations/INDEX.md).

# Implementation

Each container stores its first pending root key and plan directly. A lazy map holds additional pending roots. Later callers await the existing plan without repeating traversal or in-flight registration. The first caller clears its root state on fulfillment or rejection. Cached and synchronous gets do not allocate the map.

Eight regression cases cover reuse of the first pending slot, concurrent value identity and container isolation, dependency and root failures with retries, both call orders with `resolveAll()`, and disposal with and without bulk resolution. The focused tests, package check, and `pnpm ready` pass.
