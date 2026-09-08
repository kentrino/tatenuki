# Container comparison benchmarks

This private workspace compares the public container APIs of tatenuki and
InferDI using Vitest's benchmark runner.

Run it from the repository root:

```sh
pnpm --filter @tatenuki/benchmark-container-comparison bench
```

To save each benchmark file's results as JSON, set `OUTPUT_DIR`:

```sh
OUTPUT_DIR=.kentrino/docs pnpm --filter @tatenuki/benchmark-container-comparison bench:json
```

The command derives each slug from its `*.bench.ts` file name and writes to
`OUTPUT_DIR/bench/<revision>/<slug>.json`. For example, `get.bench.ts` writes to
`<revision>/get.json`. The revision is the current Git short SHA. A relative
`OUTPUT_DIR` is resolved from the repository root. The same revision directory
also contains an `INDEX.md` with run metadata, links to the JSON files, and the
complete terminal results.

The cached-singleton suite resolves the graph once before measurement, isolating
the steady-state `get()` path. The build-and-first-get suite creates and resolves
a fresh container in every sample. InferDI is measured in both default and fast
modes.

The partial-resolution suite registers 1,000 components while making only three
reachable from the requested key. Its preconfigured case compares a fresh
tatenuki container built from a reusable builder with a fresh InferDI scope
built from a reusable root. Its fresh-root case also includes InferDI's mutable
registration cost. Both cases create a new resolution context for every sample
so the requested branch is never already cached.

The async-resolution suite covers a shared asynchronous database factory with
synchronous repositories and a service: first `get()`, `resolveAll()`, eight
concurrent reads of the same service, and concurrent reads of two repositories
sharing pending initialization. Every sample builds a fresh container from a
reused tatenuki builder or creates a fresh scope from a reused InferDI root.
InferDI uses scoped `registerAsyncFactory()` registrations and `getAsync()`;
the repository and service factory bodies remain synchronous in both libraries.
The full-resolution comparison uses tatenuki's `resolveAll()` and sequential
InferDI `getAsync()` calls for every key. Setup assertions check both libraries
for one factory invocation per context and shared dependency instances.

The request-lifecycle suite measures `build()` + first `get()` + `dispose()` with
a borrowed application pool and newly created request resources. It includes no
cleanup, synchronous cleanup, and asynchronous cleanup cases. Setup assertions
check both libraries for request isolation, resource cleanup, and that the
borrowed pool stays open. InferDI receives the request ID via `createScope()`
inputs, resolves scoped resources with synchronous `get()`, and awaits `dispose()`.

Every case compares tatenuki with InferDI in default and fast modes, grouped by
the same operation. Async initialization and cleanup yield
through promises without timers or external I/O, keeping the measurement focused
on container and promise overhead. Builders are reused, so measurements include
fresh instances but benefit from resolution plans warmed during benchmark warmup;
they do not measure cold application startup. Concurrent cases report throughput
per whole batch, and lifecycle cases report throughput per whole request.
