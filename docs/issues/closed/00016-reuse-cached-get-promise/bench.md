# Benchmark comparison

Compared baseline `f1e9b0f` with optimized revision `2696978` using Vitest `4.1.10`. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- Cached singleton `get()` improved from 11,408,451.52 to 12,913,903.66 ops/s: **+13.20%**. Reported measurement error was ±1.93% and ±1.81%. Unchanged tatenuki sync `get()` after `resolveAll` moved by +0.27%. InferDI cached-get controls moved by +0.82% and +1.59%.
- The remaining gap to InferDI sync `get()` is still about 3.8x. The bench still `await`s tatenuki's Promise API.

## Regressions

- 1,000-value construction fell from 49,121.52 to 47,463.78 ops/s (**-3.37%**; ±0.39% and ±0.45%). There is no InferDI control in that suite. The extra per-container promise cache field can explain a small construction cost.
- Async `resolveAll` in a fresh context moved from 2,206,456.75 to 2,157,255.65 ops/s (**-2.23%**; ±1.40% and ±0.49%). InferDI controls in that suite moved by +0.84% and -0.23%. This is close to measurement error and is not attributed to the cached-`get()` path.
- No other target regression was found. Some uncached and lifecycle cases also moved by several percent, including a large swing on one InferDI control, so those changes are treated as one-run noise unless they exceed both tatenuki error and control movement.
