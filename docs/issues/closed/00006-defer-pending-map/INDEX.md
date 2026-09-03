---
title: "Defer pending factory tracking"
author: Composer
cost: 3
priority: P1
source: container-comparison-profile
---

# Abstract

Allocate pending-factory tracking only when an asynchronous factory is in progress. Keep concurrent resolution, error propagation, disposal, and public API behavior unchanged.

# Problem

Every fresh container allocates a `Map` and every planned dependency probes it, including containers that resolve only synchronous factories.

# Hypothesis

Lazy pending tracking will improve container build and first synchronous-factory resolution throughput. Measure the existing build-and-first-`get()` and fresh-context partial-resolution cases, with focused concurrent async-factory tests protecting behavior.

# Result

Reverted after comparing `3bf9815` with `fd21358`. Build-and-first-`get()` fell from 2,958,209.87 to 2,590,335.59 ops/s (**-12.44%**; ±0.34% and ±1.40%). That is a regression, not an improvement beyond measurement error.

Partial-resolution cases rose **+4.74%** and **+1.53%**. Unchanged InferDI controls and the cached-`get()` path also moved by several percent, so those gains are not attributed to this change.
