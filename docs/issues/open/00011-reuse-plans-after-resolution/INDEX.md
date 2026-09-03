---
title: "Reuse dependency plans after initial resolution"
author: Composer
cost: 5
priority: P1
source: current-implementation
---

# Abstract

Reuse builder-cached dependency plans for later uncached keys in the same container. Keep cycle detection, missing-factory errors, overrides, concurrency, and resolution results unchanged.

# Problem

Plan reuse stops after the first factory result. A container that lazily requests several independent roots therefore allocates new DFS sets and closures for every later root even though its dependency graph and initial-value shape are unchanged.

# Hypothesis

Cached plans can remain valid because execution already skips keys resolved since the plan was created. Add a multi-root lazy-resolution benchmark and tests covering shared dependencies, overrides, cycles hidden by initial values, and failed factories.
