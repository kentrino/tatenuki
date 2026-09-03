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
