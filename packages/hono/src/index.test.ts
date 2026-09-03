import { Hono } from "hono";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { skipTatenukiDispose, tatenukiHono, type TatenukiHonoEnv } from "./index.ts";

class TestScope {
  readonly dispose = vi.fn(async () => undefined);
  readonly id: number;

  constructor(id: number) {
    this.id = id;
  }
}

describe("tatenukiHono", () => {
  it("creates and disposes one scope per request", async () => {
    type AppEnv = TatenukiHonoEnv<TestScope>;
    const scopes: TestScope[] = [];
    const app = new Hono<AppEnv>();
    app.use(
      "*",
      tatenukiHono({
        createScope: () => {
          const scope = new TestScope(scopes.length + 1);
          scopes.push(scope);
          return scope;
        },
      }),
    );
    app.get("/", (context) => {
      expectTypeOf(context.var.di).toEqualTypeOf<TestScope>();
      return context.text(String(context.var.di.id));
    });

    const first = await app.request("/");
    const second = await app.request("/");

    await expect(first.text()).resolves.toBe("1");
    await expect(second.text()).resolves.toBe("2");
    expect(scopes).toHaveLength(2);
    expect(scopes[0]?.dispose).toHaveBeenCalledOnce();
    expect(scopes[1]?.dispose).toHaveBeenCalledOnce();
  });

  it("supports a typed custom context key", async () => {
    type AppEnv = TatenukiHonoEnv<TestScope, "services">;
    const app = new Hono<AppEnv>();
    const scope = new TestScope(42);
    app.use(
      "*",
      tatenukiHono({
        key: "services",
        createScope: () => scope,
      }),
    );
    app.get("/", (context) => {
      expectTypeOf(context.var.services).toEqualTypeOf<TestScope>();
      return context.text(String(context.var.services.id));
    });

    const response = await app.request("/");

    await expect(response.text()).resolves.toBe("42");
    expect(scope.dispose).toHaveBeenCalledOnce();
  });

  it("disposes scopes after route errors, even when skipping was requested", async () => {
    type AppEnv = TatenukiHonoEnv<TestScope>;
    const app = new Hono<AppEnv>();
    const scope = new TestScope(1);
    app.use("*", tatenukiHono({ createScope: () => scope }));
    app.get("/", (context) => {
      skipTatenukiDispose(context);
      throw new Error("route failed");
    });
    app.onError((error, context) => context.text(error.message, 500));

    const response = await app.request("/");

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("route failed");
    expect(scope.dispose).toHaveBeenCalledOnce();
  });

  it("disposes a scope when setup fails and preserves the setup error", async () => {
    type AppEnv = TatenukiHonoEnv<TestScope>;
    const app = new Hono<AppEnv>();
    const scope = new TestScope(1);
    const disposeError = new Error("cleanup failed");
    scope.dispose.mockRejectedValue(disposeError);
    const onDisposeError = vi.fn();
    app.use(
      "*",
      tatenukiHono({
        createScope: () => scope,
        setupScope: () => {
          throw new Error("setup failed");
        },
        onDisposeError,
      }),
    );
    app.get("/", (context) => context.text("unreachable"));
    app.onError((error, context) => context.text(error.message, 500));

    const response = await app.request("/");

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("setup failed");
    expect(scope.dispose).toHaveBeenCalledOnce();
    expect(onDisposeError).toHaveBeenCalledWith(disposeError, expect.anything());
  });

  it("reports post-route disposal errors without replacing the response", async () => {
    type AppEnv = TatenukiHonoEnv<TestScope>;
    const app = new Hono<AppEnv>();
    const scope = new TestScope(1);
    const disposeError = new Error("cleanup failed");
    scope.dispose.mockRejectedValue(disposeError);
    const onDisposeError = vi.fn();
    app.use(
      "*",
      tatenukiHono({
        createScope: () => scope,
        onDisposeError,
      }),
    );
    app.get("/", (context) => context.text("ok"));

    const response = await app.request("/");

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
    expect(onDisposeError).toHaveBeenCalledWith(disposeError, expect.anything());
  });

  it("does not dispose when scope creation fails", async () => {
    const disposeScope = vi.fn();
    const app = new Hono();
    app.use(
      "*",
      tatenukiHono({
        createScope: (): TestScope => {
          throw new Error("creation failed");
        },
        disposeScope,
      }),
    );
    app.get("/", (context) => context.text("unreachable"));
    app.onError((error, context) => context.text(error.message, 500));

    const response = await app.request("/");

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("creation failed");
    expect(disposeScope).not.toHaveBeenCalled();
  });

  it("can transfer disposal ownership to application code", async () => {
    type AppEnv = TatenukiHonoEnv<TestScope>;
    const app = new Hono<AppEnv>();
    const scope = new TestScope(1);
    app.use("*", tatenukiHono({ createScope: () => scope }));
    app.get("/", (context) => {
      skipTatenukiDispose(context);
      return context.text("stream started");
    });

    const response = await app.request("/");

    await expect(response.text()).resolves.toBe("stream started");
    expect(scope.dispose).not.toHaveBeenCalled();

    await scope.dispose();
    expect(scope.dispose).toHaveBeenCalledOnce();
  });

  it("supports disabling automatic disposal through options", async () => {
    type AppEnv = TatenukiHonoEnv<TestScope>;
    const app = new Hono<AppEnv>();
    const scope = new TestScope(1);
    app.use(
      "*",
      tatenukiHono({
        createScope: () => scope,
        autoDispose: false,
      }),
    );
    app.get("/", (context) => context.text("ok"));

    await app.request("/");

    expect(scope.dispose).not.toHaveBeenCalled();
  });
});
