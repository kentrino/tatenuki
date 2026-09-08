import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SCENARIOS = [
  "cached-tatenuki",
  "cached-inferdi",
  "first-tatenuki",
  "first-inferdi",
  "partial-tatenuki",
  "partial-inferdi",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

type TatenukiModule = {
  defineContainer: () => {
    graph(graph: Record<string, readonly string[]>): {
      factories(factories: Record<string, (dependencies: Record<string, unknown>) => unknown>): {
        build(values: Record<string, unknown>): {
          get(key: string): Promise<unknown>;
        };
      };
    };
  };
};

type InferDIContainer = {
  registerValue(key: string, value: unknown): InferDIContainer;
  registerFactory(
    key: string,
    factory: (container: InferDIContainer) => unknown,
    dependencies: readonly string[],
    lifetime: string,
  ): InferDIContainer;
  createScope(): InferDIContainer;
  get(key: string): unknown;
};

type InferDIModule = {
  Container: new (options: { fast: boolean }) => InferDIContainer;
};

export function isScenario(value: string): value is Scenario {
  return (SCENARIOS as readonly string[]).includes(value);
}

export async function loadLibraries(repositoryRoot: string): Promise<{
  defineContainer: TatenukiModule["defineContainer"];
  InferDIContainer: InferDIModule["Container"];
}> {
  const tatenukiUrl = pathToFileURL(join(repositoryRoot, "packages/tatenuki/src/index.ts")).href;
  const tatenuki = (await import(tatenukiUrl)) as TatenukiModule;
  const requireFromBenchmark = createRequire(
    join(repositoryRoot, "benchmarks/container-comparison/package.json"),
  );
  const inferdiEntry = requireFromBenchmark.resolve("@inferdi/inferdi");
  const inferdi = (await import(pathToFileURL(inferdiEntry).href)) as InferDIModule;
  return {
    defineContainer: tatenuki.defineContainer,
    InferDIContainer: inferdi.Container,
  };
}

function createSmallGraph(defineContainer: TatenukiModule["defineContainer"]) {
  const config = { baseUrl: "https://example.com" };
  const logger = { level: "info" };
  const graph = {
    config: [],
    logger: [],
    repository: ["config", "logger"],
    service: ["repository", "logger"],
  };
  const builder = defineContainer()
    .graph(graph)
    .factories({
      repository: (dependencies) => ({
        config: dependencies.config,
        logger: dependencies.logger,
      }),
      service: (dependencies) => ({
        repository: dependencies.repository,
        logger: dependencies.logger,
      }),
    });

  return { config, logger, builder };
}

function createSmallInferDI(
  InferDIContainer: InferDIModule["Container"],
  config: { baseUrl: string },
  logger: { level: string },
): InferDIContainer {
  return new InferDIContainer({ fast: true })
    .registerValue("config", config)
    .registerValue("logger", logger)
    .registerFactory(
      "repository",
      (container) => ({
        config: container.get("config"),
        logger: container.get("logger"),
      }),
      ["config", "logger"],
      "singleton",
    )
    .registerFactory(
      "service",
      (container) => ({
        repository: container.get("repository"),
        logger: container.get("logger"),
      }),
      ["repository", "logger"],
      "singleton",
    );
}

function createLargeGraph(defineContainer: TatenukiModule["defineContainer"]) {
  const componentKeys = Array.from({ length: 1_000 }, (_, index) => `component${index}`);
  const targetKey = componentKeys[componentKeys.length - 1];
  const graph: Record<string, readonly string[]> = Object.fromEntries(
    componentKeys.map((key) => [key, []]),
  );
  graph.component1 = ["component0"];
  graph[targetKey] = ["component1"];
  const factories = Object.fromEntries(
    componentKeys.map((key, index) => {
      const dependency = graph[key]?.[0];
      return [
        key,
        (dependencies: Record<string, unknown>) =>
          dependency === undefined ? index : (dependencies[dependency] as number) + 1,
      ];
    }),
  );
  const builder = defineContainer().graph(graph).factories(factories);
  return { componentKeys, targetKey, graph, builder };
}

function createLargeInferDIRoot(
  InferDIContainer: InferDIModule["Container"],
  componentKeys: readonly string[],
  graph: Record<string, readonly string[]>,
): InferDIContainer {
  const container = new InferDIContainer({ fast: true });
  for (const [index, key] of componentKeys.entries()) {
    const dependency = graph[key]?.[0];
    container.registerFactory(
      key,
      (resolver) => (dependency === undefined ? index : (resolver.get(dependency) as number) + 1),
      dependency === undefined ? [] : [dependency],
      "scoped",
    );
  }
  return container;
}

export async function prepareScenario(
  repositoryRoot: string,
  scenario: Scenario,
  iterations: number,
): Promise<() => Promise<void>> {
  const { defineContainer, InferDIContainer } = await loadLibraries(repositoryRoot);
  let work: () => Promise<void>;

  switch (scenario) {
    case "cached-tatenuki": {
      const { config, logger, builder } = createSmallGraph(defineContainer);
      const container = builder.build({ config, logger });
      await container.get("service");
      work = async () => {
        for (let index = 0; index < iterations; index += 1) {
          await container.get("service");
        }
      };
      break;
    }
    case "cached-inferdi": {
      const { config, logger } = createSmallGraph(defineContainer);
      const container = createSmallInferDI(InferDIContainer, config, logger);
      container.get("service");
      work = async () => {
        for (let index = 0; index < iterations; index += 1) {
          container.get("service");
        }
      };
      break;
    }
    case "first-tatenuki": {
      const { config, logger, builder } = createSmallGraph(defineContainer);
      work = async () => {
        for (let index = 0; index < iterations; index += 1) {
          await builder.build({ config, logger }).get("service");
        }
      };
      break;
    }
    case "first-inferdi": {
      const { config, logger } = createSmallGraph(defineContainer);
      work = async () => {
        for (let index = 0; index < iterations; index += 1) {
          createSmallInferDI(InferDIContainer, config, logger).get("service");
        }
      };
      break;
    }
    case "partial-tatenuki": {
      const { targetKey, builder } = createLargeGraph(defineContainer);
      work = async () => {
        for (let index = 0; index < iterations; index += 1) {
          await builder.build({}).get(targetKey);
        }
      };
      break;
    }
    case "partial-inferdi": {
      const { componentKeys, targetKey, graph } = createLargeGraph(defineContainer);
      const root = createLargeInferDIRoot(InferDIContainer, componentKeys, graph);
      work = async () => {
        for (let index = 0; index < iterations; index += 1) {
          root.createScope().get(targetKey);
        }
      };
      break;
    }
    default: {
      const exhaustive: never = scenario;
      throw new Error(`Unknown scenario: ${String(exhaustive)}`);
    }
  }

  return work;
}

export async function runScenario(
  repositoryRoot: string,
  scenario: Scenario,
  iterations: number,
): Promise<{ scenario: Scenario; iterations: number; elapsedMs: number; nsPerOperation: number }> {
  const work = await prepareScenario(repositoryRoot, scenario, iterations);
  const start = performance.now();
  await work();
  const elapsedMs = performance.now() - start;
  return {
    scenario,
    iterations,
    elapsedMs,
    nsPerOperation: (elapsedMs * 1_000_000) / iterations,
  };
}
