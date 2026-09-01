import { bench, describe } from "vite-plus/test";
import { resolve } from "./resolve.ts";
import {
  BENCH_SIZES,
  createDeterministicFixture,
  createHandcraftedFixture,
  type BenchDefinition,
  type BenchDependencies,
  type BenchFactories,
  type BenchFixture,
} from "./test-utility/index.ts";

const resolveDynamic = resolve as unknown as (
  dependencies: BenchDependencies,
  factories: BenchFactories,
  values: BenchDefinition,
) => Promise<BenchDefinition>;

async function resolveFixture({ dependencies, factories }: BenchFixture): Promise<BenchDefinition> {
  return resolveDynamic(dependencies, factories, { node0: 0 });
}

const independent = createHandcraftedFixture(1_000, () => ["node0"]);
const orderedChain = createHandcraftedFixture(1_000, (index) => [`node${index - 1}`]);
const reverseChain = createHandcraftedFixture(1_000, (index) => [`node${index - 1}`], true);
const reverseDense = createHandcraftedFixture(
  200,
  (index) => Array.from({ length: index }, (_, dependency) => `node${dependency}`),
  true,
);

describe("resolve", () => {
  bench("1,000 independent nodes", async () => {
    await resolveFixture(independent);
  });

  bench("1,000-node chain in scan order", async () => {
    await resolveFixture(orderedChain);
  });

  bench("1,000-node chain in reverse scan order (quadratic)", async () => {
    await resolveFixture(reverseChain);
  });

  bench("200-node dense DAG in reverse scan order (cubic)", async () => {
    await resolveFixture(reverseDense);
  });

  for (const size of BENCH_SIZES) {
    const ordered = createDeterministicFixture(size, false);
    const reverse = createDeterministicFixture(size, true);

    bench(`${size} deterministic nodes in dependency order`, async () => {
      await resolveFixture(ordered);
    });

    bench(`${size} deterministic nodes in reverse order`, async () => {
      await resolveFixture(reverse);
    });
  }
});
