import { tatenukiHono, type TatenukiHonoEnv } from "@tatenuki/hono";
import { Hono } from "hono";
import { defineContainer, type DependencyGraph } from "tatenuki";
import { describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "./app.ts";
import {
  createRequestScope,
  databasePool,
  Logger,
  type LogEntry,
  type UserProfile,
} from "./container.ts";

describe("request scopes", () => {
  it("caches factories inside one request but isolates separate requests", async () => {
    const logger = new Logger(() => undefined);
    const firstScope = createRequestScope({ requestId: "request-1", userId: "alice" }, logger);
    const secondScope = createRequestScope({ requestId: "request-2", userId: "bob" }, logger);

    const [first, firstAgain, second] = await Promise.all([
      firstScope.get("profileService"),
      firstScope.get("profileService"),
      secondScope.get("profileService"),
    ]);

    expect(firstAgain).toBe(first);
    expect(second).not.toBe(first);
    expect(first.getProfile("42").databasePoolId).toBe(databasePool.id);
    expect(second.getProfile("42").databasePoolId).toBe(databasePool.id);
  });

  it("binds Hono request data to each request logger without leaking", async () => {
    const requestIds = ["request-1", "request-2"];
    const entries: LogEntry[] = [];
    const app = createApp({
      createRequestId: () => requestIds.shift() ?? "unexpected",
      logger: new Logger((entry) => entries.push(entry)),
    });

    const [firstResponse, secondResponse] = await Promise.all([
      app.request("/users/42", { headers: { "x-user-id": "alice" } }),
      app.request("/users/84", { headers: { "x-user-id": "bob" } }),
    ]);
    const [first, second] = (await Promise.all([firstResponse.json(), secondResponse.json()])) as [
      UserProfile,
      UserProfile,
    ];

    expect(first).toMatchObject({
      id: "42",
      databasePoolId: databasePool.id,
    });
    expect(second).toMatchObject({
      id: "84",
      databasePoolId: databasePool.id,
    });
    expect(second.profileServiceId).not.toBe(first.profileServiceId);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        {
          message: "user profile requested",
          profileId: "42",
          requestId: "request-1",
          userId: "alice",
        },
        {
          message: "user profile requested",
          profileId: "84",
          requestId: "request-2",
          userId: "bob",
        },
      ]),
    );
  });

  it("disposes request resources without disposing shared build values", async () => {
    type Values = {
      shared: Disposable;
      requestResource: Disposable;
    };
    const graph = {
      shared: [],
      requestResource: ["shared"],
    } as const satisfies DependencyGraph<Values>;
    const disposeShared = vi.fn();
    const disposeRequestResource = vi.fn();
    const shared = { [Symbol.dispose]: disposeShared };
    const builder = defineContainer<Values>()
      .graph(graph)
      .factories({
        requestResource: () => ({ [Symbol.dispose]: disposeRequestResource }),
      });
    const createScope = () => builder.build({ shared });
    type AppEnv = TatenukiHonoEnv<ReturnType<typeof createScope>>;
    const app = new Hono<AppEnv>();
    app.use("*", tatenukiHono({ createScope }));
    app.get("/", async (context) => {
      await context.var.di.get("requestResource");
      return context.text("ok");
    });

    await app.request("/");

    expect(disposeRequestResource).toHaveBeenCalledOnce();
    expect(disposeShared).not.toHaveBeenCalled();
  });
});
