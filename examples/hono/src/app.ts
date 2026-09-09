import { tatenukiHono, type TatenukiHonoEnv } from "@tatenuki/hono";
import { Hono } from "hono";
import {
  applicationLogger,
  createRequestScope,
  type Logger,
  type RequestScope,
} from "./container.ts";

type AppEnv = TatenukiHonoEnv<RequestScope>;

type CreateAppOptions = {
  createRequestId?: () => string;
  logger?: Logger;
};

export function createApp(options: CreateAppOptions = {}) {
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  const rootLogger = options.logger ?? applicationLogger;
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    tatenukiHono({
      createScope: (context) =>
        createRequestScope(
          {
            requestId: createRequestId(),
            userId: context.req.header("x-user-id"),
          },
          rootLogger,
        ),
    }),
  );

  app.get("/users/:id", async (context) => {
    const profileService = await context.var.di.get("profileService");
    return context.json(profileService.getProfile(context.req.param("id")));
  });

  return app;
}

export const app = createApp();
