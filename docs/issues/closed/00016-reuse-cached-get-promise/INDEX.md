# Abstract

Reuse one fulfilled Promise for each already-resolved container `get()` key. `get()` still returns a Promise. Disposal checks, factory counts, and resolved values stay unchanged.

# Problem

Cached `get()` is an `async` method, so every hit allocates a new Promise even when the value is already in `resolved`. That fixed cost dominates the cached-singleton comparison.

# Hypothesis

Returning the same fulfilled Promise on later hits will improve cached singleton `get()` throughput without changing uncached resolution or public `await` behavior.
