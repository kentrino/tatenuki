import { describe, expect, it, vi } from "vite-plus/test";
import { defineContainer } from "./container.ts";

function fixture() {
  let release!: () => void;
  let reject!: (error: Error) => void;
  const gate = new Promise<void>((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  const disposed: string[] = [];
  const resource = (name: string) => ({
    [Symbol.dispose]() {
      disposed.push(name);
    },
  });
  const database = vi.fn(async () => {
    await gate;
    return resource("database");
  });
  const users = vi.fn(({ database }: { database: Disposable }) => ({
    database,
    ...resource("users"),
  }));
  const audit = vi.fn(async ({ database }: { database: Disposable }) => {
    await Promise.resolve();
    return { database, ...resource("audit") };
  });
  const builder = defineContainer<{
    database: Disposable;
    users: Disposable & { database: Disposable };
    audit: Disposable & { database: Disposable };
  }>()
    .graph({ database: [], users: ["database"], audit: ["database"] })
    .factories({ database, users, audit });
  return {
    release,
    reject,
    disposed,
    database,
    users,
    audit,
    builder,
    container: builder.build({}),
  };
}

describe("shared dependency continuations", () => {
  it("keeps a failed dependent independent from a successful waiting root", async () => {
    const { release, database, users, audit, container } = fixture();
    const error = new Error("users failed");
    users.mockImplementationOnce(() => {
      throw error;
    });
    const results = Promise.allSettled([container.get("users"), container.get("audit")]);
    release();
    const [left, right] = await results;
    expect(left).toEqual({ status: "rejected", reason: error });
    expect(right.status).toBe("fulfilled");
    expect((await container.get("users")).database).toBe((await container.get("audit")).database);
    expect(database).toHaveBeenCalledOnce();
    expect(users).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledOnce();
  });

  it("rejects both roots and retries one shared dependency after failure", async () => {
    const { reject, database, users, audit, container } = fixture();
    const error = new Error("database failed");
    const results = Promise.allSettled([container.get("users"), container.get("audit")]);
    reject(error);
    expect(await results).toEqual([
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ]);
    expect(users).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    database.mockResolvedValue({ [Symbol.dispose]() {} });
    const [left, right] = await Promise.all([container.get("users"), container.get("audit")]);
    expect(left.database).toBe(right.database);
    expect(database).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])(
    "shares ownership and isolates caches (bulk overlap: %s)",
    async (bulk) => {
      const { release, database, disposed, builder, container } = fixture();
      const other = builder.build({});
      const left = container.get("users");
      const right = container.get("audit");
      const all = bulk ? container.resolveAll() : undefined;
      const otherRead = other.get("users");
      release();
      const [users, audit] = await Promise.all([left, right]);
      expect(users.database).toBe(audit.database);
      expect((await otherRead).database).not.toBe(users.database);
      if (all) {
        expect((await all).get("audit")).toBe(audit);
      }
      expect(database).toHaveBeenCalledTimes(2);
      await container.dispose();
      expect(disposed).toEqual(["audit", "users", "database"]);
    },
  );

  it("waits for both roots and disposes the shared dependency once", async () => {
    const { release, disposed, container } = fixture();
    const results = Promise.all([container.get("users"), container.get("audit")]);
    const disposal = container.dispose();
    await expect(container.get("audit")).rejects.toThrow("Container is disposed");
    expect(disposed).toEqual([]);
    release();
    await results;
    await disposal;
    expect(disposed).toEqual(["audit", "users", "database"]);
  });
});
