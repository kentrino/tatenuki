import { runInNewContext } from "node:vm";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { alias, Container, defineContainer, inject } from "./container.ts";
import { get, getWithPlan } from "./get.ts";
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
  it("injects dependencies into a function's first argument", async () => {
    type FunctionDefinition = {
      apiClient: ApiClient;
      findUser: (userId: string) => string;
    };
    const functionDependencies = {
      apiClient: [],
      findUser: ["apiClient"],
    } as const satisfies DependencyGraph<FunctionDefinition>;
    function findUser({ apiClient }: { apiClient: ApiClient }, userId: string) {
      return `${apiClient.baseUrl}/users/${userId}`;
    }
    const container = defineContainer<FunctionDefinition>()
      .graph(functionDependencies)
      .factories({ findUser: inject(findUser) })
      .build({ apiClient: new ApiClient({ baseUrl: "https://example.com" }) });

    const injectedFindUser = await container.get("findUser");

    expectTypeOf(injectedFindUser).toEqualTypeOf<(userId: string) => string>();
    expect(injectedFindUser("42")).toBe("https://example.com/users/42");
  });

  it("injects a class expression without whitespace after the class keyword", () => {
    const MinifiedClass = runInNewContext(
      "(class{constructor(dependencies){this.dependencies=dependencies}})",
    ) as new (dependencies: { value: string }) => {
      dependencies: { value: string };
    };

    const instance = inject(MinifiedClass)({ value: "injected" });

    expect(instance).toBeInstanceOf(MinifiedClass);
    expect(instance.dependencies).toEqual({ value: "injected" });
  });

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

  it("aliases an existing dependency without creating a new instance", async () => {
    type AliasDefinition = {
      apiClient: ApiClient;
      primaryApiClient: ApiClient;
    };
    const aliasDependencies = {
      apiClient: [],
      primaryApiClient: ["apiClient"],
    } as const satisfies DependencyGraph<AliasDefinition>;
    const apiClient = new ApiClient({ baseUrl: "https://example.com" });
    const container = defineContainer<AliasDefinition>()
      .graph(aliasDependencies)
      .factories({ primaryApiClient: alias("apiClient") })
      .build({ apiClient });

    const primaryApiClient = await container.get("primaryApiClient");

    expectTypeOf(primaryApiClient).toEqualTypeOf<ApiClient>();
    expect(primaryApiClient).toBe(apiClient);
  });

  it("aliases a dependency as a compatible supertype", async () => {
    type SuperApiClient = Pick<ApiClient, "baseUrl">;
    type AliasDefinition = {
      apiClient: ApiClient;
      primaryApiClient: SuperApiClient;
    };
    const aliasDependencies = {
      apiClient: [],
      primaryApiClient: ["apiClient"],
    } as const satisfies DependencyGraph<AliasDefinition>;
    const apiClient = new ApiClient({ baseUrl: "https://example.com" });
    const container = defineContainer<AliasDefinition>()
      .graph(aliasDependencies)
      .factories({ primaryApiClient: alias("apiClient") })
      .build({ apiClient });

    const primaryApiClient = await container.get("primaryApiClient");

    expectTypeOf(primaryApiClient).toEqualTypeOf<SuperApiClient>();
    expect(primaryApiClient).toBe(apiClient);
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

  it("resolves every factory before enabling synchronous get", async () => {
    const container = defineContainer<Definition>()
      .graph(dependencies)
      .factories({
        apiClient: async ({ baseUrl }) => new ApiClient({ baseUrl }),
        service: inject(Service),
      })
      .build({ baseUrl: "https://example.com" });

    const resolved = await container.resolveAll();
    const service = resolved.get("service");

    expectTypeOf(service).toEqualTypeOf<Service>();
    expect(service.apiClient.baseUrl).toBe("https://example.com");
  });

  it("resolves the full graph through one plan and does not rerun completed factories", async () => {
    type Values = {
      first: string;
      second: string;
      third: string;
    };
    const graph = {
      third: ["second"],
      second: ["first"],
      first: [],
    } as const;
    const executionOrder: string[] = [];
    const createFirst = vi.fn(() => {
      executionOrder.push("first");
      return "first";
    });
    const createSecond = vi.fn(({ first }: Pick<Values, "first">) => {
      executionOrder.push("second");
      return `${first}-second`;
    });
    const createThird = vi.fn(({ second }: Pick<Values, "second">) => {
      executionOrder.push("third");
      return `${second}-third`;
    });
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: createFirst,
        second: createSecond,
        third: createThird,
      })
      .build({});

    await container.get("second");
    const resolved = await container.resolveAll();

    expect(executionOrder).toEqual(["first", "second", "third"]);
    expect(createFirst).toHaveBeenCalledOnce();
    expect(createSecond).toHaveBeenCalledOnce();
    expect(createThird).toHaveBeenCalledOnce();
    expect(resolved.get("third")).toBe("first-second-third");
  });

  it("does not start independent factories in parallel during resolveAll", async () => {
    type Values = {
      first: string;
      second: string;
    };
    const graph = {
      first: [],
      second: [],
    } as const;
    let inFlight = 0;
    let maxInFlight = 0;
    let releaseFirst: () => void = () => undefined;
    const firstBlocked = new Promise<void>((resolveBlocked) => {
      releaseFirst = resolveBlocked;
    });
    let secondStarted = false;
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await firstBlocked;
          inFlight -= 1;
          return "first";
        },
        second: async () => {
          secondStarted = true;
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          inFlight -= 1;
          return "second";
        },
      })
      .build({});

    const resolved = container.resolveAll();
    await Promise.resolve();
    expect(secondStarted).toBe(false);

    releaseFirst();
    await resolved;

    expect(maxInFlight).toBe(1);
    expect(secondStarted).toBe(true);
  });

  it("reports resolveAll cycles and missing factories with the get() error strings", async () => {
    const defineUnchecked = defineContainer as unknown as () => {
      graph(dependencies: Record<string, readonly string[]>): {
        factories(factories: Record<string, (values: Record<string, string>) => string>): {
          build(values: Record<string, never>): { resolveAll(): Promise<unknown> };
        };
      };
    };
    const cyclic = defineUnchecked()
      .graph({
        first: ["second"],
        second: ["first"],
      })
      .factories({
        first: ({ second }) => second,
        second: ({ first }) => first,
      })
      .build({});

    await expect(cyclic.resolveAll()).rejects.toThrow("Circular dependency");

    const missing = defineContainer<{ missing: string }>()
      .graph({ missing: [] } as const)
      .build({} as never);

    await expect(missing.resolveAll()).rejects.toThrow("No factory for missing");
  });

  it("rejects resolveAll after disposal and during an in-flight bulk resolution", async () => {
    type Values = { first: string; second: string };
    const graph = {
      first: [],
      second: ["first"],
    } as const;
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolveBlocked) => {
      release = resolveBlocked;
    });
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: async () => {
          await blocked;
          return "first";
        },
        second: () => "second",
      })
      .build({});

    const resolving = container.resolveAll();
    const disposal = container.dispose();
    await expect(container.resolveAll()).rejects.toThrow("Container is disposed");

    release();
    await expect(resolving).rejects.toThrow("Container is disposed");
    await disposal;
  });

  it("keeps small non-disposable resolutions in compact ownership storage", async () => {
    type Values = {
      seed: string;
      first: object;
      second: object;
    };
    const graph = {
      seed: [],
      first: ["seed"],
      second: ["first"],
    } as const;
    const first = {};
    const second = {};
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: () => first,
        second: () => second,
      })
      .build({ seed: "seed" });

    await container.get("second");

    expect(Reflect.get(container, "known")).toEqual(["seed", first, second]);
    expect(Reflect.get(container, "owned")).toBeUndefined();
  });

  it("does not track initial value identities until the first factory result", async () => {
    type Values = {
      seed: string;
      first: object;
    };
    const graph = {
      seed: [],
      first: ["seed"],
    } as const;
    const first = {};
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: () => first,
      })
      .build({ seed: "seed" });

    expect(Reflect.get(container, "known")).toBeUndefined();

    await container.get("first");

    expect(Reflect.get(container, "known")).toEqual(["seed", first]);
  });

  it("borrows a factory result that is identical to an effective initial value", async () => {
    type Values = {
      built: Disposable;
      copied: Disposable;
    };
    const graph = {
      built: [],
      copied: ["built"],
    } as const;
    const disposeBuilt = vi.fn();
    const built = { [Symbol.dispose]: disposeBuilt };
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        copied: ({ built }) => built,
      })
      .build({ built });

    await container.get("copied");
    await container.dispose();

    expect(disposeBuilt).not.toHaveBeenCalled();
    expect(Reflect.get(container, "owned")).toBeUndefined();
  });

  it("tracks factory results from later lazy gets on the same container", async () => {
    type Values = {
      first: Disposable;
      second: Disposable;
      aliasOfFirst: Disposable;
    };
    const graph = {
      first: [],
      second: [],
      aliasOfFirst: ["first"],
    } as const;
    const disposeFirst = vi.fn();
    const disposeSecond = vi.fn();
    const first = { [Symbol.dispose]: disposeFirst };
    const second = { [Symbol.dispose]: disposeSecond };
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: () => first,
        second: () => second,
        aliasOfFirst: () => first,
      })
      .build({});

    await container.get("first");
    await container.get("second");
    await container.get("aliasOfFirst");
    await container.dispose();

    expect(Reflect.get(container, "owned")).toEqual([first, second]);
    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(disposeSecond).toHaveBeenCalledOnce();
  });

  it("disposes a duplicate owned factory result once", async () => {
    type Values = {
      first: Disposable;
      second: Disposable;
    };
    const graph = {
      first: [],
      second: ["first"],
    } as const;
    const disposeResource = vi.fn();
    const resource = { [Symbol.dispose]: disposeResource };
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: () => resource,
        second: () => resource,
      })
      .build({});

    await container.get("second");
    await container.dispose();

    expect(disposeResource).toHaveBeenCalledOnce();
  });

  it("does not start in-flight tracking for a cached value", async () => {
    const container = new Container<Definition, typeof dependencies>(dependencies)
      .factory({
        apiClient: inject(ApiClient),
        service: inject(Service),
      })
      .value({ baseUrl: "https://example.com" });
    await container.get("service");

    await container.get("service");

    expect(Reflect.get(container, "inflight")).toBeUndefined();
  });

  it("allocates an in-flight set only for concurrent resolutions", async () => {
    type Values = {
      first: string;
      second: string;
    };
    const graph = {
      first: [],
      second: [],
    } as const;
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolveBlocked) => {
      release = resolveBlocked;
    });
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: async () => {
          await blocked;
          return "first";
        },
        second: async () => {
          await blocked;
          return "second";
        },
      })
      .build({});

    const first = container.get("first");
    expect(Reflect.get(container, "inflight")).toBeInstanceOf(Promise);
    const second = container.get("second");
    const inflight = Reflect.get(container, "inflight");

    expect(inflight).toBeInstanceOf(Set);
    expect(inflight).toHaveProperty("size", 2);

    let disposed = false;
    const disposal = container.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);

    release();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    await disposal;
    expect(Reflect.get(container, "inflight")).toBeUndefined();
  });

  it("reuses first-resolution plans across containers from the same builder", async () => {
    const builder = defineContainer<Definition>()
      .graph(dependencies)
      .factories({
        apiClient: inject(ApiClient),
        service: inject(Service),
      });
    const planCache = Reflect.get(builder, "planCache") as Map<
      PropertyKey,
      { plan: readonly PropertyKey[] }[]
    >;

    await builder.build({ baseUrl: "first" }).get("service");
    const firstPlan = planCache.get("service")?.[0]?.plan;
    await builder.build({ baseUrl: "second" }).get("service");

    expect(firstPlan).toEqual(["apiClient", "service"]);
    expect(planCache.get("service")).toHaveLength(1);
    expect(planCache.get("service")?.[0]?.plan).toBe(firstPlan);
  });

  it("reuses later-root plans computed from initial resolved keys", async () => {
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
    let sharedCount = 0;
    const builder = defineContainer<Values>()
      .graph(graph)
      .factories({
        shared: () => {
          sharedCount += 1;
          return "shared";
        },
        left: ({ shared }) => `${shared}-left`,
        right: ({ shared }) => `${shared}-right`,
      });
    const planCache = Reflect.get(builder, "planCache") as Map<
      PropertyKey,
      { plan: readonly PropertyKey[] }[]
    >;

    const first = builder.build({});
    await expect(first.get("left")).resolves.toBe("shared-left");
    await expect(first.get("right")).resolves.toBe("shared-right");
    const rightPlan = planCache.get("right")?.[0]?.plan;

    const second = builder.build({});
    await expect(second.get("right")).resolves.toBe("shared-right");

    expect(sharedCount).toBe(2);
    expect(rightPlan).toEqual(["shared", "right"]);
    expect(planCache.get("right")).toHaveLength(1);
    expect(planCache.get("right")?.[0]?.plan).toBe(rightPlan);
  });

  it("keeps override keys in later-root plans", async () => {
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
    const createShared = vi.fn(() => "shared");
    const builder = defineContainer<Values>()
      .graph(graph)
      .factories({
        shared: createShared,
        left: ({ shared }) => `${shared}-left`,
        right: ({ shared }) => `${shared}-right`,
      })
      .override({ shared: "override" });

    const first = builder.build({});
    await expect(first.get("left")).resolves.toBe("override-left");
    await expect(first.get("right")).resolves.toBe("override-right");

    const second = builder.build({});
    await expect(second.get("right")).resolves.toBe("override-right");
    expect(createShared).not.toHaveBeenCalled();
  });

  it("still hides cycles that initial values already break after a later factory", async () => {
    type Values = {
      first: string;
      second: string;
      third: string;
    };
    const graph = {
      first: ["second"],
      second: ["first"],
      third: [],
    } as const;
    type CyclicContainer = {
      get<K extends keyof Values>(key: K): Promise<Values[K]>;
    };
    const builder = (
      defineContainer<Values>() as unknown as {
        graph(dependencies: typeof graph): {
          factories(factories: {
            first: (dependencies: Values) => string;
            second: (dependencies: Values) => string;
            third: () => string;
          }): {
            build(values: Pick<Values, "first">): CyclicContainer;
          };
        };
      }
    )
      .graph(graph)
      .factories({
        first: ({ second }) => second,
        second: ({ first }) => `${first}-second`,
        third: () => "third",
      });

    const first = builder.build({ first: "provided" });
    await expect(first.get("third")).resolves.toBe("third");
    await expect(first.get("second")).resolves.toBe("provided-second");

    const second = builder.build({ first: "provided" });
    await expect(second.get("second")).resolves.toBe("provided-second");
  });

  it("resolves a later key after a factory failure", async () => {
    type Values = {
      shared: string;
      failing: string;
      ok: string;
    };
    const graph = {
      shared: [],
      failing: ["shared"],
      ok: [],
    } as const;
    const builder = defineContainer<Values>()
      .graph(graph)
      .factories({
        shared: () => "shared",
        failing: () => {
          throw new Error("temporary failure");
        },
        ok: () => "ok",
      });

    const first = builder.build({});
    await expect(first.get("failing")).rejects.toThrow("temporary failure");
    await expect(first.get("ok")).resolves.toBe("ok");

    const second = builder.build({});
    await expect(second.get("ok")).resolves.toBe("ok");
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

  it("reuses immutable dependency snapshots across builder variants", async () => {
    type Values = {
      seed: number;
      derived: number;
    };
    const mutableDependencies = {
      seed: [] as [],
      derived: ["seed"] as ["seed"],
    };
    const root = new Container<Values, typeof mutableDependencies>(mutableDependencies);
    const first = root.factory({
      derived: ({ seed }) => seed + 1,
    });
    const overridden = first.override({ seed: 10 });
    const snapshot = Reflect.get(root, "dependencies");

    expect(Reflect.get(first, "dependencies")).toBe(snapshot);
    expect(Reflect.get(overridden, "dependencies")).toBe(snapshot);

    mutableDependencies.derived[0] = "derived" as "seed";
    Reflect.set(mutableDependencies, "added", []);
    const second = root.factory({
      derived: ({ seed }) => seed + 1,
    });

    expect(Reflect.get(second, "dependencies")).toBe(snapshot);
    expect(Reflect.ownKeys(snapshot)).toEqual(["seed", "derived"]);
    expect(snapshot.derived).toEqual(["seed"]);
    await expect(first.build({ seed: 1 }).get("derived")).resolves.toBe(2);
    await expect(overridden.build({ seed: 1 }).get("derived")).resolves.toBe(11);
    await expect(second.build({ seed: 2 }).get("derived")).resolves.toBe(3);
  });

  it("overrides a dependency at runtime without changing build requirements", async () => {
    const createApiClient = vi.fn(inject(ApiClient));
    const fakeApiClient = new ApiClient({ baseUrl: "fake" });
    const builderWithoutOverrides = defineContainer<Definition>()
      .graph(dependencies)
      .factories({
        apiClient: createApiClient,
        service: inject(Service),
      });
    const builder = builderWithoutOverrides.override({ apiClient: fakeApiClient });

    type BuildWithoutOverrides = typeof builderWithoutOverrides.build;
    type BuildWithOverrides = typeof builder.build;
    expectTypeOf<BuildWithOverrides>().toEqualTypeOf<BuildWithoutOverrides>();

    const service = await builder.build({ baseUrl: "required" }).get("service");

    expect(service.apiClient).toBe(fakeApiClient);
    expect(createApiClient).not.toHaveBeenCalled();
  });

  it("gives runtime overrides precedence over build values during full resolution", async () => {
    const result = await defineContainer<Definition>()
      .graph(dependencies)
      .factories({
        apiClient: inject(ApiClient),
        service: inject(Service),
      })
      .override({ baseUrl: "override" })
      .resolve({ baseUrl: "build" });

    expect(result.baseUrl).toBe("override");
    expect(result.apiClient.baseUrl).toBe("override");
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

  it("disposes lazily created resources in reverse creation order", async () => {
    type Values = {
      first: Disposable;
      second: AsyncDisposable;
    };
    const graph = {
      first: [],
      second: ["first"],
    } as const;
    const disposalOrder: string[] = [];
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: () => ({
          [Symbol.dispose]() {
            disposalOrder.push("first");
          },
        }),
        second: async () => ({
          async [Symbol.asyncDispose]() {
            disposalOrder.push("second");
          },
        }),
      })
      .build({});

    await container.get("second");
    await container.dispose();

    expect(disposalOrder).toEqual(["second", "first"]);
  });

  it("does not create or dispose unresolved resources", async () => {
    type Values = {
      used: Disposable;
      unused: Disposable;
    };
    const graph = {
      used: [],
      unused: [],
    } as const;
    const disposeUsed = vi.fn();
    const disposeUnused = vi.fn();
    const createUnused = vi.fn(() => ({ [Symbol.dispose]: disposeUnused }));
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        used: () => ({ [Symbol.dispose]: disposeUsed }),
        unused: createUnused,
      })
      .build({});

    await container.get("used");
    await container.dispose();

    expect(disposeUsed).toHaveBeenCalledOnce();
    expect(createUnused).not.toHaveBeenCalled();
    expect(disposeUnused).not.toHaveBeenCalled();
  });

  it("borrows build values and overrides even when they are disposable", async () => {
    type Values = {
      built: Disposable;
      overridden: Disposable;
      owned: Disposable;
    };
    const graph = {
      built: [],
      overridden: [],
      owned: ["built", "overridden"],
    } as const;
    const disposeBuilt = vi.fn();
    const disposeOverride = vi.fn();
    const disposeOwned = vi.fn();
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        owned: () => ({ [Symbol.dispose]: disposeOwned }),
      })
      .override({ overridden: { [Symbol.dispose]: disposeOverride } })
      .build({
        built: { [Symbol.dispose]: disposeBuilt },
        overridden: { [Symbol.dispose]: vi.fn() },
      });

    await container.get("owned");
    await container.dispose();

    expect(disposeOwned).toHaveBeenCalledOnce();
    expect(disposeBuilt).not.toHaveBeenCalled();
    expect(disposeOverride).not.toHaveBeenCalled();
  });

  it("disposes aliases once without taking ownership of borrowed values", async () => {
    type Values = {
      borrowed: Disposable;
      borrowedAlias: Disposable;
      owned: Disposable;
      ownedAlias: Disposable;
    };
    const graph = {
      borrowed: [],
      borrowedAlias: ["borrowed"],
      owned: [],
      ownedAlias: ["owned"],
    } as const;
    const disposeBorrowed = vi.fn();
    const disposeOwned = vi.fn();
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        borrowedAlias: alias("borrowed"),
        owned: () => ({ [Symbol.dispose]: disposeOwned }),
        ownedAlias: alias("owned"),
      })
      .build({ borrowed: { [Symbol.dispose]: disposeBorrowed } });

    await container.get("borrowedAlias");
    await container.get("ownedAlias");
    await container.dispose();

    expect(disposeBorrowed).not.toHaveBeenCalled();
    expect(disposeOwned).toHaveBeenCalledOnce();
  });

  it("returns one disposal promise and cleans up only once", async () => {
    type Values = { resource: AsyncDisposable };
    const graph = { resource: [] } as const;
    const disposeResource = vi.fn(async () => undefined);
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        resource: () => ({ [Symbol.asyncDispose]: disposeResource }),
      })
      .build({});
    await container.get("resource");

    const first = container.dispose();
    const second = container.dispose();

    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(disposeResource).toHaveBeenCalledOnce();
  });

  it("shares disposal state with a fully resolved container", async () => {
    type Values = { resource: Disposable };
    const graph = { resource: [] } as const;
    const disposeResource = vi.fn();
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        resource: () => ({ [Symbol.dispose]: disposeResource }),
      })
      .build({});
    const resolved = await container.resolveAll();

    const first = resolved.dispose();
    const second = container.dispose();

    expect(first).toBe(second);
    await first;
    expect(disposeResource).toHaveBeenCalledOnce();
    expect(() => resolved.get("resource")).toThrow("Container is disposed");
    await expect(container.get("resource")).rejects.toThrow("Container is disposed");
  });

  it("waits for active resolutions and rejects new resolutions during disposal", async () => {
    type Values = { resource: AsyncDisposable };
    const graph = { resource: [] } as const;
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolveBlocked) => {
      release = resolveBlocked;
    });
    const disposeResource = vi.fn(async () => undefined);
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        resource: async () => {
          await blocked;
          return { [Symbol.asyncDispose]: disposeResource };
        },
      })
      .build({});

    const resource = container.get("resource");
    const disposal = container.dispose();
    await expect(container.get("resource")).rejects.toThrow("Container is disposed");
    expect(disposeResource).not.toHaveBeenCalled();

    release();
    await resource;
    await disposal;

    expect(disposeResource).toHaveBeenCalledOnce();
  });

  it("continues cleanup and reports all disposal errors", async () => {
    type Values = {
      first: Disposable;
      second: Disposable;
    };
    const graph = {
      first: [],
      second: ["first"],
    } as const;
    const disposalOrder: string[] = [];
    const firstError = new Error("first cleanup failed");
    const secondError = new Error("second cleanup failed");
    const container = defineContainer<Values>()
      .graph(graph)
      .factories({
        first: () => ({
          [Symbol.dispose]() {
            disposalOrder.push("first");
            throw firstError;
          },
        }),
        second: () => ({
          [Symbol.dispose]() {
            disposalOrder.push("second");
            throw secondError;
          },
        }),
      })
      .build({});
    await container.get("second");

    const error = await container.dispose().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([secondError, firstError]);
    expect(disposalOrder).toEqual(["second", "first"]);
  });

  it("supports await using", async () => {
    type Values = { resource: Disposable };
    const graph = { resource: [] } as const;
    const disposeResource = vi.fn();

    async function useContainer() {
      await using container = defineContainer<Values>()
        .graph(graph)
        .factories({
          resource: () => ({ [Symbol.dispose]: disposeResource }),
        })
        .build({});

      await container.get("resource");
    }

    await useContainer();

    expect(disposeResource).toHaveBeenCalledOnce();
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

  it("preserves scan-order factory execution across multiple passes", async () => {
    type Values = {
      first: string;
      second: string;
      third: string;
      independent: string;
    };
    const graph = {
      first: ["second"],
      second: ["third"],
      third: [],
      independent: [],
    } as const;
    const executionOrder: string[] = [];

    await resolve<Values, typeof graph, keyof Values>(
      graph,
      {
        first: () => {
          executionOrder.push("first");
          return "first";
        },
        second: () => {
          executionOrder.push("second");
          return "second";
        },
        third: () => {
          executionOrder.push("third");
          return "third";
        },
        independent: () => {
          executionOrder.push("independent");
          return "independent";
        },
      },
      {},
    );

    expect(executionOrder).toEqual(["third", "independent", "second", "first"]);
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

  it("allows a pre-resolved value to break a dependency cycle", async () => {
    type Values = { first: string; second: string };
    const graph = {
      first: ["second"],
      second: ["first"],
    } as const;

    await expect(
      get<Values, "second">(
        graph,
        { first: "provided" },
        { second: ({ first }) => `${first}-second` },
        "second",
      ),
    ).resolves.toBe("provided-second");
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

  it("skips planned factories when the requested key is already resolved", async () => {
    type Values = {
      zero: number;
      empty: string;
    };
    const factories = {
      zero: vi.fn(() => 1),
      empty: vi.fn(() => "filled"),
    };

    await expect(
      getWithPlan<Values, "zero">({ zero: 0 }, factories, "zero", ["zero"]),
    ).resolves.toBe(0);
    await expect(
      getWithPlan<Values, "empty">({ empty: "" }, factories, "empty", ["empty"]),
    ).resolves.toBe("");
    expect(factories.zero).not.toHaveBeenCalled();
    expect(factories.empty).not.toHaveBeenCalled();
  });

  it("resolves a synchronous plan without pending-map tracking and still returns a Promise", async () => {
    type Values = {
      first: string;
      second: string;
    };
    const pending = new Map<PropertyKey, Promise<unknown>>();
    const pendingGet = vi.spyOn(pending, "get");
    const resolved: Partial<Values> = {};
    const result = getWithPlan<Values, "second">(
      resolved,
      {
        first: () => "first",
        second: ({ first }) => `${first}-second`,
      },
      "second",
      ["first", "second"],
      pending,
    );

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe("first-second");
    expect(pendingGet).not.toHaveBeenCalled();
    expect(pending.size).toBe(0);
    expect(resolved).toEqual({ first: "first", second: "first-second" });
  });

  it("awaits a thenable after earlier synchronous factories in the same plan", async () => {
    type Values = {
      first: string;
      second: string;
    };
    let resolveSecond: (value: string) => void = () => undefined;
    const second = new Promise<string>((resolvePromise) => {
      resolveSecond = resolvePromise;
    });
    const pending = new Map<PropertyKey, Promise<unknown>>();
    const resolved: Partial<Values> = {};
    const result = getWithPlan<Values, "second">(
      resolved,
      {
        first: () => "first",
        second: () => second,
      },
      "second",
      ["first", "second"],
      pending,
    );

    expect(resolved).toEqual({ first: "first" });
    expect(pending.size).toBe(1);
    resolveSecond("second");
    await expect(result).resolves.toBe("second");
    expect(pending.size).toBe(0);
    expect(resolved).toEqual({ first: "first", second: "second" });
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

  it("mutates the provided values object (in-place resolution behavior)", async () => {
    type Values = {
      seed: string;
      service: string;
    };
    const graph = {
      seed: [],
      service: ["seed"],
    } as const;
    const values = { seed: "ready" };

    const result = await resolve<Values, typeof graph, "service", "seed">(
      graph,
      { service: ({ seed }) => `${seed}-service` },
      values,
    );

    expect(result).toBe(values);
    expect(values).toEqual({ seed: "ready", service: "ready-service" });
  });

  it("does not count values outside the graph as resolved graph entries", async () => {
    type Values = {
      seed: string;
      service: string;
      metadata: boolean;
    };
    const graph = {
      seed: [],
      service: ["seed"],
    } as const;
    const createService = vi.fn(({ seed }: Pick<Values, "seed">) => `${seed}-service`);
    const values = { seed: "ready", metadata: true };

    const result = await resolve<Values, typeof graph, "service", "seed">(
      graph,
      { service: createService },
      values,
    );

    expect(result).toEqual({
      seed: "ready",
      service: "ready-service",
      metadata: true,
    });
    expect(createService).toHaveBeenCalledOnce();
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

  it("reports a missing lazy factory for Object prototype keys", async () => {
    await expect(
      get<{ constructor: string }, "constructor">(
        {} as Record<PropertyKey, readonly PropertyKey[]>,
        {},
        {},
        "constructor",
      ),
    ).rejects.toThrow("No factory for constructor");
  });
});
