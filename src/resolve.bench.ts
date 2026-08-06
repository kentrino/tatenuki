// @ts-expect-error -- This Node-only bench does not add Node types to the browser-agnostic package.
import { createHash } from "node:crypto";
import { bench, describe } from "vite-plus/test";
import { resolve } from "./resolve.ts";

type Definition = Record<string, number>;
type Dependencies = Record<string, readonly string[]>;
type Factories = Record<string, () => number>;

type Fixture = {
  dependencies: Dependencies;
  factories: Factories;
};

const resolveDynamic = resolve as unknown as (
  dependencies: Dependencies,
  factories: Factories,
  values: Definition,
) => Promise<Definition>;

const DEPENDENCY_RATIO_SEED = "taskdown:resolve-bench:dependency-ratio:v1";
const DEPENDENCY_EDGE_SEED = "taskdown:resolve-bench:dependency-edge:v1";

function sha1Mod(value: string, modulus: number): number {
  return createHash("sha1").update(value).digest().readUInt32BE() % modulus;
}

function createHandcraftedFixture(
  size: number,
  dependenciesOf: (index: number) => readonly string[],
  reverse = false,
): Fixture {
  const dependencies: Dependencies = {};
  const factories: Factories = {};
  const indices = Array.from({ length: size }, (_, index) => index);

  if (reverse) {
    indices.reverse();
  }

  for (const index of indices) {
    const nodeKey = `node${index}`;
    dependencies[nodeKey] = index === 0 ? [] : dependenciesOf(index);
    if (index > 0) {
      factories[nodeKey] = () => index;
    }
  }

  return { dependencies, factories };
}

function createDeterministicFixture(size: number, reverse: boolean): Fixture {
  const dependencies: Dependencies = {};
  const factories: Factories = {};
  const generatedDependencies: Dependencies = { node0: [] };

  for (let nodeIndex = 1; nodeIndex < size; nodeIndex += 1) {
    const nodeKey = `node${nodeIndex}`;
    const dependencyRatioUnits = sha1Mod(`${nodeKey}\0${DEPENDENCY_RATIO_SEED}`, size + 1);
    const nodeDependencies: string[] = [];

    // Only earlier nodes are candidates, so the generated graph is always acyclic.
    for (let dependencyIndex = 0; dependencyIndex < nodeIndex; dependencyIndex += 1) {
      const dependencyKey = `node${dependencyIndex}`;
      const edgeHash = sha1Mod(`${nodeKey}\0${dependencyKey}\0${DEPENDENCY_EDGE_SEED}`, size);

      // dependencyRatioUnits / size is this node's deterministic dependency ratio.
      if (edgeHash < dependencyRatioUnits) {
        nodeDependencies.push(dependencyKey);
      }
    }

    generatedDependencies[nodeKey] = nodeDependencies;
    factories[nodeKey] = () => nodeIndex;
  }

  const indices = Array.from({ length: size }, (_, index) => index);
  if (reverse) {
    indices.reverse();
  }
  for (const index of indices) {
    const nodeKey = `node${index}`;
    dependencies[nodeKey] = generatedDependencies[nodeKey];
  }

  return { dependencies, factories };
}

async function resolveFixture({ dependencies, factories }: Fixture): Promise<Definition> {
  return resolveDynamic(dependencies, factories, { node0: 0 });
}

const sizes = [100, 300, 1_000];
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

  for (const size of sizes) {
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
