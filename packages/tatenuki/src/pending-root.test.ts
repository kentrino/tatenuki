import { describe, expect, it, vi } from "vite-plus/test";
import { defineContainer } from "./container.ts";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const gate = deferred();
  const disposed: string[] = [];
  const database = vi.fn(async () => {
    await gate.promise;
    return {
      [Symbol.dispose]() {
        disposed.push("database");
      },
    };
  });
  const service = vi.fn(({ database }: { database: Disposable }) => ({
    database,
    [Symbol.dispose]: () => disposed.push("service"),
  }));
  const builder = defineContainer<{
    database: Disposable;
    service: Disposable & { database: Disposable };
  }>()
    .graph({ database: [], service: ["database"] })
    .factories({ database, service });
  return { gate, disposed, database, service, builder, container: builder.build({}) };
}

describe("pending root resolution", () => {
  it("keeps additional roots shared when the first pending slot is reused", async () => {
    const firstGate = deferred();
    const secondGate = deferred();
    const thirdGate = deferred();
    const secondFactory = vi.fn(async () => {
      await secondGate.promise;
      return "second";
    });
    const container = defineContainer<{ first: string; second: string; third: string }>()
      .graph({ first: [], second: [], third: [] })
      .factories({
        first: async () => {
          await firstGate.promise;
          return "first";
        },
        second: secondFactory,
        third: async () => {
          await thirdGate.promise;
          return "third";
        },
      })
      .build({});
    const first = container.get("first");
    const second = container.get("second");
    firstGate.resolve();
    await first;
    const third = container.get("third");
    const joined = container.get("second");
    expect(Reflect.get(container, "inflight")).toHaveProperty("size", 2);
    secondGate.resolve();
    expect(await Promise.all([second, joined])).toEqual(["second", "second"]);
    expect(secondFactory).toHaveBeenCalledOnce();
    expect(Reflect.get(container, "pendingRoots")).toHaveProperty("size", 0);
    thirdGate.resolve();
    expect(await third).toBe("third");
    expect(Reflect.get(container, "pendingRootWork")).toBeUndefined();
    expect(Reflect.get(container, "inflight")).toBeUndefined();
  });

  it("shares one in-flight plan while keeping values isolated between containers", async () => {
    const { gate, database, service, builder, container } = fixture();
    const other = builder.build({});
    const reads = Array.from({ length: 8 }, () => container.get("service"));
    const otherRead = other.get("service");

    expect(Reflect.get(container, "inflight")).toBeInstanceOf(Promise);
    expect(database).toHaveBeenCalledTimes(2);
    gate.resolve();
    const values = await Promise.all(reads);
    expect(values.every((value) => value === values[0])).toBe(true);
    expect(await otherRead).not.toBe(values[0]);
    expect(service).toHaveBeenCalledTimes(2);
    expect(Reflect.get(container, "pendingRootWork")).toBeUndefined();
    expect(Reflect.get(container, "pendingRoots")).toBeUndefined();
    expect(Reflect.get(container, "inflight")).toBeUndefined();
  });

  it.each(["dependency", "root"] as const)(
    "clears a rejected %s resolution before concurrent retries",
    async (failure) => {
      const { gate, database, service, container } = fixture();
      const error = new Error("temporary failure");
      if (failure === "root") {
        service.mockImplementationOnce(() => {
          throw error;
        });
      }
      const results = Promise.allSettled(Array.from({ length: 8 }, () => container.get("service")));
      if (failure === "dependency") {
        gate.reject(error);
      } else {
        gate.resolve();
      }
      expect(await results).toEqual(
        Array.from({ length: 8 }, () => ({ status: "rejected", reason: error })),
      );
      expect(Reflect.get(container, "pendingRootWork")).toBeUndefined();
      expect(Reflect.get(container, "pendingRoots")).toBeUndefined();
      expect(Reflect.get(container, "inflight")).toBeUndefined();

      database.mockResolvedValue({ [Symbol.dispose]() {} });
      const values = await Promise.all(Array.from({ length: 8 }, () => container.get("service")));
      expect(values.every((value) => value === values[0])).toBe(true);
      expect(database).toHaveBeenCalledTimes(failure === "dependency" ? 2 : 1);
      expect(service).toHaveBeenCalledTimes(failure === "root" ? 2 : 1);
    },
  );

  it.each([true, false])("shares factories with resolveAll (bulk first: %s)", async (bulkFirst) => {
    const { gate, database, service, container } = fixture();
    const bulk = bulkFirst ? container.resolveAll() : undefined;
    const reads = Array.from({ length: 8 }, () => container.get("service"));
    const resolving = bulk ?? container.resolveAll();
    gate.resolve();
    const values = await Promise.all(reads);
    expect((await resolving).get("service")).toBe(values[0]);
    expect(database).toHaveBeenCalledOnce();
    expect(service).toHaveBeenCalledOnce();
  });

  it.each([true, false])("disposes pending owned work once (bulk overlap: %s)", async (overlap) => {
    const { gate, disposed, container } = fixture();
    const reads = Array.from({ length: 8 }, () => container.get("service"));
    const bulk = overlap ? Promise.allSettled([container.resolveAll()]) : undefined;
    let finished = false;
    const disposal = container.dispose().then(() => {
      finished = true;
    });
    await expect(container.get("service")).rejects.toThrow("Container is disposed");
    expect(finished).toBe(false);
    expect(disposed).toEqual([]);
    gate.resolve();
    await Promise.all(reads);
    if (bulk) {
      expect(await bulk).toEqual([
        { status: "rejected", reason: new Error("Container is disposed") },
      ]);
    }
    await disposal;
    expect(disposed).toEqual(["service", "database"]);
    await container.dispose();
    expect(disposed).toEqual(["service", "database"]);
  });
});
