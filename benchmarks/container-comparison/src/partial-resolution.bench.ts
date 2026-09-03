import { Container as InferDIContainer } from "@inferdi/inferdi";
import { afterAll, beforeAll, bench, describe, expect } from "vite-plus/test";
import { defineContainer } from "../../../packages/tatenuki/src/index.ts";

const COMPONENT_COUNT = 1_000;
const COMPONENT_KEYS = Array.from({ length: COMPONENT_COUNT }, (_, index) => `component${index}`);
const TARGET_KEY = COMPONENT_KEYS.at(-1) as string;
const LAZY_ROOTS = ["component10", "component20", "component30", TARGET_KEY] as const;
const LAZY_ROOT_FACTORY_COUNT = 6;

type Definition = Record<string, number>;
type Factory = (dependencies: Definition) => number;
type DynamicTatenukiContainer = {
  get(key: string): Promise<number>;
  resolveAll(): Promise<{ get(key: string): number }>;
};
type DynamicTatenukiBuilder = {
  build(values: Record<string, never>): DynamicTatenukiContainer;
};
type DynamicTatenukiDefinition = {
  graph(graph: Record<string, readonly string[]>): {
    factories(factories: Record<string, Factory>): DynamicTatenukiBuilder;
  };
};

const graph: Record<string, readonly string[]> = Object.fromEntries(
  COMPONENT_KEYS.map((key) => [key, []]),
);
graph.component1 = ["component0"];
graph[TARGET_KEY] = ["component1"];

function createFactories(onCreate: () => void): Record<string, Factory> {
  return Object.fromEntries(
    COMPONENT_KEYS.map((key, index) => {
      const dependency = graph[key]?.[0];
      return [
        key,
        (dependencies: Definition) => {
          onCreate();
          return dependency === undefined ? index : dependencies[dependency] + 1;
        },
      ];
    }),
  );
}

function createTatenukiBuilder(onCreate: () => void): DynamicTatenukiBuilder {
  const definition = defineContainer<Definition>() as unknown as DynamicTatenukiDefinition;
  return definition.graph(graph).factories(createFactories(onCreate));
}

const tatenukiBuilder = createTatenukiBuilder(() => {});

function createTatenukiContainer() {
  return tatenukiBuilder.build({});
}

type DynamicInferDIContainer = {
  registerFactory(
    key: string,
    factory: (container: DynamicInferDIContainer) => number,
    dependencies: readonly string[],
    lifetime: "singleton" | "scoped",
  ): unknown;
  createScope(): DynamicInferDIContainer;
  get(key: string): number;
};

function createInferDIContainer(
  fast: boolean,
  onCreate: () => void = () => {},
  lifetime: "singleton" | "scoped" = "singleton",
) {
  const container = new InferDIContainer({ fast }) as unknown as DynamicInferDIContainer;

  for (const [index, key] of COMPONENT_KEYS.entries()) {
    const dependency = graph[key]?.[0];
    container.registerFactory(
      key,
      (resolver) => {
        onCreate();
        return dependency === undefined ? index : resolver.get(dependency) + 1;
      },
      dependency === undefined ? [] : [dependency],
      lifetime,
    );
  }

  return container;
}

const inferDIDefaultRoot = createInferDIContainer(false, () => {}, "scoped");
const inferDIFastRoot = createInferDIContainer(true, () => {}, "scoped");

let _sink: unknown;

