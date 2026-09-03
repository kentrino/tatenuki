# Abstract

Reuse key-specific resolution plans across containers built from the same builder. Keep the public API, resolution results, errors, concurrency, and disposal behavior unchanged.

# Problem

Each uncached `get()` repeats dependency traversal and cycle checks, even when containers share the same dependency graph.

# Hypothesis

Computing each acyclic plan once will improve fresh-context partial resolution throughput.
