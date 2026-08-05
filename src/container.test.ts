import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { Container, inject } from "./container.ts";
import { get } from "./get.ts";
import { resolve } from "./resolve.ts";
import type { DependencyGraph } from "./type.ts";

class ApiClient {
  readonly baseUrl: string;

  constructor({ baseUrl }: { baseUrl: string }) {
    this.baseUrl = baseUrl;
  }
}

class Service {
  readonly apiClient: ApiClient;

  constructor({ apiClient }: { apiClient: ApiClient }) {
    this.apiClient = apiClient;
  }
}

type Definition = {
  baseUrl: string;
  apiClient: ApiClient;
  service: Service;
};

const dependencies = {
  baseUrl: [],
  apiClient: ["baseUrl"],
  service: ["apiClient"],
} as const satisfies DependencyGraph<Definition>;

describe("Container", () => {
  it("resolves chained factories and values", async () => {
    const result = await new Container<Definition, typeof dependencies>(dependencies)
      .factory({
        apiClient: inject(ApiClient),
        service: inject(Service),
      })
      .resolve({ baseUrl: "https://example.com" });

    expectTypeOf(result).toEqualTypeOf<Definition>();
    expect(result.service.apiClient.baseUrl).toBe("https://example.com");
  });

  it("lazily resolves and caches a requested value", async () => {
    const createApiClient = vi.fn(inject(ApiClient));
    const container = new Container<Definition, typeof dependencies>(dependencies)
      .factory({
        apiClient: createApiClient,
        service: inject(Service),
      })
      .value({ baseUrl: "https://example.com" });

    const first = await container.get("service");
    const second = await container.get("service");

    expect(first).toBe(second);
    expect(createApiClient).toHaveBeenCalledOnce();
  });
});

describe("resolution", () => {
  it("continues resolving when graph order requires multiple passes", async () => {
    type Values = { first: string; second: string; third: string };
    const graph = {
      third: ["second"],
      second: ["first"],
      first: [],
    } as const;

    const result = await resolve<Values, typeof graph, keyof Values>(
      graph,
      {
        first: () => "first",
        second: ({ first }) => `${first}-second`,
        third: ({ second }) => `${second}-third`,
      },
      {},
    );

    expect(result.third).toBe("first-second-third");
  });

  it("reports circular dependencies", async () => {
    type Values = { first: string; second: string };
    const graph = {
      first: ["second"],
      second: ["first"],
    } as const;

    await expect(
      get<Values, "first">(
        graph,
        {},
        {
          first: ({ second }) => second,
          second: ({ first }) => first,
        },
        "first",
      ),
    ).rejects.toThrow("Circular dependency");
  });

  it("caches resolved undefined values", async () => {
    type Values = { optional: undefined };
    const factory = vi.fn(() => undefined);
    const graph = { optional: [] } as const;
    const resolved: Partial<Values> = {};

    await get(graph, resolved, { optional: factory }, "optional");
    await get(graph, resolved, { optional: factory }, "optional");

    expect(factory).toHaveBeenCalledOnce();
  });
});
