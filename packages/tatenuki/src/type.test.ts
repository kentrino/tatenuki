import { describe, expectTypeOf, it } from "vite-plus/test";
import type {
  DependenciesOf,
  DependantsOf,
  DependantsOfRecursive,
  DependencyGraph,
  Factory,
  PartialFactories,
  PartialValues,
  ValueOf,
} from "./type.ts";

type Definition = {
  config: string;
  logger: { log(message: string): void };
  repository: { find(): string };
  service: { run(): string };
  controller: { handle(): string };
};

const graph = {
  config: [],
  logger: ["config"],
  repository: ["config", "logger"],
  service: ["repository"],
  controller: ["service"],
} as const satisfies DependencyGraph<Definition>;

const deepGraph = {
  level0: [],
  level1: ["level0"],
  level2: ["level1"],
  level3: ["level2"],
  level4: ["level3"],
  level5: ["level4"],
  level6: ["level5"],
} as const satisfies DependencyGraph<Record<`level${0 | 1 | 2 | 3 | 4 | 5 | 6}`, unknown>>;

describe("dependency graph types", () => {
  it("describes every dependency key", () => {
    expectTypeOf(graph).toMatchTypeOf<DependencyGraph<Definition>>();
    expectTypeOf<DependencyGraph<Definition>["service"]>().toEqualTypeOf<
      readonly (keyof Definition)[]
    >();
  });

  it("finds direct dependants", () => {
    expectTypeOf<DependantsOf<typeof graph, "config">>().toEqualTypeOf<"logger" | "repository">();
    expectTypeOf<DependantsOf<typeof graph, "repository">>().toEqualTypeOf<"service">();
    expectTypeOf<DependantsOf<typeof graph, "controller">>().toEqualTypeOf<never>();
  });

  it("finds transitive dependants", () => {
    expectTypeOf<DependantsOfRecursive<typeof graph, "config">>().toEqualTypeOf<
      "logger" | "repository" | "service" | "controller"
    >();
    expectTypeOf<DependantsOfRecursive<typeof graph, "repository">>().toEqualTypeOf<
      "service" | "controller"
    >();
    expectTypeOf<DependantsOfRecursive<typeof graph, "controller">>().toEqualTypeOf<never>();
  });

  it("finds transitive dependants beyond four levels", () => {
    expectTypeOf<DependantsOfRecursive<typeof deepGraph, "level0">>().toEqualTypeOf<
      "level1" | "level2" | "level3" | "level4" | "level5" | "level6"
    >();
  });

  it("stops at already-seen keys in a cycle", () => {
    const cyclicGraph = {
      a: ["c"],
      b: ["a"],
      c: ["b"],
    } as const satisfies DependencyGraph<Record<"a" | "b" | "c", unknown>>;

    expectTypeOf<DependantsOfRecursive<typeof cyclicGraph, "a">>().toEqualTypeOf<"b" | "c">();
  });

  it("excludes self and transitive dependants from valid dependencies", () => {
    type AllowedDependencies = DependenciesOf<typeof graph, keyof Definition>;

    expectTypeOf<AllowedDependencies["config"]>().toEqualTypeOf<readonly never[]>();
    expectTypeOf<AllowedDependencies["repository"]>().toEqualTypeOf<
      readonly ("config" | "logger")[]
    >();
    expectTypeOf<AllowedDependencies["controller"]>().toEqualTypeOf<
      readonly ("config" | "logger" | "repository" | "service")[]
    >();
  });
});

describe("container value and factory types", () => {
  it("types a factory from the selected key and its dependencies", () => {
    type RepositoryFactory = Factory<Definition, typeof graph, "repository">;

    expectTypeOf<RepositoryFactory>().toEqualTypeOf<
      (
        dependencies: Pick<Definition, "config" | "logger">,
      ) => Definition["repository"] | Promise<Definition["repository"]>
    >();
  });

  it("selects values and factories by key", () => {
    type SelectedValues = PartialValues<Definition, "config" | "service">;
    type SelectedFactories = PartialFactories<Definition, typeof graph, "repository" | "service">;

    expectTypeOf<keyof SelectedValues>().toEqualTypeOf<"config" | "service">();
    expectTypeOf<SelectedValues["config"]>().toEqualTypeOf<string>();
    expectTypeOf<SelectedValues["service"]>().toEqualTypeOf<Definition["service"]>();
    expectTypeOf<keyof SelectedFactories>().toEqualTypeOf<"repository" | "service">();
    expectTypeOf<SelectedFactories["repository"]>().toEqualTypeOf<
      Factory<Definition, typeof graph, "repository">
    >();
    expectTypeOf<SelectedFactories["service"]>().toEqualTypeOf<
      Factory<Definition, typeof graph, "service">
    >();
  });

  it("selects graph entries that do not require dependencies", () => {
    expectTypeOf<ValueOf<Definition, typeof graph>>().toEqualTypeOf<Pick<Definition, "config">>();
  });
});
