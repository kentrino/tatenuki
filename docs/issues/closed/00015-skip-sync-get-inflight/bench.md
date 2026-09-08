# Benchmark comparison

Compared baseline `58726e8` with optimized revision `cbca131` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Container build and first singleton `get()` improved from 2,771,333.51 to 3,981,886.31 ops/s: **+43.68%**. Reported measurement error was ±1.25% and ±0.74%. InferDI controls in that suite moved by +6.27% and +1.97%.
- Fresh-context partial resolution of 3 components improved from 3,074,719.77 to 3,856,990.60 ops/s: **+25.44%**. Reported measurement error was ±1.02% and ±0.72%. InferDI controls moved by +4.89% and +5.64%.
- Fresh-root partial resolution of 3 components improved from 3,287,980.75 to 4,081,179.31 ops/s: **+24.12%**. Reported measurement error was ±0.25% and ±0.36%. InferDI controls in that suite moved by a much larger amount, so that case is supporting evidence only.
- Fresh-context resolution of 4 lazy roots improved from 1,397,202.55 to 1,847,096.55 ops/s: **+32.20%**. Reported measurement error was ±1.15% and ±0.31%. InferDI controls moved by +1.66% and +1.38%.
- The tatenuki gains on the first, second, and fourth cases are larger than the tatenuki measurement error and the InferDI control movement. This is a one-run comparison.

## Regressions

- No target regression was found.
- Unchanged tatenuki cached `get()` moved by +5.34% and +0.10%. 1,000-value construction moved by +1.47%. `resolveAll()` moved by +2.32%. Control variation limits attribution of those small cross-run changes.
- The async-resolution and request-lifecycle suites changed on disk between the two runs, so those results are not compared here.
