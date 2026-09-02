import { Hono } from "hono";
import { createRequestScope, type RequestScope } from "./container.ts";

type AppEnv = {
  Variables: {
    di: RequestScope;
  };
};

type CreateAppOptions = {
  createRequestId?: () => string;
};

export function createApp(options: CreateAppOptions = {}) {
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  const app = new Hono<AppEnv>();

  app.use("*", async (context, next) => {
    const scope = createRequestScope({
      requestId: createRequestId(),
      userId: context.req.header("x-user-id"),
    });

    context.set("di", scope);
    await next();
  });

  app.get("/users/:id", async (context) => {
    const profileService = await context.var.di.get("profileService");
    return context.json(profileService.getProfile(context.req.param("id")));
  });

  return app;
}

export const app = createApp();
