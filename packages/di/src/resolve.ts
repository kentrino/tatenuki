import type { DependenciesOf, Factory, PartialFactories, PartialValues } from "./type.ts";

export async function resolve<
  T extends Record<PropertyKey, unknown>,
  D extends DependenciesOf<D, keyof T>,
  FactoryKeys extends keyof D,
  ValueKeys extends keyof D = never,
>(
  dependencies: D,
  factories: PartialFactories<T, D, FactoryKeys>,
  values: PartialValues<T, ValueKeys>,
): Promise<T> {
  const result = values as T;
  const resolved = new Set<keyof T>(Reflect.ownKeys(values) as (keyof T)[]);
  const keys = Reflect.ownKeys(dependencies) as (keyof D)[];
  if (resolved.size >= keys.length) {
    return result;
  }

  const initialSize = resolved.size;
  for (const key of keys) {
    if (resolved.has(key as keyof T)) {
      continue;
    }

    if (dependencies[key].every((dependency) => resolved.has(dependency))) {
      const factory: Factory<T, D, FactoryKeys> | undefined = factories[key as FactoryKeys];
      if (!factory) {
        throw new Error(`Factory for \`${String(key)}\` not found`);
      }
      result[key as keyof T] = await factory(result);
      resolved.add(key as keyof T);
    }
  }

  if (resolved.size >= keys.length) {
    return result;
  }
  if (resolved.size === initialSize) {
    throw new Error("Circular dependency");
  }

  const remaining = new Int32Array(keys.length);
  remaining.fill(-1);
  const dependents = new Map<keyof T, number[]>();
  let ready: number[] = [];

  const push = (heap: number[], index: number): void => {
    let position = heap.length;
    heap.push(index);
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (heap[parent] <= index) {
        break;
      }
      heap[position] = heap[parent];
      position = parent;
    }
    heap[position] = index;
  };

  const pop = (heap: number[]): number => {
    const first = heap[0];
    const last = heap.pop()!;
    if (heap.length === 0) {
      return first;
    }

    let position = 0;
    while (true) {
      const left = position * 2 + 1;
      if (left >= heap.length) {
        break;
      }
      const right = left + 1;
      const child = right < heap.length && heap[right] < heap[left] ? right : left;
      if (heap[child] >= last) {
        break;
      }
      heap[position] = heap[child];
      position = child;
    }
    heap[position] = last;
    return first;
  };

  const initialize = async (index: number): Promise<void> => {
    const key = keys[index];
    const factory: Factory<T, D, FactoryKeys> | undefined = factories[key as FactoryKeys];
    if (!factory) {
      throw new Error(`Factory for \`${String(key)}\` not found`);
    }
    result[key as keyof T] = await factory(result);
    resolved.add(key as keyof T);
  };

  const notifyDependents = (key: keyof T, currentIndex: number, next: number[]): void => {
    for (const dependent of dependents.get(key) ?? []) {
      remaining[dependent] -= 1;
      if (remaining[dependent] === 0) {
        push(dependent > currentIndex ? ready : next, dependent);
      }
    }
  };

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (resolved.has(key as keyof T)) {
      continue;
    }

    let count = 0;
    for (const dependency of dependencies[key]) {
      if (resolved.has(dependency)) {
        continue;
      }
      count += 1;
      const dependencyDependents = dependents.get(dependency);
      if (dependencyDependents) {
        dependencyDependents.push(index);
      } else {
        dependents.set(dependency, [index]);
      }
    }
    remaining[index] = count;
    if (count === 0) {
      push(ready, index);
    }
  }

  while (resolved.size < keys.length) {
    if (ready.length === 0) {
      throw new Error("Circular dependency");
    }

    const deferred: number[] = [];
    while (ready.length > 0) {
      const index = pop(ready);
      const key = keys[index];
      await initialize(index);
      notifyDependents(key as keyof T, index, deferred);
    }
    ready = deferred;
  }

  return result;
}
