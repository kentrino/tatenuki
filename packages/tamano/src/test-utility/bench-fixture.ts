// @ts-expect-error -- This Node-only helper does not add Node types to the browser-agnostic package.
import { createHash } from "node:crypto";

export type BenchDefinition = Record<string, number>;
export type BenchDependencies = Record<string, readonly string[]>;
export type BenchFactories = Record<string, () => number>;

export type BenchFixture = {
  dependencies: BenchDependencies;
  factories: BenchFactories;
  leaf: string;
};

export const BENCH_SIZES = [100, 300, 1_000] as const;

const DEPENDENCY_RATIO_SEED = "taskdown:di-bench:dependency-ratio:v1";
const DEPENDENCY_EDGE_SEED = "taskdown:di-bench:dependency-edge:v1";

function sha1Mod(value: string, modulus: number): number {
  return createHash("sha1").update(value).digest().readUInt32BE() % modulus;
}

export function createHandcraftedFixture(
  size: number,
  dependenciesOf: (index: number) => readonly string[],
  reverse = false,
): BenchFixture {
  const dependencies: BenchDependencies = {};
  const factories: BenchFactories = {};
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

  return { dependencies, factories, leaf: `node${size - 1}` };
}

export function createDeterministicFixture(size: number, reverse = false): BenchFixture {
  const dependencies: BenchDependencies = {};
  const factories: BenchFactories = {};
  const generatedDependencies: BenchDependencies = { node0: [] };

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

  return { dependencies, factories, leaf: `node${size - 1}` };
}
