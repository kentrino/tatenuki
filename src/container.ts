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
  private readonly registeredFactories: PartialFactories<T, D, FactoryKeys>;
  private readonly pending = new Map<PropertyKey, Promise<unknown>>();
  readonly resolved: Partial<T>;

  constructor(
    dependencies: D,
    factories: PartialFactories<T, D, FactoryKeys>,
    values: PartialValues<T, D, ValueKeys>,
    overrides: Partial<T>,
  ) {
    this.dependencies = dependencies;
    this.registeredFactories = factories;
    this.resolved = { ...values, ...overrides } as Partial<T>;
  }

  async get<K extends keyof T>(key: K): Promise<T[K]> {
    return get(
      this.dependencies,
      this.resolved,
      this.registeredFactories as unknown as Partial<Record<keyof T, (dependencies: T) => unknown>>,
      key,
      this.pending,
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
  private readonly registeredFactories: PartialFactories<T, D, FactoryKeys>;
  private readonly values: PartialValues<T, D, ValueKeys>;
  private readonly overrides: Partial<T>;

  constructor(
    dependencies: D,
    factories: PartialFactories<T, D, FactoryKeys> = {} as PartialFactories<T, D, FactoryKeys>,
    values: PartialValues<T, D, ValueKeys> = {} as PartialValues<T, D, ValueKeys>,
    overrides: Partial<T> = {},
  ) {
    this.dependencies = dependencies;
    this.registeredFactories = factories;
    this.values = values;
    this.overrides = overrides;
  }

  factory<NewFactoryKeys extends keyof D>(
    factories: PartialFactories<T, D, NewFactoryKeys>,
  ): Container<T, D, FactoryKeys | NewFactoryKeys, ValueKeys> {
    return new Container<T, D, FactoryKeys | NewFactoryKeys, ValueKeys>(
      this.dependencies,
      {
        ...this.registeredFactories,
        ...factories,
      } as PartialFactories<T, D, FactoryKeys | NewFactoryKeys>,
      this.values,
      this.overrides,
    );
  }

  factories<NewFactoryKeys extends keyof D>(
    factories: PartialFactories<T, D, NewFactoryKeys>,
  ): Container<T, D, FactoryKeys | NewFactoryKeys, ValueKeys> {
    return this.factory(factories);
  }

  override(overrides: Partial<T>): Container<T, D, FactoryKeys, ValueKeys> {
    return new Container(this.dependencies, this.registeredFactories, this.values, {
      ...this.overrides,
      ...overrides,
    });
  }

  value(
    values: PartialValues<T, D, Exclude<keyof D, FactoryKeys>>,
  ): FullyDefinedContainer<T, D, FactoryKeys, Exclude<keyof D, FactoryKeys>> {
    return new FullyDefinedContainer(
      this.dependencies,
      this.registeredFactories,
      values,
      this.overrides,
    );
  }

  build(
    values: PartialValues<T, D, Exclude<keyof D, FactoryKeys>>,
  ): FullyDefinedContainer<T, D, FactoryKeys, Exclude<keyof D, FactoryKeys>> {
    return this.value(values);
  }

  async resolve(values: PartialValues<T, D, Exclude<keyof D, FactoryKeys>>): Promise<T> {
    const valuesWithOverrides = {
      ...values,
      ...this.overrides,
    } as PartialValues<T, D, Exclude<keyof D, FactoryKeys>>;
    return resolve<T, D, FactoryKeys, Exclude<keyof D, FactoryKeys>>(
      this.dependencies,
      this.registeredFactories,
      valuesWithOverrides,
    );
  }
}

export function defineContainer<T extends Record<PropertyKey, unknown>>() {
  return {
    graph<const D extends DependenciesOf<D, keyof T>>(dependencies: D): Container<T, D> {
      return new Container<T, D>(dependencies);
    },
  };
}

export function inject<Input, Output>(
  constructor: new (dependencies: Input) => Output,
): (dependencies: Input) => Output;
export function inject<Input, Arguments extends unknown[], Output>(
  fn: (dependencies: Input, ...arguments_: Arguments) => Output,
): (dependencies: Input) => (...arguments_: Arguments) => Output;
export function inject(target: unknown): unknown {
  return (dependencies: unknown) => {
    if (/^class\s/.test(Function.prototype.toString.call(target))) {
      const Constructor = target as new (dependencies: unknown) => unknown;
      return new Constructor(dependencies);
    }

    const fn = target as (dependencies: unknown, ...arguments_: unknown[]) => unknown;
    return (...arguments_: unknown[]) => fn(dependencies, ...arguments_);
  };
}
