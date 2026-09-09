# Abstract

Tried reusing one fulfilled Promise for each already-resolved container `get()` key. `get()` still returned a Promise. Disposal checks, factory counts, and resolved values stayed unchanged. The cached path improved, but the remaining gap to InferDI is still the Promise/`await` boundary, so the change was reverted.

# Problem

Cached `get()` is an `async` method, so every hit allocates a new Promise even when the value is already in `resolved`. That fixed cost dominates the cached-singleton comparison.

# Hypothesis

Returning the same fulfilled Promise on later hits will improve cached singleton `get()` throughput without changing uncached resolution or public `await` behavior.

# Result

Compared baseline `f1e9b0f` with `2696978`. Cached singleton `get()` rose from 11,408,451.52 to 12,913,903.66 ops/s (**+13.20%**; ±1.93% and ±1.81%). InferDI sync `get()` remained about 3.8x faster because the bench still `await`s tatenuki. 1,000-value construction fell **3.37%**. The change was reverted. See `bench.md`.
