# Benchmark comparison

Compared baseline `68c48d6` with optimized revision `4412506` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Cached singleton access improved from 12,560,688.24 ops/s with baseline asynchronous `get()` to 55,239,341.35 ops/s with synchronous `get()` after `resolveAll()`: **+339.78%**. Reported measurement error was ±1.04% and ±0.16%.
- The synchronous path was 10.32% faster than the InferDI default sync control and 13.84% faster than the InferDI fast sync control in the optimized run.
- The benchmark resolves the container before measurement, so it measures steady-state `get()` and excludes the one-time `resolveAll()` cost.

## Regressions

- The existing cached asynchronous `get()` control changed by +1.58%, within the runs' reported measurement error.
- Reused-builder first resolution decreased from 2,680,299.24 to 2,624,507.58 ops/s (**-2.08%**). The equivalent preconfigured case changed by +0.04%, so a one-run comparison does not establish that the new code caused the decrease.
- Container build and first singleton `get()` decreased by 5.82%, but the optimized run had ±11.83% measurement error.
- This is a one-run comparison. Control variation and measurement noise limit attribution outside the synchronous cached-access target.
