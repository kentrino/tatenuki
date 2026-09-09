# Benchmark comparison

Compared baseline `6762fc7` with optimized revision `d01029d` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Configuring a 1,000-component builder with 8 factory and override steps improved from 734.39 to 5,392.15 ops/s: **+634.24% (7.34x)**. Reported measurement error was ±0.78% and ±0.70%.

## Regressions

- No regression was found in the target benchmark.
- Build-and-first-`get()` moved by -1.28%, while unchanged controls moved by -3.65% and -0.10%. Cached synchronous `get()` moved by -0.22%. These paths do not exercise fluent builder variants.
- Unchanged controls in the full suite moved by as much as +16.45% and -5.27%. This is a one-run comparison, so control variation limits attribution of small cross-run changes outside the target.
