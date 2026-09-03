# Abstract

Use array-backed identity tracking for small containers and allocate ownership collections only when needed. Keep resolution, ownership, concurrency, and disposal behavior unchanged.

# Hypothesis

Avoiding eager `Set` and `Array` allocation will improve fresh-container first-resolution throughput.
