# Abstract

Skip in-flight tracking when a planned container `get()` finishes synchronously. `get()` still returns a Promise. Disposal, concurrent async resolution, ownership, and the public API stay unchanged.

# Problem

Uncached synchronous `get()` still wraps work in `getWithPlan()`'s Promise and tracks that Promise as in-flight. Cached gets already skip this cost.

# Hypothesis

Skipping that tracking will improve build-and-first-`get()` and fresh-context partial resolution of a few synchronous factories.
