---
title: "Defer initial value identity tracking"
author: GPT-5.6
cost: 5
priority: P2
source: get-performance-suspects
---

# Abstract

Defer ownership identity tracking of effective initial values until the first factory result. Keep duplicate-disposal prevention, override behavior, plan selection, and public API behavior unchanged.

# Problem

Each built container enumerates resolved keys for plan caching, then immediately reads every corresponding value to initialize ownership identity tracking before any factory result exists. This adds construction cost when build values or overrides are numerous.

# Hypothesis

Initializing identity tracking from the effective resolved values only when the first factory result is classified will improve fresh-container construction. Add a many-initial-values benchmark and tests proving that results identical to an effective initial value remain borrowed and duplicate owned results are disposed once.
