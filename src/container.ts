import { get } from "./get.ts";
import { resolve } from "./resolve.ts";
import type { DependenciesOf, PartialFactories, PartialValues } from "./type.ts";

class FullyDefinedContainer<
  T extends Record<PropertyKey, unknown>,
  D extends DependenciesOf<D, keyof T>,
  FactoryKeys extends keyof D = never,
  ValueKeys extends keyof D = never,
> {
  private readonly dependencies: D;
  private readonly factories: PartialFactories<T, D, FactoryKeys>;
  readonly resolved: Partial<T>;

  constructor(
    dependencies: D,
    factories: PartialFactories<T, D, FactoryKeys>,
    values: PartialValues<T, D, ValueKeys>,
  ) {
    this.dependencies = dependencies;
    this.factories = factories;
    this.resolved = values as Partial<T>;
  }

  async get<K extends keyof T>(key: K): Promise<T[K]> {
    return get(
      this.dependencies,
      this.resolved,
      this.factories as unknown as Partial<Record<keyof T, (dependencies: T) => unknown>>,
      key,
    );
  }
}

export class Container<
  T extends Record<PropertyKey, unknown>,
  D extends DependenciesOf<D, keyof T>,
  FactoryKeys extends keyof D = never,
  ValueKeys extends keyof D = never,
> {
  private readonly dependencies: D;
  private readonly factories: PartialFactories<T, D, FactoryKeys>;
  private readonly values: PartialValues<T, D, ValueKeys>;

  constructor(
    dependencies: D,
    factories: PartialFactories<T, D, FactoryKeys> = {} as PartialFactories<T, D, FactoryKeys>,
    values: PartialValues<T, D, ValueKeys> = {} as PartialValues<T, D, ValueKeys>,
  ) {
    this.dependencies = dependencies;
    this.factories = factories;
    this.values = values;
  }

  factory<NewFactoryKeys extends keyof D>(
    factories: PartialFactories<T, D, NewFactoryKeys>,
  ): Container<T, D, FactoryKeys | NewFactoryKeys, ValueKeys> {
    return new Container<T, D, FactoryKeys | NewFactoryKeys, ValueKeys>(
      this.dependencies,
      {
        ...this.factories,
        ...factories,
      } as PartialFactories<T, D, FactoryKeys | NewFactoryKeys>,
      this.values,
    );
  }

  value(
    values: PartialValues<T, D, Exclude<keyof D, FactoryKeys>>,
  ): FullyDefinedContainer<T, D, FactoryKeys, Exclude<keyof D, FactoryKeys>> {
    return new FullyDefinedContainer(this.dependencies, this.factories, values);
  }

  async resolve(values: PartialValues<T, D, Exclude<keyof D, FactoryKeys>>): Promise<T> {
    return resolve(this.dependencies, this.factories, values);
  }
}

export function inject<Input, Output>(
  constructor: new (dependencies: Input) => Output,
): (dependencies: Input) => Output {
  return (dependencies) => new constructor(dependencies);
}
