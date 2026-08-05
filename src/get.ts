type UnknownObject = Record<PropertyKey, unknown>;
type UnknownFactory<T extends UnknownObject> = (dependencies: T) => unknown;

export async function get<T extends UnknownObject, K extends keyof T>(
  graph: Record<PropertyKey, readonly PropertyKey[]>,
  resolved: Partial<T>,
  factories: Partial<Record<keyof T, UnknownFactory<T>>>,
  key: K,
  pending = new Map<PropertyKey, Promise<unknown>>(),
): Promise<T[K]> {
  if (Object.hasOwn(resolved, key)) {
    return resolved[key] as T[K];
  }

  const visiting = new Set<PropertyKey>();
  const visited = new Set<PropertyKey>();

  const initialize = async (dependencyKey: keyof T): Promise<void> => {
    if (Object.hasOwn(resolved, dependencyKey)) {
      return;
    }

    const pendingValue = pending.get(dependencyKey);
    if (pendingValue) {
      resolved[dependencyKey] = (await pendingValue) as T[typeof dependencyKey];
      return;
    }

    const factory = factories[dependencyKey];
    if (!factory) {
      throw new Error(`No factory for ${String(dependencyKey)}`);
    }

    const factoryResult = Promise.resolve(factory(resolved as T));
    pending.set(dependencyKey, factoryResult);
    try {
      resolved[dependencyKey] = (await factoryResult) as T[typeof dependencyKey];
    } finally {
      pending.delete(dependencyKey);
    }
  };

  const visit = async (dependencyKey: PropertyKey): Promise<boolean> => {
    visiting.add(dependencyKey);

    const dependencies = graph[dependencyKey];
    if (dependencies === undefined) {
      throw new Error(`No factory for ${String(dependencyKey)}`);
    }

    for (const next of dependencies) {
      if (!visiting.has(next) && !visited.has(next)) {
        if (await visit(next)) {
          return true;
        }
      } else if (visiting.has(next)) {
        return true;
      }
    }

    visiting.delete(dependencyKey);
    visited.add(dependencyKey);
    await initialize(dependencyKey as keyof T);
    return false;
  };

  if (await visit(key)) {
    throw new Error("Circular dependency");
  }

  return resolved[key] as T[K];
}
