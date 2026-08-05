# DI

`@todo-sync/di` is a small, typed dependency-injection container for composition
roots. Define the dependency graph once, register factories, and provide the
remaining values when building a container.

## Define a container

```ts
import { defineContainer, inject, type DependencyGraph, type ValueOf } from "@todo-sync/di";

class ApiClient {
  readonly dependencies: { apiUrl: string };

  constructor(dependencies: { apiUrl: string }) {
    this.dependencies = dependencies;
  }
}

class TodoService {
  readonly dependencies: { apiClient: ApiClient };

  constructor(dependencies: { apiClient: ApiClient }) {
    this.dependencies = dependencies;
  }
}

type Definition = {
  apiUrl: string;
  apiClient: ApiClient;
  todoService: TodoService;
};

const dependencies = {
  apiUrl: [],
  apiClient: ["apiUrl"],
  todoService: ["apiClient"],
} as const satisfies DependencyGraph<Definition>;

const builder = defineContainer<Definition>()
  .graph(dependencies)
  .factories({
    apiClient: inject(ApiClient),
    todoService: inject(TodoService),
  });

export function createContainer(values: ValueOf<Definition, typeof dependencies>) {
  return builder.build(values);
}
```

`defineContainer<Definition>()` fixes the value types first. The following
`graph()` call can then infer the graph's literal type, so it does not need to be
repeated as an explicit generic argument.

Keep container construction in an entrypoint. Domain, application, and adapter
code should continue to receive explicit dependencies rather than importing the
container.

## Inject classes and functions

`inject()` adapts a class whose constructor takes a dependency object into a
container factory, as shown above. It can also adapt a function whose first
argument is a dependency object:

```ts
type HttpClient = {
  get<T>(path: string): Promise<T>;
};
type User = {
  id: string;
};

function findUser({ httpClient }: { httpClient: HttpClient }, userId: string) {
  return httpClient.get<User>(`/users/${userId}`);
}

type FindUser = (userId: string) => Promise<User>;

type Definition = {
  httpClient: HttpClient;
  findUser: FindUser;
};

const dependencies = {
  httpClient: [],
  findUser: ["httpClient"],
} as const satisfies DependencyGraph<Definition>;

const container = defineContainer<Definition>()
  .graph(dependencies)
  .factories({ findUser: inject(findUser) })
  .build({ httpClient });

const findUserWithDependencies = await container.get("findUser");
const user = await findUserWithDependencies("user-id");
```

The resulting function preserves all arguments after the dependency object and
the original return type, including promises. This keeps dependencies explicit
in the function definition without requiring callers to pass them repeatedly.

## Override values in tests

Call `override()` before `build()` or `resolve()` to replace selected
dependencies at runtime:

```ts
const container = builder
  .override({ apiClient: fakeApiClient })
  .build({ apiUrl: "https://api.example.com" });
```

Overrides take precedence over both registered factories and values passed to
`build()` or `resolve()`. They do not change type-level factory tracking, so
`build()` still requires the same values it required before `override()` was
called. Each call returns a new builder and does not affect containers built
from the original.

## Lazy resolution

Calling `build()` creates a fully defined container. `get()` resolves only the
requested dependency and its transitive dependencies. Resolved values are
cached within that container.

```ts
const container = createContainer({ apiUrl: "https://api.example.com" });
const todoService = await container.get("todoService");
```

Concurrent requests in the same container share pending factory work. Separate
containers keep their resolved values and pending factories isolated, even when
created from the same values object.

## Full resolution

Call `resolve()` instead of `build()` to initialize and return the entire graph:

```ts
const resolved = await defineContainer<Definition>()
  .graph(dependencies)
  .factories({
    apiClient: inject(ApiClient),
    todoService: inject(TodoService),
  })
  .resolve({ apiUrl: "https://api.example.com" });

resolved.todoService;
```

Factories may be synchronous or asynchronous. Resolution rejects when a factory
is missing or when a circular dependency is encountered.

## Behavior that may not be obvious

- An empty dependency list means only that the key has no dependencies. The key
  may be supplied either by `factories()` or by `build()`.
- `ValueOf` treats every key with an empty dependency list as an external value.
  Use it only when the project follows that convention. `build()` itself
  requires exactly the keys that do not have registered factories.
- `get()` always returns a promise, including for synchronous factories.
- Factory results behave as singletons within one built container. A new call to
  `build()` creates an isolated cache.
- Concurrent `get()` calls in the same container share pending factory work.
- `inject(SomeClass)` supports classes whose constructor takes one dependency
  object. `inject(someFunction)` binds the dependency object passed as the
  function's first argument.
- Register classes with other constructor shapes and functions that do not take
  dependencies first using a custom factory.
- Registering the same factory key again replaces the earlier factory.

## Lower-level API

`Container` remains available when direct construction is useful. Its
`factory()` and `value()` methods are the lower-level equivalents of
`factories()` and `build()`. `resolve()` is available with either style.
