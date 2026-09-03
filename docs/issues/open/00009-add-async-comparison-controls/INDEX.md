---
title: "Add async-wrapped comparison controls"
author: GPT-5.6
cost: 2
priority: P1
source: container-comparison-profile
---

# Abstract

Add async-wrapped InferDI controls beside every container-comparison sample that awaits `tatenuki.get()`. Keep the existing synchronous controls so reports show both throughput differences and async-boundary overhead.

# Problem

The cached-get, build-and-first-get, and partial-resolution comparisons place tatenuki's Promise API beside InferDI's synchronous API. This cannot isolate tatenuki implementation cost from the fixed cost of an asynchronous call and `await`.

# Acceptance

For InferDI default and fast modes, add samples that perform the same setup and `get()` work as their synchronous counterparts, adding only an async helper and `await`. Preserve what runs inside each timed sample, verify equivalent values and factory counts, and label and document the async-wrapped comparisons as contract-matched.
