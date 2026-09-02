import { Hono } from "hono";
import { bench, describe } from "vite-plus/test";
import { createApp } from "./app.ts";
import { createRequestScope, databasePool } from "./container.ts";

const request = { requestId: "benchmark-request", userId: "benchmark-user" };
const bareApp = new Hono();
bareApp.get("/users/:id", (context) =>
  context.json({
    id: context.req.param("id"),
    requestedBy: context.req.header("x-user-id"),
    requestId: request.requestId,
    databasePoolId: databasePool.id,
    profileServiceId: 1,
  }),
);

const scopedApp = createApp({ createRequestId: () => request.requestId });
const requestInit = { headers: { "x-user-id": request.userId } };

describe("Hono request scope overhead", () => {
  bench("build a request scope from the unresolved graph", () => {
    void createRequestScope(request);
  });

  bench("create scope and lazily resolve route service", async () => {
    const scope = createRequestScope(request);
    const service = await scope.get("profileService");
    void service.getProfile("42");
  });

  bench("Hono route without DI", async () => {
    await bareApp.request("/users/42");
  });

  bench("Hono route with per-request scope", async () => {
    await scopedApp.request("/users/42", requestInit);
  });
});
