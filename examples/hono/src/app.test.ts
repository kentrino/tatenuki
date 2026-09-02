import { describe, expect, it } from "vite-plus/test";
import { createApp } from "./app.ts";
import { createRequestScope, databasePool, type UserProfile } from "./container.ts";

describe("request scopes", () => {
  it("caches factories inside one request but isolates separate requests", async () => {
    const firstScope = createRequestScope({ requestId: "request-1", userId: "alice" });
    const secondScope = createRequestScope({ requestId: "request-2", userId: "bob" });

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

  it("injects Hono request data without leaking it across requests", async () => {
    const requestIds = ["request-1", "request-2"];
    const app = createApp({ createRequestId: () => requestIds.shift() ?? "unexpected" });

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
      requestedBy: "alice",
      requestId: "request-1",
      databasePoolId: databasePool.id,
    });
    expect(second).toMatchObject({
      id: "84",
      requestedBy: "bob",
      requestId: "request-2",
      databasePoolId: databasePool.id,
    });
    expect(second.profileServiceId).not.toBe(first.profileServiceId);
  });
});
