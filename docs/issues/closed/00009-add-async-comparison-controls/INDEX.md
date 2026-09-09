---
title: "Add async-wrapped comparison controls"
author: GPT-5.6
cost: 2
priority: P1
source: container-comparison-profile
---

# Abstract

Considered adding async-wrapped InferDI controls beside every container-comparison sample that awaits `tatenuki.get()`. Later work isolated the same overhead without that wrapper, so the change was not made.

# Problem

The cached-get, build-and-first-get, and partial-resolution comparisons place tatenuki's Promise API beside InferDI's synchronous API. This cannot isolate tatenuki implementation cost from the fixed cost of an asynchronous call and `await`.

# Acceptance

For InferDI default and fast modes, add samples that perform the same setup and `get()` work as their synchronous counterparts, adding only an async helper and `await`. Preserve what runs inside each timed sample, verify equivalent values and factory counts, and label and document the async-wrapped comparisons as contract-matched.

# Result

The isolation this issue asked for already exists on the tatenuki side. `00004` added `tatenuki (sync get after resolveAll)` in the cached-singleton suite. That path beat InferDI sync `get()` by about 10–14%. The same file already shows the async-boundary cost as the gap between tatenuki's async and sync samples.

`00016` then measured the remaining async gap directly. Reusing one fulfilled Promise still left InferDI sync `get()` about 3.8x faster because the bench awaits tatenuki. That leftover is the public Promise API, not a missing InferDI control.

The async-resolution suite already compares InferDI `getAsync()` for real async factories. InferDI's public API for the other cases is synchronous `get()`, so an async helper around that `get()` would be synthetic rather than contract-matched. The issue is closed without that change.
