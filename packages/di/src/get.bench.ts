import { bench, describe } from "vite-plus/test";
import { get } from "./get.ts";
import {
  BENCH_SIZES,
  createDeterministicFixture,
  createHandcraftedFixture,
  type BenchDefinition,
  type BenchDependencies,
  type BenchFactories,
  type BenchFixture,
} from "./test-utility/index.ts";

const getDynamic = get as unknown as (
  graph: BenchDependencies,
  resolved: Partial<BenchDefinition>,
  factories: Partial<BenchFactories>,
  key: string,
) => Promise<number>;

async function getFixture({ dependencies, factories, leaf }: BenchFixture): Promise<number> {
  return getDynamic(dependencies, { node0: 0 }, factories, leaf);
}

const independent = createHandcraftedFixture(1_000, () => ["node0"]);
const chain = createHandcraftedFixture(1_000, (index) => [`node${index - 1}`]);
const dense = createHandcraftedFixture(200, (index) =>
  Array.from({ length: index }, (_, dependency) => `node${dependency}`),
);
const wideFanIn = createHandcraftedFixture(1_000, (index) =>
  index === 999 ? Array.from({ length: 999 }, (_, dependency) => `node${dependency}`) : ["node0"],
);

describe("get", () => {
  bench("1,000 independent nodes (get leaf)", async () => {
    await getFixture(independent);
  });

  bench("1,000-node chain (get leaf)", async () => {
    await getFixture(chain);
  });

  bench("200-node dense DAG (get leaf)", async () => {
    await getFixture(dense);
  });

  bench("1,000-node wide fan-in (get leaf)", async () => {
    await getFixture(wideFanIn);
  });

  for (const size of BENCH_SIZES) {
    const fixture = createDeterministicFixture(size);

    bench(`${size} deterministic nodes (get leaf)`, async () => {
      await getFixture(fixture);
    });
  }
});
