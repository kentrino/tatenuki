---
title: "Defer initial value identity tracking"
author: Composer
cost: 5
priority: P2
source: get-performance-suspects
---

# Abstract

Avoid eagerly collecting every initial value solely for ownership identity checks. Keep duplicate-disposal prevention, override behavior, plan selection, and public API behavior unchanged.

# Problem

Each container builds a resolved object, enumerates all of its keys, and maps those keys back to values before any factory result exists. This adds context-creation cost when request inputs or overrides are numerous.

# Hypothesis

Deferring value identity tracking until a factory produces an owned candidate will improve fresh-container construction. Add a benchmark with many initial values and preserve tests where initial values and factory results share object identity.
