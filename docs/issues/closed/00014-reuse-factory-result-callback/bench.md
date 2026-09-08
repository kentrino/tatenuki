# Benchmark comparison

Compared baseline `8e2e26c` with optimized revision `90484bb` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision. The change was reverted.

## Main improvement

- No target improved beyond measurement error.
- The 1,000-component 4-lazy-root case moved from 1,482,318.65 to 1,474,375.36 ops/s: **-0.54%**. Reported measurement error was ±0.31% and ±0.32%.
- Fresh-root partial resolution of 3 components moved from 3,418,490.80 to 3,416,194.05 ops/s: **-0.07%**.
- `resolveAll` moved from 8,192.27 to 8,147.18 ops/s: **-0.55%**, inside the reported error.

## Regressions

- Container build and first singleton `get()` moved from 3,531,736.46 to 3,135,449.54 ops/s: **-11.22%**. Reported measurement error was ±0.32% and ±0.89%. InferDI controls in the same suite moved by -9.71% and -7.75%, so this drop is not attributed to the change alone.
- Fresh-context partial resolution of 3 components moved from 3,373,952.83 to 3,010,761.49 ops/s: **-10.76%**. Reported measurement error was ±0.68% and ±1.49%. InferDI controls in that suite moved by +8.76% and +6.87%. The new run had a 3.5ms outlier.
- 1,000-value construction moved from 48,986.85 to 47,050.08 ops/s: **-3.95%**. Reported measurement error was ±0.29% and ±0.57%. The change allocated the callback at construction time.
- Unchanged cached async `get()` moved by -2.43%. InferDI controls moved by about -2.1%.
- This is a one-run comparison. Control variation limits attribution of the larger first-`get()` drops.
