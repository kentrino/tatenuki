---
title: "Specialize synchronous factory resolution"
author: Grok 4.6
cost: 13
priority: P3
source: get-performance-suspects
---

# Abstract

Add an internal path for synchronous factory results that skips pending-map and thenable handling. `get()` must still return `Promise`. Do not change the public mixed sync/async API in this issue.

# Problem

The resolver treats every factory as potentially asynchronous, so synchronous resolution still performs pending checks and structural thenable detection. The profile attributes only a small share to thenable detection.

# Gate

Do not implement this before higher-priority fixed-cost issues are done and the current profile is refreshed. Proceed only if a same-contract uncached `get()` benchmark still shows resolver overhead larger than measurement error after those fixes.
