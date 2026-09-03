---
title: "Add asynchronous comparison controls"
author: Composer
cost: 2
priority: P1
source: container-comparison-profile
---

# Abstract

Add InferDI asynchronous API controls to the container-comparison benchmarks. Keep the existing synchronous controls so reports show both real throughput differences and async-contract overhead.

# Problem

The current cached and partial-resolution comparisons place tatenuki's Promise API beside InferDI's synchronous API. This is useful for end-to-end throughput but cannot isolate tatenuki implementation cost from the fixed cost of asynchronous access.

# Acceptance

Report synchronous and asynchronous InferDI controls for relevant scenarios, verify equivalent resolved values, and document which comparisons are contract-matched.
