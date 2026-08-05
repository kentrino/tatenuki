# DI

`@todo-sync/di` is a typed dependency-injection container for composition roots.
Define the dependency graph once, register factories, and provide values for
dependencies that have no factory.

## Define a container

```ts
import { Container, inject, type DependencyGraph, type ValueOf } from "@todo-sync/di";

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

export function createContainer(values: ValueOf<Definition, typeof dependencies>) {
  return new Container<Definition, typeof dependencies>(dependencies)
    .factory({
      apiClient: inject(ApiClient),
      todoService: inject(TodoService),
    })
    .value(values);
}
```

Keep container construction in an entrypoint. Domain, application, and adapter
code should continue to receive explicit dependencies rather than importing the
container.

## Lazy resolution

Calling `value()` creates a fully defined container. `get()` resolves only the
requested dependency and its transitive dependencies. Resolved values are
cached within that container.

```ts
const container = createContainer({ apiUrl: "https://api.example.com" });
const todoService = await container.get("todoService");
```

Concurrent requests in the same container share pending factory work. Separate
containers keep their resolved values and pending factories isolated, even when
created from the same values object.

## Eager resolution

Call `resolve()` instead of `value()` to initialize the entire graph:

```ts
const resolved = await new Container<Definition, typeof dependencies>(dependencies)
  .factory({
    apiClient: inject(ApiClient),
    todoService: inject(TodoService),
  })
  .resolve({ apiUrl: "https://api.example.com" });

resolved.todoService;
```

Factories may be synchronous or asynchronous. Resolution rejects when a factory
is missing or when a circular dependency is encountered.
