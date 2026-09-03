# Abstract

Track a single active resolution directly and allocate a `Set` only for concurrent resolutions. Keep resolution, concurrency, disposal, and public API behavior unchanged.

# Problem

Every fresh container allocates an in-flight `Set`, and every first resolution performs `Set` insertion and deletion even when no other resolution is active.

# Hypothesis

Compact single-resolution tracking will improve container build and first `get()` throughput.
