import { Container as InferDIContainer } from "@inferdi/inferdi";
import { afterAll, bench, describe, expect } from "vite-plus/test";
import { defineContainer, type DependencyGraph } from "../../../packages/tatenuki/src/index.ts";

type Config = {
  readonly baseUrl: string;
};

type Logger = {
  readonly level: "info";
};

type Repository = {
  readonly config: Config;
  readonly logger: Logger;
};

type Service = {
  readonly repository: Repository;
  readonly logger: Logger;
};

type Definition = {
  config: Config;
  logger: Logger;
  repository: Repository;
  service: Service;
};

const config: Config = { baseUrl: "https://example.com" };
const logger: Logger = { level: "info" };

const graph = {
  config: [],
  logger: [],
  repository: ["config", "logger"],
  service: ["repository", "logger"],
} as const satisfies DependencyGraph<Definition>;

const tatenukiBuilder = defineContainer<Definition>()
  .graph(graph)
  .factories({
    repository: ({ config, logger }) => ({ config, logger }),
    service: ({ repository, logger }) => ({ repository, logger }),
  });

function createTatenukiContainer() {
  return tatenukiBuilder.build({ config, logger });
}

function createInferDIContainer(fast: boolean) {
  return new InferDIContainer({ fast })
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

let _sink: unknown;

afterAll(() => {
  expect(_sink).toBeDefined();
});

describe("cached singleton get", async () => {
  const tatenuki = createTatenukiContainer();
  const inferDIDefault = createInferDIContainer(false);
  const inferDIFast = createInferDIContainer(true);

  await tatenuki.get("service");
  inferDIDefault.get("service");
  inferDIFast.get("service");

  bench("tatenuki (async get)", async () => {
    _sink = await tatenuki.get("service");
  });

  bench("InferDI (sync get, default)", () => {
    _sink = inferDIDefault.get("service");
  });

  bench("InferDI (sync get, fast)", () => {
    _sink = inferDIFast.get("service");
  });
});

describe("container build and first singleton get", () => {
  bench("tatenuki (async get)", async () => {
    const container = createTatenukiContainer();
    _sink = await container.get("service");
  });

  bench("InferDI (sync get, default)", () => {
    const container = createInferDIContainer(false);
    _sink = container.get("service");
  });

  bench("InferDI (sync get, fast)", () => {
    const container = createInferDIContainer(true);
    _sink = container.get("service");
  });
});
