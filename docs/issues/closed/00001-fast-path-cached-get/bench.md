# Benchmark comparison

Compared baseline `bbe0b3e` with optimized revision `6d151f9` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Cached singleton `get()` improved from 5,508,161.94 to 12,649,396.71 ops/s: **+129.65% (2.30x)**.
- The gap to the fastest InferDI result narrowed from 7.53x to 4.01x.
- Uncached tatenuki cases remained effectively stable: first resolution -0.06%, preconfigured partial resolution +1.48%, and fresh-root partial resolution +1.86%.

## Regressions

- Tatenuki container build and first `get()`: 2,095,523.14 → 2,094,346.39 ops/s (**-0.06%**). This is smaller than the reported measurement error.
- InferDI preconfigured partial resolution, default mode: 8,851,487.59 → 8,546,262.63 ops/s (**-3.45%**).
- InferDI preconfigured partial resolution, fast mode: 9,830,750.00 → 9,231,481.22 ops/s (**-6.10%**).

No other throughput regressions were observed. The InferDI control changes indicate cross-run variability, so small differences should not be attributed to this optimization.
