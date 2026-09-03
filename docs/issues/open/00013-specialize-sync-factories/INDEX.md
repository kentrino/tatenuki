---
title: "Specialize synchronous factory resolution"
author: Composer
cost: 13
priority: P3
source: get-performance-suspects
---

# Abstract

Design an explicit synchronous factory execution path that avoids pending-map and thenable handling. Preserve the existing mixed sync/async API unless a migration and compatibility plan is accepted first.

# Problem

The resolver treats every factory as potentially asynchronous, so synchronous resolution still performs pending checks and structural thenable detection. The profile attributes only a small share to thenable detection, and safely specializing this path may require API or type changes.

# Gate

Do not implement this before higher-priority fixed costs are removed and the current profile is refreshed. Proceed only if a contract-matched benchmark shows enough remaining resolver cost to justify the public API and maintenance complexity.
