---
title: "Reuse immutable dependency snapshots"
author: Composer
cost: 3
priority: P2
source: current-implementation
---

# Abstract

Snapshot and freeze a dependency graph once, then share that immutable snapshot across fluent builder variants. Keep protection from caller mutation, builder immutability, typing, and public API behavior unchanged.

# Problem

Every `Container` constructor clones and freezes the full dependency graph. Calls such as `factory()` and `override()` create another container from a graph that is already an internal immutable snapshot, so large graphs are copied repeatedly during configuration.

# Hypothesis

Reusing trusted internal snapshots will reduce builder configuration time and allocation for large graphs. Add a builder-chain benchmark and retain mutation-isolation tests for the original graph and dependency arrays.
