---
title: "Reuse the factory result callback"
author: Composer
cost: 2
priority: P3
source: get-performance-suspects
---

# Abstract

Tried storing one factory-result callback per container instead of allocating one per uncached `get()`. Ownership, disposal, concurrency, and the public API stayed unchanged. Uncached benchmarks did not improve beyond measurement error, so the change was reverted.

# Problem

Each uncached container request passes a new `(value) => this.onFactoryResult(value)` closure into the resolver. The cached path no longer pays this cost, and storing a callback per container may only move the allocation when a container performs one resolution.

# Result

Compared baseline `8e2e26c` with `90484bb`. The 4-lazy-root case moved by -0.54%, inside the reported error. Single-`get()` fresh containers did not improve. The change was reverted. See `bench.md`.
