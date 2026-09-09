# Benchmark comparison

Compared baseline `862afb8` with optimized revision `b0ecbab` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Fresh-context partial resolution of 3 components improved from 2,713,116.49 to 3,308,402.82 ops/s: **+21.94%**. Reported measurement error was ±2.18% and ±0.85%.
- Fresh-root partial resolution of 3 components improved from 2,817,111.53 to 3,357,925.85 ops/s: **+19.20%**. Reported measurement error was ±0.32% and ±0.50%.
- Fresh-context resolution of 4 lazy roots improved from 1,120,415.11 to 1,288,002.80 ops/s: **+14.96%**. Reported measurement error was ±0.22% and ±0.90%.
- InferDI controls in those suites moved down, some with high reported error (up to ±8.14%). The tatenuki gains are larger than the tatenuki measurement error, but this is a one-run comparison.

## Regressions

- Container build and first singleton `get()` moved from 3,000,344.15 to 2,857,401.36 ops/s: **-4.76%**. Reported measurement error was ±0.23% and ±1.85%. InferDI controls in the same suite moved by -7.95% and -8.82%, so this drop is not attributed to the change.
- Unchanged tatenuki cached `get()` moved by +0.58% and -0.15%. 1,000-value construction moved by -3.90%. Control variation limits attribution of those small cross-run changes.
