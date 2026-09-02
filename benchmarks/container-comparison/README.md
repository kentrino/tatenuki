# Container comparison benchmarks

This private workspace compares the public container APIs of tatenuki and
InferDI using Vitest's benchmark runner.

Run it from the repository root:

```sh
pnpm --filter @tatenuki/benchmark-container-comparison bench
```

The cached-singleton suite resolves the graph once before measurement, isolating
the steady-state `get()` path. The build-and-first-get suite creates and resolves
a fresh container in every sample. InferDI is measured in both default and fast
modes.