beforeAll(async () => {
  let tatenukiCreated = 0;
  const instrumentedBuilder = createTatenukiBuilder(() => tatenukiCreated++);
  await instrumentedBuilder.build({}).get(TARGET_KEY);

  let inferDICreated = 0;
  createInferDIContainer(false, () => inferDICreated++).get(TARGET_KEY);

  expect(tatenukiCreated).toBe(3);
  expect(inferDICreated).toBe(3);

  let tatenukiLazyCreated = 0;
  const lazyBuilder = createTatenukiBuilder(() => tatenukiLazyCreated++);
  const lazyContainer = lazyBuilder.build({});
  for (const key of LAZY_ROOTS) {
    await lazyContainer.get(key);
  }

  let inferDILazyCreated = 0;
  const inferDILazy = createInferDIContainer(false, () => inferDILazyCreated++);
  for (const key of LAZY_ROOTS) {
    inferDILazy.get(key);
  }

  expect(tatenukiLazyCreated).toBe(LAZY_ROOT_FACTORY_COUNT);
  expect(inferDILazyCreated).toBe(LAZY_ROOT_FACTORY_COUNT);

  let tatenukiResolveAllCreated = 0;
  const resolveAllBuilder = createTatenukiBuilder(() => tatenukiResolveAllCreated++);
  await resolveAllBuilder.build({}).resolveAll();

  let inferDIResolveAllCreated = 0;
  const inferDIResolveAll = createInferDIContainer(false, () => inferDIResolveAllCreated++);
  for (const key of COMPONENT_KEYS) {
    inferDIResolveAll.get(key);
  }

  expect(tatenukiResolveAllCreated).toBe(COMPONENT_COUNT);
  expect(inferDIResolveAllCreated).toBe(COMPONENT_COUNT);
});

afterAll(() => {
  expect(_sink).toBeDefined();
});

describe(`${COMPONENT_COUNT.toLocaleString()} preconfigured components, 3 resolved in a fresh context`, () => {
  bench("tatenuki (build from reused builder + async get)", async () => {
    const container = createTatenukiContainer();
    _sink = await container.get(TARGET_KEY);
  });

  bench("InferDI (create scope + sync get, default)", () => {
    const scope = inferDIDefaultRoot.createScope();
    _sink = scope.get(TARGET_KEY);
  });

  bench("InferDI (create scope + sync get, fast)", () => {
    const scope = inferDIFastRoot.createScope();
    _sink = scope.get(TARGET_KEY);
  });
});

describe(`${COMPONENT_COUNT.toLocaleString()} components registered into each fresh root, 3 resolved`, () => {
  bench("tatenuki (reused builder + async first get)", async () => {
    const container = createTatenukiContainer();
    _sink = await container.get(TARGET_KEY);
  });

  bench("InferDI (register + sync first get, default)", () => {
    const container = createInferDIContainer(false);
    _sink = container.get(TARGET_KEY);
  });

  bench("InferDI (register + sync first get, fast)", () => {
    const container = createInferDIContainer(true);
    _sink = container.get(TARGET_KEY);
  });
});

describe(`${COMPONENT_COUNT.toLocaleString()} preconfigured components, 4 lazy roots in a fresh context`, () => {
  bench("tatenuki (build from reused builder + async get)", async () => {
    const container = createTatenukiContainer();
    for (const key of LAZY_ROOTS) {
      _sink = await container.get(key);
    }
  });

  bench("InferDI (create scope + sync get, default)", () => {
    const scope = inferDIDefaultRoot.createScope();
    for (const key of LAZY_ROOTS) {
      _sink = scope.get(key);
    }
  });

  bench("InferDI (create scope + sync get, fast)", () => {
    const scope = inferDIFastRoot.createScope();
    for (const key of LAZY_ROOTS) {
      _sink = scope.get(key);
    }
  });
});

describe(`${COMPONENT_COUNT.toLocaleString()} preconfigured components, resolve all in a fresh context`, () => {
  bench("tatenuki (build from reused builder + resolveAll)", async () => {
    const container = createTatenukiContainer();
    _sink = await container.resolveAll();
  });

  bench("InferDI (create scope + sync get all, default)", () => {
    const scope = inferDIDefaultRoot.createScope();
    for (const key of COMPONENT_KEYS) {
      _sink = scope.get(key);
    }
  });

  bench("InferDI (create scope + sync get all, fast)", () => {
    const scope = inferDIFastRoot.createScope();
    for (const key of COMPONENT_KEYS) {
      _sink = scope.get(key);
    }
  });
});
