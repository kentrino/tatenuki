import { Container as InferDIContainer } from "@inferdi/inferdi";
import { afterAll, beforeAll, bench, describe, expect } from "vite-plus/test";
import { defineContainer, type DependencyGraph } from "../../../packages/tatenuki/src/index.ts";

type Database = { readonly url: string };
type Repository = { readonly database: Database };
type Definition = {
  url: string;
  database: Database;
  users: Repository;
  audit: Repository;
  service: { readonly users: Repository; readonly audit: Repository };
};

const graph = {
  url: [],
  database: ["url"],
  users: ["database"],
  audit: ["database"],
  service: ["users", "audit"],
} as const satisfies DependencyGraph<Definition>;
const values = { url: "database://benchmark" };
const CONCURRENT_READS = 8;

function createFactories(onCreate: (key: string) => void = () => {}) {
  return {
    database: async ({ url }: Pick<Definition, "url">) => {
      onCreate("database");
      // Keep initialization pending for concurrent callers without timing I/O or timers.
      await Promise.resolve();
      return { url };
    },
    users: ({ database }: Pick<Definition, "database">) => {
      onCreate("users");
      return { database };
    },
    audit: ({ database }: Pick<Definition, "database">) => {
      onCreate("audit");
      return { database };
    },
    service: ({ users, audit }: Pick<Definition, "users" | "audit">) => {
      onCreate("service");
      return { users, audit };
    },
  };
}

function createBuilder(onCreate?: (key: string) => void) {
  return defineContainer<Definition>().graph(graph).factories(createFactories(onCreate));
}

function createInferDIRoot(fast: boolean, onCreate?: (key: string) => void) {
  const factories = createFactories(onCreate);
  return new InferDIContainer({ fast })
    .registerValue("url", values.url)
    .registerAsyncFactory(
      "database",
      (url: string) => factories.database({ url }),
      ["url"],
      "scoped",
    )
    .registerAsyncFactory(
      "users",
      (database: Database) => factories.users({ database }),
      ["database"],
      "scoped",
    )
    .registerAsyncFactory(
      "audit",
      (database: Database) => factories.audit({ database }),
      ["database"],
      "scoped",
    )
    .registerAsyncFactory(
      "service",
      (users: Repository, audit: Repository) => factories.service({ users, audit }),
      ["users", "audit"],
      "scoped",
    );
}

type InferDIScope = ReturnType<ReturnType<typeof createInferDIRoot>["createScope"]>;
const ALL_KEYS = ["url", "database", "users", "audit", "service"] as const;

async function resolveInferDIAll(scope: InferDIScope) {
  for (const key of ALL_KEYS) {
    await scope.getAsync(key);
  }
  return scope;
}

const builder = createBuilder();
const inferDIRoots = [false, true].map((fast) => ({
  mode: fast ? "fast" : "default",
  root: createInferDIRoot(fast),
}));
let _sink: unknown;

beforeAll(async () => {
  for (const implementation of ["tatenuki", "InferDI default", "InferDI fast"]) {
    for (const operation of ["get", "resolveAll", "same key", "shared dependency"] as const) {
      const created: string[] = [];
      const onCreate = (key: string) => {
        created.push(key);
      };
      const instrumented = createBuilder(onCreate);
      const root = createInferDIRoot(implementation === "InferDI fast", onCreate);
      const createContext = () => {
        if (implementation === "tatenuki") {
          return instrumented.build(values);
        }
        const scope = root.createScope();
        return {
          get: <K extends keyof Definition>(key: K) => scope.getAsync(key),
          resolveAll: () => resolveInferDIAll(scope),
        };
      };
      const container = createContext();

      if (operation === "get") {
        await container.get("service");
      } else if (operation === "resolveAll") {
        await container.resolveAll();
      } else if (operation === "same key") {
        const services = await Promise.all(
          Array.from({ length: CONCURRENT_READS }, () => container.get("service")),
        );
        expect(services.every((service) => service === services[0])).toBe(true);
      } else {
        const [users, audit] = await Promise.all([container.get("users"), container.get("audit")]);
        expect(users.database).toBe(audit.database);
        expect(created.toSorted()).toEqual(["audit", "database", "users"]);
      }

      const service = await container.get("service");
      expect(service.users.database).toBe(service.audit.database);
      expect(service.users.database.url).toBe(values.url);
      expect(created.toSorted()).toEqual(["audit", "database", "service", "users"]);
      const other = await createContext().get("service");
      expect(other.users.database).not.toBe(service.users.database);
    }
  }
});

afterAll(() => {
  expect(_sink).toBeDefined();
});

describe("mixed async and sync factories, first get in a fresh context", () => {
  bench("tatenuki (build + first get through a shared async dependency)", async () => {
    _sink = await builder.build(values).get("service");
  });
  for (const { mode, root } of inferDIRoots) {
    bench(`InferDI (create scope + first getAsync, ${mode})`, async () => {
      _sink = await root.createScope().getAsync("service");
    });
  }
});

describe("mixed async and sync factories, resolve all in a fresh context", () => {
  bench("tatenuki (build + resolveAll)", async () => {
    _sink = await builder.build(values).resolveAll();
  });
  for (const { mode, root } of inferDIRoots) {
    bench(`InferDI (create scope + getAsync all keys, ${mode})`, async () => {
      _sink = await resolveInferDIAll(root.createScope());
    });
  }
});

describe(`${CONCURRENT_READS} concurrent reads of the same async service in a fresh context`, () => {
  bench(`tatenuki (build + ${CONCURRENT_READS} concurrent gets of the same key)`, async () => {
    const container = builder.build(values);
    _sink = await Promise.all(
      Array.from({ length: CONCURRENT_READS }, () => container.get("service")),
    );
  });
  for (const { mode, root } of inferDIRoots) {
    bench(`InferDI (create scope + ${CONCURRENT_READS} concurrent getAsync calls, ${mode})`, async () => {
      const scope = root.createScope();
      _sink = await Promise.all(
        Array.from({ length: CONCURRENT_READS }, () => scope.getAsync("service")),
      );
    });
  }
});

describe("concurrent roots sharing a pending async dependency in a fresh context", () => {
  bench("tatenuki (build + concurrent roots sharing a pending dependency)", async () => {
    const container = builder.build(values);
    _sink = await Promise.all([container.get("users"), container.get("audit")]);
  });
  for (const { mode, root } of inferDIRoots) {
    bench(`InferDI (create scope + concurrent getAsync roots, ${mode})`, async () => {
      const scope = root.createScope();
      _sink = await Promise.all([scope.getAsync("users"), scope.getAsync("audit")]);
    });
  }
});
