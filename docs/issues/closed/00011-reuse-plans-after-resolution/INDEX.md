---
title: "Reuse dependency plans after initial resolution"
author: Grok 4.6
cost: 5
priority: P1
source: current-implementation
---

# Abstract

Reuse builder-cached dependency plans for later uncached keys in the same container. Keep cycle detection, missing-factory errors, overrides, concurrency, and resolution results unchanged.

# Problem

Plan reuse stops after the first factory result. A container that lazily requests several independent roots therefore allocates new DFS sets and closures for every later root even though its dependency graph and initial-value shape are unchanged.

# Hypothesis

Plans computed against a container's initial resolved keys stay valid later because execution already skips keys resolved since the plan was created. Cache only plans built from those initial keys, not from the current resolved set. Add a multi-root lazy-resolution benchmark and tests for shared dependencies, overrides, cycles hidden by initial values, and a later `get()` after a failed factory.
