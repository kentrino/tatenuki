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
