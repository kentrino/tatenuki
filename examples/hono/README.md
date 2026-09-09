# tatenuki + Hono request scopes

This example keeps one unresolved tatenuki builder for the life of the
application. The `@tatenuki/hono` middleware calls `build()` once per Hono
request:

1. `requestScopeBuilder` stores the dependency graph and factories.
2. `databasePool` and the root `Logger` are created once and passed into every
   built container.
3. `tatenukiHono()` supplies a fresh `RequestContext` and stores the resulting
   container in `context.var.di`.
4. The request-scoped `logger` factory creates a child logger containing the
   request ID and user ID, so services log request metadata without depending
   directly on Hono.
5. Route dependencies are created lazily by `get()` and cached only inside that
   request's container.
6. The request container is disposed after the route pipeline completes.

This gives request isolation with tatenuki's existing API. It does not add
first-class lifetimes: factory-created services are request-scoped because a
new container is built each time, while application singletons must be created
outside the builder and passed in as values. Shared build values such as
`databasePool` and the root logger are borrowed and remain alive when each
request scope is disposed.

## Run

From the repository root:

```sh
pnpm --filter @tatenuki/example-hono test
pnpm --filter @tatenuki/example-hono bench
```

The benchmark separates the cost of `build()` from lazy service resolution and
also compares a minimal Hono route with and without the request-scope
middleware.
