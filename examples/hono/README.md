# tatenuki + Hono request scopes

This example keeps one unresolved tatenuki builder for the life of the
application, then calls `build()` once per Hono request:

1. `requestScopeBuilder` stores the dependency graph and factories.
2. `databasePool` is created once and passed into every built container.
3. The middleware supplies a fresh `RequestContext` and stores the resulting
   container in `context.var.di`.
4. Route dependencies are created lazily by `get()` and cached only inside that
   request's container.

This gives request isolation with tatenuki's existing API. It does not add
first-class lifetimes: factory-created services are request-scoped because a
new container is built each time, while application singletons must be created
outside the builder and passed in as values.

Unlike InferDI's Hono adapter, this example has no disposal hook because
tatenuki containers do not currently own or dispose resources. A request-scoped
factory that opens a resource must therefore close it explicitly.

## Run

From the repository root:

```sh
pnpm --filter @tatenuki/example-hono test
pnpm --filter @tatenuki/example-hono bench
```

The benchmark separates the cost of `build()` from lazy service resolution and
also compares a minimal Hono route with and without the request-scope
middleware.
