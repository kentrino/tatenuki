import { createGetPlan, createResolveAllPlan, getWithPlan, resolveWithPlan } from "./get.ts";
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

type ContainerLifecycle = {
  disposePromise: Promise<void> | undefined;
};

export interface ResolvedContainer<T extends Record<PropertyKey, unknown>> {
  get<K extends keyof T>(key: K): T[K];
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

const KNOWN_VALUE_ARRAY_LIMIT = 8;
const RESOLVE_ALL_PLAN_KEY = Symbol("resolveAll");
const dependencySnapshots = new WeakSet<object>();

function snapshotDependencies<D extends Record<PropertyKey, readonly PropertyKey[]>>(
  dependencies: D,
): D {
  if (dependencySnapshots.has(dependencies)) {
    return dependencies;
  }

  const snapshot = Object.create(null) as Record<PropertyKey, readonly PropertyKey[]>;
  for (const key of Reflect.ownKeys(dependencies)) {
    snapshot[key] = Object.freeze([...dependencies[key]]);
  }
  const frozenSnapshot = Object.freeze(snapshot) as D;
  dependencySnapshots.add(frozenSnapshot);
  return frozenSnapshot;
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

class ResolvedContainerImpl<
  T extends Record<PropertyKey, unknown>,
> implements ResolvedContainer<T> {
  private readonly values: T;
  private readonly lifecycle: ContainerLifecycle;
  private readonly disposeContainer: () => Promise<void>;

  constructor(values: T, lifecycle: ContainerLifecycle, disposeContainer: () => Promise<void>) {
    this.values = values;
    this.lifecycle = lifecycle;
    this.disposeContainer = disposeContainer;
  }

  get<K extends keyof T>(key: K): T[K] {
    if (this.lifecycle.disposePromise) {
      throw new Error("Container is disposed");
    }
    return this.values[key];
  }

  dispose(): Promise<void> {
    return this.disposeContainer();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }
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
  private known: unknown[] | Set<unknown> | undefined;
  private owned: DisposableValue[] | undefined;
  private inflight: Promise<unknown> | Set<Promise<unknown>> | undefined;
  private readonly planCache: GetPlanCache;
  private readonly initialResolvedKeys: readonly PropertyKey[];
  private initialResolvedForPlan: Partial<T> | undefined;
  private hasFactoryResult = false;
  private readonly lifecycle: ContainerLifecycle = { disposePromise: undefined };
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
  }

  async get<K extends keyof T>(key: K): Promise<T[K]> {
    if (this.lifecycle.disposePromise) {
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
      this.onFactoryResult,
    );
    this.trackInflight(promise);
    try {
      return await promise;
    } finally {
      this.untrackInflight(promise);
    }
  }

  async resolveAll(): Promise<ResolvedContainer<T>> {
    if (this.lifecycle.disposePromise) {
      throw new Error("Container is disposed");
    }

    const plan = this.getResolveAllPlan();
    if (plan.length > 0) {
      const promise = resolveWithPlan(
        this.resolved,
        this.registeredFactories as unknown as Partial<
          Record<keyof T, (dependencies: T) => unknown>
        >,
        plan,
        this.pending,
        this.onFactoryResult,
        () => {
          if (this.lifecycle.disposePromise) {
            throw new Error("Container is disposed");
          }
        },
      );
      this.trackInflight(promise);
      try {
        await promise;
      } finally {
        this.untrackInflight(promise);
      }
    }

    return new ResolvedContainerImpl(this.resolved as T, this.lifecycle, () => this.dispose());
  }

  dispose(): Promise<void> {
    this.lifecycle.disposePromise ??= this.disposeAll();
    return this.lifecycle.disposePromise;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  private getPlan(key: PropertyKey): readonly PropertyKey[] {
    return this.planFromCache(key, () =>
      createGetPlan(this.dependencies, this.resolvedForPlan(), key),
    );
  }

  private getResolveAllPlan(): readonly PropertyKey[] {
    return this.planFromCache(RESOLVE_ALL_PLAN_KEY, () =>
      createResolveAllPlan(this.dependencies, this.resolvedForPlan()),
    );
  }

  private planFromCache(
    key: PropertyKey,
    createPlan: () => readonly PropertyKey[],
  ): readonly PropertyKey[] {
    const entries = this.planCache.get(key);
    const cached = entries?.find(({ resolvedKeys }) =>
      hasSameKeys(resolvedKeys, this.initialResolvedKeys),
    );
    if (cached) {
      return cached.plan;
    }

    const plan = createPlan();
    const entry = { resolvedKeys: this.initialResolvedKeys, plan };
    if (entries) {
      entries.push(entry);
    } else {
      this.planCache.set(key, [entry]);
    }
    return plan;
  }

  private resolvedForPlan(): Partial<T> {
    if (!this.hasFactoryResult) {
      return this.resolved;
    }

    if (this.initialResolvedForPlan) {
      return this.initialResolvedForPlan;
    }

    const snapshot = Object.create(null) as Partial<T>;
    for (const key of this.initialResolvedKeys) {
      snapshot[key as keyof T] = this.resolved[key as keyof T];
    }
    this.initialResolvedForPlan = snapshot;
    return snapshot;
  }

  private readonly onFactoryResult = (value: unknown): void => {
    this.hasFactoryResult = true;
    if (!this.addKnownValue(value)) {
      return;
    }

    if (isDisposable(value)) {
      (this.owned ??= []).push(value);
    }
  };

  private addKnownValue(value: unknown): boolean {
    let known = (this.known ??= this.initialResolvedKeys.map(
      (key) => this.resolved[key as keyof T],
    ));

    if (Array.isArray(known)) {
      if (known.includes(value)) {
        return false;
      }

      if (known.length < KNOWN_VALUE_ARRAY_LIMIT) {
        known.push(value);
        return true;
      }

      known = new Set(known);
      this.known = known;
    }

    if (known.has(value)) {
      return false;
    }

    known.add(value);
    return true;
  }

  private trackInflight(promise: Promise<unknown>): void {
    if (!this.inflight) {
      this.inflight = promise;
      return;
    }

    if (this.inflight instanceof Set) {
      this.inflight.add(promise);
      return;
    }

    this.inflight = new Set([this.inflight, promise]);
  }

  private untrackInflight(promise: Promise<unknown>): void {
    if (this.inflight === promise) {
      this.inflight = undefined;
      return;
    }

    if (this.inflight instanceof Set) {
      this.inflight.delete(promise);
      if (this.inflight.size === 0) {
        this.inflight = undefined;
      }
    }
  }

  private async disposeAll(): Promise<void> {
    const inflight = this.inflight;
    if (inflight) {
      await Promise.allSettled(inflight instanceof Set ? inflight : [inflight]);
    }

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
