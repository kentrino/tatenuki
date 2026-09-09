---
title: "Remove redundant resolution cache probes"
author: Composer
cost: 2
priority: P2
source: get-performance-suspects
---

# Abstract

Reduce repeated `Object.hasOwn()` checks and resolved-value reads along the first-resolution path. Keep missing-factory errors, falsey values, symbol keys, concurrency, and public API behavior unchanged.

# Problem

`FullyDefinedContainer.get()` proves that the requested key is unresolved before calling `getWithPlan()`, which checks the same key again. Planned resolution then performs the necessary per-entry checks.

# Hypothesis

Removing checks that are redundant by contract will reduce fixed first-`get()` overhead. Measure build-and-first-`get()` and fresh-context partial resolution, and require an improvement larger than benchmark error before retaining the change.
