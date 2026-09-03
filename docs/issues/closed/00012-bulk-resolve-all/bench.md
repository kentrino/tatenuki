# Benchmark comparison

Compared baseline `6330d5b` with optimized revision `c6615fa` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- The 1,000-component `resolveAll()` case improved from 2,277.13 to 7,687.31 ops/s: **+237.59% (3.38x)**. Reported measurement error was ±1.10% and ±0.60%.
- The gap to the fastest InferDI result narrowed from 11.64x to 3.68x.
- InferDI controls in that suite moved by +5.07% and +6.73%. The tatenuki gain is larger than that control movement and the reported error.

## Regressions

- The two equivalent reused-builder single-root cases moved by -8.94% and -0.07%. Their spread matches earlier one-run variation on this path; this change does not alter that `get()` work.
- The 4-lazy-root case moved by -9.38%. InferDI fast in the same file moved by -5.20%.
- Container build and first singleton `get()` moved by -1.83%, near the reported error. Cached asynchronous `get()` moved by +4.02%.
- This is a one-run comparison. Control variation limits attribution of the non-target movements to the new code.
