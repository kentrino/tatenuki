# Benchmark comparison

Compared baseline `00d93c6` with optimized revision `300a95d` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Container build and first singleton `get()` improved from 2,082,075.58 to 2,624,291.11 ops/s: **+26.04%**. Reported measurement error was ±1.37% and ±1.08%.
- The gap to the fastest InferDI result narrowed from 3.08x to 2.40x.
- The two equivalent reused-builder partial-resolution cases improved by **+3.14%** and **+12.73%**. Their spread shows that one-run execution order and cross-run variation affect the result.

## Regressions

- Cached asynchronous `get()` changed from 9,372,846.76 to 9,327,439.96 ops/s (**-0.48%**), within the reported measurement error.
- No other tatenuki throughput regression was observed.
- InferDI controls ranged from -4.29% to +19.15% across runs. This is a one-run comparison, so control variation limits attribution of smaller changes.
