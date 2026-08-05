import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { Container, defineContainer, inject } from "./container.ts";
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
  it("infers the graph type through the builder API", async () => {
    const container = defineContainer<Definition>()
      .graph(dependencies)
      .factories({
        apiClient: inject(ApiClient),
        service: inject(Service),
      })
      .build({ baseUrl: "https://example.com" });

    const service = await container.get("service");

    expectTypeOf(service).toEqualTypeOf<Service>();
    expect(service.apiClient.baseUrl).toBe("https://example.com");
  });

  it("resolves the entire graph through the builder API", async () => {
    const result = await defineContainer<Definition>()
      .graph(dependencies)
      .factories({
        apiClient: inject(ApiClient),
        service: inject(Service),
      })
      .resolve({ baseUrl: "https://example.com" });

    expectTypeOf(result).toEqualTypeOf<Definition>();
    expect(result.service.apiClient.baseUrl).toBe("https://example.com");
  });

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

  it("uses the latest factory when a key is registered again", async () => {
    const result = await new Container<Definition, typeof dependencies>(dependencies)
      .factory({
        apiClient: () => new ApiClient({ baseUrl: "first" }),
        service: inject(Service),
      })
      .factory({
        apiClient: () => new ApiClient({ baseUrl: "second" }),
      })
      .resolve({ baseUrl: "unused" });

    expect(result.apiClient.baseUrl).toBe("second");
  });

  it("does not share pending factories between containers using the same values object", async () => {
    type SharedDefinition = {
      seed: string;
      service: string;
    };
    const sharedDependencies = {
      seed: [],
      service: ["seed"],
    } as const;
    const sharedValues = { seed: "seed" };
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolveBlocked) => {
      release = resolveBlocked;
    });
    const first = new Container<SharedDefinition, typeof sharedDependencies>(sharedDependencies)
      .factory({
        service: async () => {
          await blocked;
          return "first";
        },
      })
      .value(sharedValues);
    const second = new Container<SharedDefinition, typeof sharedDependencies>(sharedDependencies)
      .factory({
        service: () => "second",
      })
      .value(sharedValues);

    const firstResult = first.get("service");
    const secondResult = second.get("service");
    release();

    await expect(firstResult).resolves.toBe("first");
    await expect(secondResult).resolves.toBe("second");
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

  it("treats all falsy pre-resolved values as initialized", async () => {
    type Values = {
      zero: number;
      disabled: boolean;
      empty: string;
      nil: null;
    };
    const graph = {
      zero: [],
      disabled: [],
      empty: [],
      nil: [],
    } as const;
    const resolved: Values = {
      zero: 0,
      disabled: false,
      empty: "",
      nil: null,
    };

    await expect(get(graph, resolved, {}, "zero")).resolves.toBe(0);
    await expect(get(graph, resolved, {}, "disabled")).resolves.toBe(false);
    await expect(get(graph, resolved, {}, "empty")).resolves.toBe("");
    await expect(get(graph, resolved, {}, "nil")).resolves.toBeNull();
  });

  it("resolves a shared dependency only once across concurrent requests", async () => {
    type Values = {
      shared: string;
      left: string;
      right: string;
    };
    const graph = {
      shared: [],
      left: ["shared"],
      right: ["shared"],
    } as const;
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolveBlocked) => {
      release = resolveBlocked;
    });
    const createShared = vi.fn(async () => {
      await blocked;
      return "shared";
    });
    const container = new Container<Values, typeof graph>(graph)
      .factory({
        shared: createShared,
        left: ({ shared }) => `${shared}-left`,
        right: ({ shared }) => `${shared}-right`,
      })
      .value({});

    const left = container.get("left");
    const right = container.get("right");
    release();

    await expect(Promise.all([left, right])).resolves.toEqual(["shared-left", "shared-right"]);
    expect(createShared).toHaveBeenCalledOnce();
  });

  it("retries a factory after a rejected attempt", async () => {
    type Values = { unstable: string };
    const graph = { unstable: [] } as const;
    let attempts = 0;
    const factory = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary failure");
      }
      return "recovered";
    });
    const resolved: Partial<Values> = {};

    await expect(get(graph, resolved, { unstable: factory }, "unstable")).rejects.toThrow(
      "temporary failure",
    );
    await expect(get(graph, resolved, { unstable: factory }, "unstable")).resolves.toBe(
      "recovered",
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("supports symbol dependency keys", async () => {
    const source = Symbol("source");
    const target = Symbol("target");
    type Values = {
      [source]: string;
      [target]: string;
    };
    const graph = {
      [source]: [],
      [target]: [source],
    } as const;

    await expect(
      get<Values, typeof target>(
        graph,
        {},
        {
          [source]: () => "source",
          [target]: (values) => `${values[source]}-target`,
        },
        target,
      ),
    ).resolves.toBe("source-target");
  });

  it("preserves an undefined value during eager resolution", async () => {
    type Values = {
      optional: undefined;
      initialized: boolean;
    };
    const graph = {
      initialized: ["optional"],
      optional: [],
    } as const;

    const result = await resolve<Values, typeof graph, "initialized", "optional">(
      graph,
      { initialized: ({ optional }) => optional === undefined },
      { optional: undefined },
    );

    expect(result).toEqual({ optional: undefined, initialized: true });
  });

  it("reports cycles during eager resolution", async () => {
    const resolveUnchecked = resolve as unknown as (
      graph: Record<string, readonly string[]>,
      factories: Record<string, (values: Record<string, string>) => string>,
      values: Record<string, string>,
    ) => Promise<Record<string, string>>;

    await expect(
      resolveUnchecked(
        {
          first: ["second"],
          second: ["first"],
        },
        {
          first: ({ second }) => second,
          second: ({ first }) => first,
        },
        {},
      ),
    ).rejects.toThrow("Circular dependency");
  });

  it("reports a missing lazy factory with its key", async () => {
    await expect(get({ missing: [] }, {}, {}, "missing")).rejects.toThrow("No factory for missing");
  });
});
