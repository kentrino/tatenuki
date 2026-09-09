# Abstract

Add `resolveAll()` to return a fully resolved container with synchronous `get()`. Keep asynchronous lazy `get()`, disposal, factory ownership, and dependency resolution behavior unchanged.

# Hypothesis

Removing promise and `await` overhead after eager resolution will improve cached singleton `get()` throughput.
