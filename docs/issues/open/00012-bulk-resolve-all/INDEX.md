---
title: "Resolve all dependencies without per-key get overhead"
author: Composer
cost: 8
priority: P2
source: current-implementation
---

# Abstract

Resolve the full graph through one bulk execution path instead of awaiting public `get()` once per key. Keep factory ordering constraints, async factories, ownership, disposal, error behavior, and the `resolveAll()` API unchanged.

# Problem

`resolveAll()` enumerates every graph key and calls the public asynchronous `get()` for each one. Most calls become cached no-ops, but still pay method, lifecycle, lookup, Promise, and `await` overhead.

# Hypothesis

A single full-graph plan or equivalent bulk resolver will reduce eager-resolution time, especially for large graphs. Add `resolveAll()` benchmarks for synchronous and mixed async DAGs and compare both throughput and allocations.
