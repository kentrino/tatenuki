import { afterAll, beforeAll, bench, describe, expect } from "vite-plus/test";
import { defineContainer } from "../../../packages/tatenuki/src/index.ts";

const INITIAL_VALUE_COUNT = 1_000;
const INITIAL_KEYS = Array.from({ length: INITIAL_VALUE_COUNT }, (_, index) => `value${index}`);
const FIRST_KEY = INITIAL_KEYS[0] as string;
const SECOND_KEY = INITIAL_KEYS[1] as string;
const DERIVED_KEY = "derived";

type Definition = Record<string, number>;
type Factory = (dependencies: Definition) => number;
type DynamicTatenukiContainer = {
  get(key: string): Promise<number>;
};
type DynamicTatenukiBuilder = {
  factory(factories: Record<string, Factory>): DynamicTatenukiBuilder;
  build(values: Record<string, number>): DynamicTatenukiContainer;
};
type DynamicTatenukiDefinition = {
  graph(graph: Record<string, readonly string[]>): DynamicTatenukiBuilder;
};

const graph: Record<string, readonly string[]> = Object.fromEntries(
  INITIAL_KEYS.map((key) => [key, []]),
);
graph[DERIVED_KEY] = [FIRST_KEY, SECOND_KEY];

const initialValues = Object.fromEntries(INITIAL_KEYS.map((key, index) => [key, index])) as Record<
  string,
  number
>;

function createTatenukiBuilder(): DynamicTatenukiBuilder {
  const definition = defineContainer<Definition>() as unknown as DynamicTatenukiDefinition;
  return definition.graph(graph).factory({
    [DERIVED_KEY]: (dependencies) => dependencies[FIRST_KEY] + dependencies[SECOND_KEY],
  });
}

const tatenukiBuilder = createTatenukiBuilder();

let _sink: unknown;

beforeAll(async () => {
  const container = tatenukiBuilder.build(initialValues);

  expect(await container.get(FIRST_KEY)).toBe(0);
  expect(await container.get(DERIVED_KEY)).toBe(1);
});

afterAll(() => {
  expect(_sink).toBeDefined();
});

describe(`${INITIAL_VALUE_COUNT.toLocaleString()} initial values, fresh container construction`, () => {
  bench("tatenuki (build)", () => {
    _sink = tatenukiBuilder.build(initialValues);
  });
});
