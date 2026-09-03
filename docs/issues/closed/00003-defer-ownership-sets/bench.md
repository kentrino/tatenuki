# Benchmark comparison

Compared baseline `873e475` with optimized revision `76dc1ed` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- The preconfigured fresh-context target improved from 2,405,092.24 to 2,645,819.62 ops/s: **+10.01%**. Reported measurement error was ±0.58% and ±0.35%.
- The equivalent reused-builder case improved from 2,514,508.84 to 2,674,230.55 ops/s: **+6.35%**. Reported measurement error was ±0.47% and ±0.44%.
- Container build and first singleton `get()` increased from 2,251,807.70 to 2,760,198.24 ops/s (**+22.58%**), but the baseline had ±12.71% measurement error, so this result is directional.
- Cached singleton `get()` remained stable at **+0.35%**.

## Regressions

- No tatenuki throughput regression was observed.
- InferDI controls ranged from -2.14% to +4.40% across runs.
- This is a one-run comparison. Control variation and the noisy build baseline limit attribution outside the fresh-context targets.
