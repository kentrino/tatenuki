---
title: "Reuse the factory result callback"
author: Composer
cost: 2
priority: P3
source: get-performance-suspects
---

# Abstract

Avoid allocating a new factory-result callback for every uncached `get()`. Keep ownership identity tracking, disposal, concurrency, and public API behavior unchanged.

# Problem

Each uncached container request passes a new `(value) => this.onFactoryResult(value)` closure into the resolver. The cached path no longer pays this cost, and storing a callback per container may only move the allocation when a container performs one resolution.

# Gate

Retain the change only if an allocation profile and uncached benchmark show a measurable improvement. Include both single-`get()` fresh containers and containers performing several lazy `get()` calls so the result distinguishes reuse from shifted allocation.
