# Benchmark comparison

Compared baseline `b0618f9` with optimized revision `3b3ab26` using Vitest 4.1.10. Changes below use throughput (`hz`; higher is better) from one run per revision.

## Main improvement

- The 1,000-component 4-lazy-root case improved from 912,797.09 to 1,185,504.73 ops/s: **+29.88% (1.30x)**. Reported measurement error was ±0.21% and ±0.24%.
- InferDI controls in that suite moved by +4.72% and -1.70%. The tatenuki gain is larger than that control movement and the reported error.

## Regressions

- Single-root first-resolution cases moved by -1.11% and -3.13%. InferDI controls in the same files moved by as much as +16.78% and -14.09%.
- Cached singleton `get()` changed by less than 0.4%, inside or near the reported error.
- This is a one-run comparison. Control variation limits attribution of small cross-run changes outside the 4-lazy-root target.
