# Benchmark comparison

Compared baseline `d1886cc` with optimized revision `1843073` using Vitest 4.1.10 and Node.js 26.2.0. The main comparison uses throughput (`hz`; higher is better) from one full run per revision. Every suite was also repeated once. Each repeat is a separate run, not a pooled estimate.

Raw output is in `.bench/d1886cc/` and `.bench/1843073/`. Each contains `INDEX.md`, the five original suite JSON files, and five repeat JSON files. The async repeat is named `async-repeat.json`; other repeats use `<suite>-repeat.json`. Original files were not overwritten.

Full runs used `OUTPUT_DIR=.bench mise bench`. Repeats invoked the same Vitest entrypoint with `bench src/<suite>.bench.ts --run --outputJson=<revision>/<suite>-repeat.json`. Baseline repeats used a detached worktree at `d1886cc` with the same installed dependencies. Benchmarks ran sequentially on the same machine.

## Main improvement

| Eight concurrent reads | Baseline batches/s | Optimized batches/s | Change | Baseline / optimized error |
| --- | ---: | ---: | ---: | --- |
| Full run: tatenuki | 514,333.91 | 874,424.20 | +70.01% | ±0.27% / ±0.27% |
| Full run: InferDI default | 1,016,861.29 | 923,357.07 | -9.20% | ±0.27% / ±3.49% |
| Full run: InferDI fast | 982,059.70 | 990,293.48 | +0.84% | ±0.31% / ±0.22% |
| Repeat: tatenuki | 492,476.90 | 864,852.67 | +75.61% | ±1.68% / ±0.59% |
| Repeat: InferDI default | 981,675.42 | 1,001,426.95 | +2.01% | ±0.27% / ±0.18% |
| Repeat: InferDI fast | 954,686.53 | 926,123.89 | -2.99% | ±0.28% / ±1.51% |

The target gain exceeds reported error in both comparisons and is much larger than control movement. Each batch builds a fresh container and awaits eight gets. It is not individual-call throughput. The public Promise-returning API, factory counts, value identity, retries, isolation, and disposal behavior remain covered by tests.

## Regressions

This is a same-key concurrency improvement with a cost for other workloads. Different roots sharing an async dependency fell 6.47% in the full run and 15.05% in the repeat. The repeated default InferDI control moved only -0.55%, so this regression cannot be dismissed as general machine drift. Async first-get changed -0.13% in the full run and -5.45% in the repeat; its small overhead remains a risk.

Cached async get fell 7.09% in the full comparison, but changed +0.18% in the repeat, within reported error. Synchronous-factory first-get changed -3.65% and -0.15%; the repeated result is within reported error. Do not interpret the original decreases as stable losses of those magnitudes.

All tatenuki results follow. Each rate includes its reported relative margin of error. Negative changes are retained even when the path is unchanged or the result is noisy.

| Case | Full baseline → optimized hz (error) | Change | Repeat baseline → optimized hz (error) | Change |
| --- | --- | ---: | --- | ---: |
| Async first get | 2,318,029 (±0.62%) → 2,315,111 (±1.74%) | -0.13% | 2,471,392 (±0.50%) → 2,336,821 (±0.78%) | -5.45% |
| Async resolve all | 2,084,161 (±3.71%) → 2,115,025 (±1.79%) | +1.48% | 2,205,121 (±0.24%) → 2,112,666 (±0.25%) | -4.19% |
| Eight same-key reads | 514,334 (±0.27%) → 874,424 (±0.27%) | +70.01% | 492,477 (±1.68%) → 864,853 (±0.59%) | +75.61% |
| Different roots, shared dependency | 1,520,985 (±0.40%) → 1,422,555 (±0.29%) | -6.47% | 1,551,169 (±0.23%) → 1,317,789 (±0.46%) | -15.05% |
| Cached async get | 13,141,114 (±1.28%) → 12,209,435 (±1.59%) | -7.09% | 12,312,605 (±0.83%) → 12,335,284 (±0.29%) | +0.18% |
| Cached sync get after resolveAll | 55,102,340 (±0.15%) → 54,154,298 (±0.17%) | -1.72% | 54,690,448 (±0.10%) → 54,178,016 (±0.13%) | -0.94% |
| Sync-factory first get | 4,220,816 (±0.21%) → 4,066,717 (±0.24%) | -3.65% | 4,155,515 (±0.24%) → 4,149,238 (±0.22%) | -0.15% |
| Build with 1,000 initial values | 50,451 (±0.27%) → 49,244 (±0.98%) | -2.39% | 51,161 (±0.21%) → 51,248 (±0.20%) | +0.17% |
| Configure builder | 5,543 (±0.61%) → 5,520 (±0.59%) | -0.40% | 5,663 (±1.59%) → 4,443 (±11.47%) | -21.55% |
| Three nodes, reused context root | 3,772,546 (±2.05%) → 3,904,489 (±1.25%) | +3.50% | 3,906,934 (±0.57%) → 3,918,187 (±0.51%) | +0.29% |
| Three nodes, registration comparison | 4,077,990 (±0.21%) → 4,010,214 (±0.25%) | -1.66% | 4,048,145 (±0.26%) → 3,939,587 (±0.26%) | -2.68% |
| Four lazy roots | 1,852,451 (±0.37%) → 1,877,642 (±0.22%) | +1.36% | 1,110,397 (±7.48%) → 1,857,536 (±0.26%) | +67.29% |
| Resolve all 1,000 nodes | 8,372 (±0.40%) → 7,909 (±0.50%) | -5.53% | 7,766 (±0.84%) → 7,548 (±4.71%) | -2.81% |
| Lifecycle, no cleanup | 3,254,856 (±0.68%) → 3,231,838 (±0.26%) | -0.71% | 3,069,618 (±0.41%) → 3,203,284 (±0.29%) | +4.35% |
| Lifecycle, sync cleanup | 1,752,437 (±1.67%) → 1,768,358 (±0.32%) | +0.91% | 1,853,184 (±0.26%) → 1,793,736 (±0.25%) | -3.21% |
| Lifecycle, async cleanup | 1,523,489 (±0.26%) → 1,488,263 (±0.30%) | -2.31% | 1,537,466 (±0.30%) → 1,524,978 (±0.22%) | -0.81% |

Repeated builder configuration was noisy (optimized error ±11.47%) and its implementation is unchanged. The repeated four-root increase of 67.29% coincided with InferDI increases of 69.84% and 24.95%, so it is not evidence of a code improvement. Registration controls moved about +64% in both comparisons. These shifts show that within-run error does not capture all cross-run variation.

Full resolution of 1,000 nodes fell 5.53% in the full comparison and 2.81% in the repeat; repeated InferDI controls fell 2.06% and 3.10%, with tatenuki error ±4.71%. Lifecycle async cleanup fell 2.31% and 0.81%. Lifecycle sync cleanup changed +0.91% and -3.21%. No causal claim is made for these smaller or inconsistent changes.

Two runs per revision support the same-key gain, but do not establish a workload-wide speedup or a precise production effect. The different-root regression is an explicit tradeoff, not an improvement attributed to issue 00018.

## Validation

- Eight focused pending-root regression tests passed.
- `pnpm --filter tatenuki check` passed.
- `pnpm ready` passed: 88 tests and both package builds. The workspace check reported nine existing warnings in the moved profiler tests and no errors.
- The implementation uses a direct slot for the first pending root, a lazy map for additional roots, and private bookkeeping helpers. It does not cache fulfilled Promises.
