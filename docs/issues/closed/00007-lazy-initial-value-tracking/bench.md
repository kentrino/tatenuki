# Benchmark comparison

Compared baseline `c8ce90f` with optimized revision `eb9209e` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Building a container with 1,000 initial values improved from 25,933.31 to 51,658.37 ops/s: **+99.20%**. Reported measurement error was ±0.71% and ±0.31%.

## Regressions

- No regression was found in the target benchmark.
- Container build and first singleton `get()` moved by +2.11%, near the reported ±0.30% error and the two-value construction cost this change removes.
- Cached synchronous `get()` moved by -1.27%. InferDI default on the same suite moved by -1.73%. That path does not construct a fresh container.
- Builder configuration moved by -1.58%, within the combined reported error. That path does not initialize ownership tracking.
- Unchanged InferDI controls moved by as much as +56.69% and -4.75%. This is a one-run comparison, so control variation limits attribution of small cross-run changes outside the target.
