import type { DependenciesOf, Factory, PartialFactories, PartialValues } from "./type.ts";

export async function resolve<
  T extends Record<PropertyKey, unknown>,
  D extends DependenciesOf<D, keyof T>,
  FactoryKeys extends keyof D,
  ValueKeys extends keyof D = never,
>(
  dependencies: D,
  factories: PartialFactories<T, D, FactoryKeys>,
  values: PartialValues<T, D, ValueKeys>,
): Promise<T> {
  const result = values as T;
  const resolved = new Set<keyof T>(Reflect.ownKeys(values) as (keyof T)[]);
  const keys = Reflect.ownKeys(dependencies) as (keyof D)[];

  while (resolved.size < keys.length) {
    const previousSize = resolved.size;

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

    if (resolved.size === previousSize) {
      throw new Error("Circular dependency");
    }
  }

  return result;
}
