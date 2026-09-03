type UnknownObject = Record<PropertyKey, unknown>;
type UnknownFactory<T extends UnknownObject> = (dependencies: T) => unknown;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

export function createGetPlan<K extends PropertyKey>(
  graph: Record<PropertyKey, readonly PropertyKey[]>,
  resolved: UnknownObject,
  key: K,
): readonly PropertyKey[] {
  const visiting = new Set<PropertyKey>();
  const visited = new Set<PropertyKey>();

  const visit = (dependencyKey: PropertyKey): boolean => {
    if (Object.hasOwn(resolved, dependencyKey)) {
      return false;
    }

    visiting.add(dependencyKey);

    const dependencies = Object.hasOwn(graph, dependencyKey) ? graph[dependencyKey] : undefined;
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

  return [...visited];
}

async function getFromPlan<T extends UnknownObject, K extends keyof T>(
  resolved: Partial<T>,
  factories: Partial<Record<keyof T, UnknownFactory<T>>>,
  key: K,
  plan: readonly PropertyKey[],
  pending?: Map<PropertyKey, Promise<unknown>>,
  onFactoryResult?: (value: unknown) => void,
): Promise<T[K]> {
  let pendingMap = pending;

  for (const dependencyKey of plan) {
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
        const value = await pendingResult;
        onFactoryResult?.(value);
        resolved[dependencyKey as keyof T] = value as T[keyof T];
      } finally {
        pendingMap.delete(dependencyKey);
      }
    } else {
      onFactoryResult?.(factoryResult);
      resolved[dependencyKey as keyof T] = factoryResult as T[keyof T];
    }
  }

  return resolved[key] as T[K];
}

export async function get<T extends UnknownObject, K extends keyof T>(
  graph: Record<PropertyKey, readonly PropertyKey[]>,
  resolved: Partial<T>,
  factories: Partial<Record<keyof T, UnknownFactory<T>>>,
  key: K,
  pending?: Map<PropertyKey, Promise<unknown>>,
  onFactoryResult?: (value: unknown) => void,
): Promise<T[K]> {
  if (Object.hasOwn(resolved, key)) {
    return resolved[key] as T[K];
  }

  const plan = createGetPlan(graph, resolved, key);
  return getFromPlan(resolved, factories, key, plan, pending, onFactoryResult);
}

export async function getWithPlan<T extends UnknownObject, K extends keyof T>(
  resolved: Partial<T>,
  factories: Partial<Record<keyof T, UnknownFactory<T>>>,
  key: K,
  plan: readonly PropertyKey[],
  pending?: Map<PropertyKey, Promise<unknown>>,
  onFactoryResult?: (value: unknown) => void,
): Promise<T[K]> {
  if (Object.hasOwn(resolved, key)) {
    return resolved[key] as T[K];
  }

  return getFromPlan(resolved, factories, key, plan, pending, onFactoryResult);
}
