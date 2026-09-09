# @tatenuki/hono

Hono middleware that creates one tatenuki built container per request and
disposes it after the route pipeline completes.

## Usage

```ts
import { Hono } from "hono";
import { tatenukiHono, type TatenukiHonoEnv } from "@tatenuki/hono";
import { createRequestScope, type RequestScope } from "./container.ts";

type AppEnv = TatenukiHonoEnv<RequestScope>;

const app = new Hono<AppEnv>();

app.use(
  "*",
  tatenukiHono({
    createScope: (context) =>
      createRequestScope({
        requestId: crypto.randomUUID(),
        userId: context.req.header("x-user-id"),
      }),
  }),
);

app.get("/users/:id", async (context) => {
  const users = await context.var.di.get("users");
  return context.json(await users.find(context.req.param("id")));
});
```

`createScope` may be synchronous or asynchronous. The middleware also supports
`setupScope`, a custom context variable `key`, `disposeScope`, `autoDispose`,
and `onDisposeError`.

Disposal failures after route execution are reported through `onDisposeError`
or `console.error`; they do not replace the response or route error.

## Streaming

Hono can return a streaming `Response` before its stream callback has finished.
Transfer ownership to the stream callback to avoid disposing request resources
too early:

```ts
import { skipTatenukiDispose } from "@tatenuki/hono";
import { stream } from "hono/streaming";

app.get("/events", (context) => {
  const scope = context.var.di;
  skipTatenukiDispose(context);

  return stream(context, async (output) => {
    try {
      await output.write("ready\n");
    } finally {
      await scope.dispose();
    }
  });
});
```

If the route fails, the middleware ignores a requested transfer and disposes
the scope itself.
