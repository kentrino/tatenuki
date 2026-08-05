type IfEquals<X, Y, Then = X, Else = never> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? Then : Else;

export type DependencyGraph<T extends object> = {
  [K in keyof T]: readonly (keyof T)[];
};

export type DependantsOf<T extends object, Key extends keyof T> = {
  [K in keyof T]: T[K] extends readonly (infer Dependency)[]
    ? Key extends Dependency
      ? K
      : never
    : never;
}[keyof T];

type DependantsOfWithHalt<T extends object, Key extends keyof T> = IfEquals<
  DependantsOf<T, DependantsOf<T, Key>>,
  DependantsOf<T, Key>,
  DependantsOf<T, Key>,
  DependantsOf<T, DependantsOf<T, Key>> | DependantsOf<T, Key>
>;

export type DependantsOfRecursive<T extends object, Key extends keyof T> =
  | DependantsOfWithHalt<T, DependantsOfWithHalt<T, Key>>
  | DependantsOf<T, Key>;

export type DependenciesOf<T extends object, DefinitionKeys extends PropertyKey> = {
  [K in keyof T & DefinitionKeys]: readonly Exclude<
    keyof T & DefinitionKeys,
    K | DependantsOfRecursive<T, K>
  >[];
};

type UnknownObject = Record<PropertyKey, unknown>;

export type Factory<
  T extends UnknownObject,
  D extends DependenciesOf<D, keyof T>,
  K extends keyof D = keyof D,
> = (dependencies: Pick<T, D[K][number] & keyof T>) => T[K] | Promise<T[K]>;

export type PartialValues<T extends UnknownObject, K extends keyof T = keyof T> = {
  [P in K]: T[P];
};

export type PartialFactories<
  T extends UnknownObject,
  D extends DependenciesOf<D, keyof T>,
  K extends keyof D,
> = {
  [P in K]: Factory<T, D, P>;
};

type NoDependencyKeys<T extends Record<string, readonly string[]>> = {
  [K in keyof T]: T[K] extends readonly never[] ? K : never;
}[keyof T];

export type ValueOf<
  T extends Record<string, unknown>,
  D extends Record<string, readonly string[]>,
> = Pick<T, NoDependencyKeys<D> & keyof T>;
