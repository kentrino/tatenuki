# Benchmark comparison

Compared baseline `1ffcddc` with optimized revision `1410a61` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Container build and first singleton `get()` improved from 2,719,749.72 to 2,982,564.80 ops/s: **+9.66%**. Reported measurement error was ±0.59% and ±0.30%. InferDI controls in the same suite moved by -0.57% and -1.16%.
- Fresh-context partial resolution of 3 components improved from 2,626,165.76 to 2,749,756.58 ops/s: **+4.71%**. Reported measurement error was ±0.47% and ±0.55%.
- Fresh-root partial resolution of 3 components improved from 2,631,071.41 to 2,753,555.79 ops/s: **+4.66%**.
- Fresh-context resolution of 4 lazy roots improved from 999,001.54 to 1,119,330.31 ops/s: **+12.04%**. InferDI controls in that suite moved by -4.36% and -8.42%, so part of this gain may be cross-run noise.

## Regressions

- No regression was found in the target first-`get()` cases.
- Cached async `get()` moved by -2.79%. That path returns before `getWithPlan()`.
- Unchanged tatenuki `resolveAll` moved by +10.31%, and 1,000-value construction moved by -5.51%. This is a one-run comparison, so control variation limits attribution of small cross-run changes outside the first-`get()` path.
