# Benchmark comparison

Compared baseline `08b4bd3` with optimized revision `4a7bce6` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- The preconfigured fresh-context target improved from 1,856,404.75 to 2,548,038.73 ops/s: **+37.26% (1.37x)**. Reported measurement error was ±0.59% and ±0.55%.
- The equivalent reused-builder case improved from 1,851,288.64 to 2,535,711.64 ops/s: **+36.97% (1.37x)**.
- Container build and first singleton `get()` improved from 2,031,451.52 to 2,329,946.04 ops/s: **+14.69%**.

## Regressions

- No tatenuki throughput regression was observed.
- InferDI controls ranged from -25.61% to +10.48% across runs. The largest regression had ±6.03% measurement error.
- This is a one-run comparison. Control variation limits attribution of small cross-run changes.
