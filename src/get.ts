type UnknownObject = Record<PropertyKey, unknown>;
type UnknownFactory<T extends UnknownObject> = (dependencies: T) => unknown;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

export async function get<T extends UnknownObject, K extends keyof T>(
  graph: Record<PropertyKey, readonly PropertyKey[]>,
  resolved: Partial<T>,
  factories: Partial<Record<keyof T, UnknownFactory<T>>>,
  key: K,
  pending?: Map<PropertyKey, Promise<unknown>>,
): Promise<T[K]> {
  if (Object.hasOwn(resolved, key)) {
    return resolved[key] as T[K];
  }

  const visiting = new Set<PropertyKey>();
  const visited = new Set<PropertyKey>();
  let pendingMap = pending;

  const visit = (dependencyKey: PropertyKey): boolean => {
    visiting.add(dependencyKey);

    const dependencies = graph[dependencyKey];
    if (dependencies === undefined) {
      throw new Error(`No factory for ${String(dependencyKey)}`);
    }

    for (const next of dependencies) {
      if (!visiting.has(next) && !visited.has(next)) {
        if (visit(next)) {
          return true;
        }
      } else if (visiting.has(next)) {
        return true;
      }
    }

    visiting.delete(dependencyKey);
    visited.add(dependencyKey);
    return false;
  };

  if (visit(key)) {
    throw new Error("Circular dependency");
  }

  for (const dependencyKey of visited) {
    if (Object.hasOwn(resolved, dependencyKey)) {
      continue;
    }

    const pendingValue = pendingMap?.get(dependencyKey);
    if (pendingValue) {
      resolved[dependencyKey as keyof T] = (await pendingValue) as T[keyof T];
      continue;
    }

    const factory = factories[dependencyKey as keyof T];
    if (!factory) {
      throw new Error(`No factory for ${String(dependencyKey)}`);
    }

    const factoryResult = factory(resolved as T);
    if (isThenable(factoryResult)) {
      const pendingResult = Promise.resolve(factoryResult);
      pendingMap ??= new Map();
      pendingMap.set(dependencyKey, pendingResult);
      try {
        resolved[dependencyKey as keyof T] = (await pendingResult) as T[keyof T];
      } finally {
        pendingMap.delete(dependencyKey);
      }
    } else {
      resolved[dependencyKey as keyof T] = factoryResult as T[keyof T];
    }
  }

  return resolved[key] as T[K];
}
