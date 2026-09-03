import { createGetPlan, getWithPlan } from "./get.ts";
import { resolve } from "./resolve.ts";
import type { DependenciesOf, PartialFactories, PartialValues } from "./type.ts";

type DisposableValue = {
  [Symbol.asyncDispose]?: () => PromiseLike<void>;
  [Symbol.dispose]?: () => void;
};

type GetPlanEntry = {
  readonly resolvedKeys: readonly PropertyKey[];
  readonly plan: readonly PropertyKey[];
};

type GetPlanCache = Map<PropertyKey, GetPlanEntry[]>;

const KNOWN_VALUE_ARRAY_LIMIT = 8;

function snapshotDependencies<D extends Record<PropertyKey, readonly PropertyKey[]>>(
  dependencies: D,
): D {
  const snapshot = Object.create(null) as Record<PropertyKey, readonly PropertyKey[]>;
  for (const key of Reflect.ownKeys(dependencies)) {
    snapshot[key] = Object.freeze([...dependencies[key]]);
  }
  return Object.freeze(snapshot) as D;
}

function hasSameKeys(left: readonly PropertyKey[], right: readonly PropertyKey[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function isDisposable(value: unknown): value is DisposableValue {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    (Symbol.asyncDispose in value || Symbol.dispose in value)
  );
}

class FullyDefinedContainer<
  T extends Record<PropertyKey, unknown>,
  D extends DependenciesOf<D, keyof T>,
  FactoryKeys extends keyof D = never,
  ValueKeys extends keyof D = never,
> {
  private readonly dependencies: D;
  private readonly registeredFactories: PartialFactories<T, D, FactoryKeys>;
  private readonly pending = new Map<PropertyKey, Promise<unknown>>();
  private known: unknown[] | Set<unknown>;
  private owned: DisposableValue[] | undefined;
  private readonly inflight = new Set<Promise<unknown>>();
  private readonly planCache: GetPlanCache;
  private readonly initialResolvedKeys: readonly PropertyKey[];
  private hasFactoryResult = false;
  private disposePromise: Promise<void> | undefined;
  readonly resolved: Partial<T>;

  constructor(
    dependencies: D,
    factories: PartialFactories<T, D, FactoryKeys>,
    values: PartialValues<T, ValueKeys>,
    overrides: Partial<T>,
    planCache: GetPlanCache,
  ) {
    this.dependencies = dependencies;
    this.registeredFactories = factories;
    this.resolved = { ...values, ...overrides } as Partial<T>;
    this.planCache = planCache;
    this.initialResolvedKeys = Reflect.ownKeys(this.resolved);
    this.known = this.initialResolvedKeys.map((key) => this.resolved[key as keyof T]);
  }

  async get<K extends keyof T>(key: K): Promise<T[K]> {
    if (this.disposePromise) {
      throw new Error("Container is disposed");
    }

    if (Object.hasOwn(this.resolved, key)) {
      return this.resolved[key] as T[K];
    }

    const promise = getWithPlan(
      this.resolved,
      this.registeredFactories as unknown as Partial<Record<keyof T, (dependencies: T) => unknown>>,
      key,
      this.getPlan(key),
      this.pending,
      (value) => this.onFactoryResult(value),
    );
    this.inflight.add(promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(promise);
    }
  }

  dispose(): Promise<void> {
    this.disposePromise ??= this.disposeAll();
    return this.disposePromise;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  private getPlan(key: PropertyKey): readonly PropertyKey[] {
    if (!this.hasFactoryResult) {
      const entries = this.planCache.get(key);
      const cached = entries?.find(({ resolvedKeys }) =>
        hasSameKeys(resolvedKeys, this.initialResolvedKeys),
      );
      if (cached) {
        return cached.plan;
      }

      const plan = createGetPlan(this.dependencies, this.resolved, key);
      const entry = { resolvedKeys: this.initialResolvedKeys, plan };
      if (entries) {
        entries.push(entry);
      } else {
        this.planCache.set(key, [entry]);
      }
      return plan;
    }

    return createGetPlan(this.dependencies, this.resolved, key);
  }

  private onFactoryResult(value: unknown): void {
    this.hasFactoryResult = true;
    if (!this.addKnownValue(value)) {
      return;
    }

    if (isDisposable(value)) {
      (this.owned ??= []).push(value);
    }
  }

  private addKnownValue(value: unknown): boolean {
    if (Array.isArray(this.known)) {
      if (this.known.includes(value)) {
        return false;
      }

      if (this.known.length < KNOWN_VALUE_ARRAY_LIMIT) {
        this.known.push(value);
        return true;
      }

      this.known = new Set(this.known);
    }

    if (this.known.has(value)) {
      return false;
    }

    this.known.add(value);
    return true;
  }

  private async disposeAll(): Promise<void> {
    await Promise.allSettled(this.inflight);

    if (!this.owned) {
      return;
    }

    const errors: unknown[] = [];
    for (const value of this.owned.toReversed()) {
      try {
        const asyncDispose = value[Symbol.asyncDispose];
        if (asyncDispose) {
          await asyncDispose.call(value);
        } else {
          value[Symbol.dispose]?.();
        }
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to dispose container resources");
    }
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
  private readonly values: PartialValues<T, ValueKeys>;
  private readonly overrides: Partial<T>;
  private readonly planCache = new Map<PropertyKey, GetPlanEntry[]>();

  constructor(
    dependencies: D,
    factories: PartialFactories<T, D, FactoryKeys> = {} as PartialFactories<T, D, FactoryKeys>,
    values: PartialValues<T, ValueKeys> = {} as PartialValues<T, ValueKeys>,
    overrides: Partial<T> = {},
  ) {
    this.dependencies = snapshotDependencies(dependencies);
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
    values: PartialValues<T, Exclude<keyof D, FactoryKeys>>,
  ): FullyDefinedContainer<T, D, FactoryKeys, Exclude<keyof D, FactoryKeys>> {
    return new FullyDefinedContainer(
      this.dependencies,
      this.registeredFactories,
      values,
      this.overrides,
      this.planCache,
    );
  }

  build(
    values: PartialValues<T, Exclude<keyof D, FactoryKeys>>,
  ): FullyDefinedContainer<T, D, FactoryKeys, Exclude<keyof D, FactoryKeys>> {
    return this.value(values);
  }

  async resolve(values: PartialValues<T, Exclude<keyof D, FactoryKeys>>): Promise<T> {
    const valuesWithOverrides = {
      ...values,
      ...this.overrides,
    } as PartialValues<T, Exclude<keyof D, FactoryKeys>>;
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
    if (/^class(?:\s|\{)/.test(Function.prototype.toString.call(target))) {
      const Constructor = target as new (dependencies: unknown) => unknown;
      return new Constructor(dependencies);
    }

    const fn = target as (dependencies: unknown, ...arguments_: unknown[]) => unknown;
    return (...arguments_: unknown[]) => fn(dependencies, ...arguments_);
  };
}

export function alias<K extends PropertyKey>(key: K) {
  return <T extends Record<K, unknown>>(dependencies: T): T[K] => dependencies[key];
}
