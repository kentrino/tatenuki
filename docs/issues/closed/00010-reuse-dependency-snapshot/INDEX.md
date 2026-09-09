---
title: "Reuse immutable dependency snapshots"
author: GPT-5.6
cost: 3
priority: P2
source: current-implementation
---

# Abstract

Snapshot and freeze caller-provided dependency graphs at the public construction boundary, then reuse that trusted snapshot across fluent builder variants. Keep caller-mutation isolation, builder immutability, typing, and public API behavior unchanged.

# Problem

Every `Container` constructor clones and freezes the full dependency graph. Calls such as `factory()` and `override()` create another container from an already trusted internal snapshot, so large graphs are copied repeatedly during configuration.

# Hypothesis

Reusing trusted snapshots will reduce builder configuration time and allocation for large graphs. Add a repeated `factory()` and `override()` chain benchmark, plus tests proving that descendants share the snapshot while later mutation of the caller's graph object or dependency arrays cannot affect any container.
