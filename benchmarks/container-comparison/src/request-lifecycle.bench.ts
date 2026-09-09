import { Container as InferDIContainer } from "@inferdi/inferdi";
import { afterAll, beforeAll, bench, describe, expect } from "vite-plus/test";
import { defineContainer, type DependencyGraph } from "../../../packages/tatenuki/src/index.ts";

type Disposal = "none" | "sync" | "async";
type Resource = {
  closed: boolean;
  [Symbol.dispose]?: () => void;
  [Symbol.asyncDispose]?: () => Promise<void>;
};
type Pool = Resource & { readonly name: string };
type Session = Resource & { readonly pool: Pool; readonly requestId: string };
type Repository = Resource & { readonly session: Session };
type Definition = {
  pool: Pool;
  requestId: string;
  session: Session;
  repository: Repository;
  service: { readonly repository: Repository; readonly session: Session };
};

const graph = {
  pool: [],
  requestId: [],
  session: ["pool", "requestId"],
  repository: ["session"],
  service: ["repository", "session"],
} as const satisfies DependencyGraph<Definition>;

function createResource(disposal: Disposal): Resource {
  if (disposal === "sync") {
    return {
      closed: false,
      [Symbol.dispose]() {
        this.closed = true;
      },
    };
  }
  if (disposal === "async") {
    return {
      closed: false,
      async [Symbol.asyncDispose]() {
        // Model asynchronous cleanup without external I/O or timer latency.
        await Promise.resolve();
        this.closed = true;
      },
    };
  }
  return { closed: false };
}

function createBuilder(disposal: Disposal) {
  return defineContainer<Definition>()
    .graph(graph)
    .factories({
      session: ({ pool, requestId }) => ({ ...createResource(disposal), pool, requestId }),
      repository: ({ session }) => ({ ...createResource(disposal), session }),
      service: ({ repository, session }) => ({ repository, session }),
    });
}

function createInferDIRoot(disposal: Disposal, pool: Pool, fast: boolean) {
  return new InferDIContainer({ fast })
    .registerValue("pool", pool)
    .declareScopeInputs<{ requestId: string }>()
    .registerFactory(
      "session",
      (scope) => ({
        ...createResource(disposal),
        pool: scope.get("pool"),
        requestId: scope.get("requestId"),
      }),
      ["pool", "requestId"],
      "scoped",
    )
    .registerFactory(
      "repository",
      (scope) => ({
        ...createResource(disposal),
        session: scope.get("session"),
      }),
      ["session"],
      "scoped",
    )
    .registerFactory(
      "service",
      (scope) => ({
        repository: scope.get("repository"),
        session: scope.get("session"),
      }),
      ["repository", "session"],
      "scoped",
    );
}

let _sink: unknown;

afterAll(() => {
  expect(_sink).toBeDefined();
});

for (const disposal of ["none", "sync", "async"] as const) {
  describe(`request lifecycle, shared application pool, ${disposal} cleanup`, () => {
    const builder = createBuilder(disposal);
    const pool: Pool = { ...createResource("sync"), name: "application pool" };
    const inferDIRoots = [false, true].map((fast) => ({
      mode: fast ? "fast" : "default",
      root: createInferDIRoot(disposal, pool, fast),
    }));

    beforeAll(async () => {
      const createContexts = [
        (requestId: string) => builder.build({ pool, requestId }),
        ...inferDIRoots.map(
          ({ root }) =>
            (requestId: string) =>
              root.createScope({ requestId }),
        ),
      ];
      for (const createContext of createContexts) {
        const first = createContext("first");
        const second = createContext("second");
        const service = await first.get("service");
        const other = await second.get("service");

        expect(service.session).toBe(service.repository.session);
        expect(service.session).not.toBe(other.session);
        expect(service.session.requestId).toBe("first");
        expect(other.session.requestId).toBe("second");
        expect(service.session.pool).toBe(pool);
        expect(other.session.pool).toBe(pool);
        await first.dispose();
        expect(service.session.closed).toBe(disposal !== "none");
        expect(service.repository.closed).toBe(disposal !== "none");
        expect(other.session.closed).toBe(false);
        expect(pool.closed).toBe(false);
        await second.dispose();
        expect(other.session.closed).toBe(disposal !== "none");
        expect(other.repository.closed).toBe(disposal !== "none");
        expect(pool.closed).toBe(false);
      }
    });

    bench(`tatenuki (build + get + dispose, ${disposal} cleanup)`, async () => {
      const container = builder.build({ pool, requestId: "benchmark-request" });
      _sink = await container.get("service");
      await container.dispose();
    });
    for (const { mode, root } of inferDIRoots) {
      bench(`InferDI (create scope + get + dispose, ${mode})`, async () => {
        const scope = root.createScope({ requestId: "benchmark-request" });
        _sink = scope.get("service");
        await scope.dispose();
      });
    }
  });
}
