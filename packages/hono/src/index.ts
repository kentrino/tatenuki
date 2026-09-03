import type { Context, Env, MiddlewareHandler } from "hono";

export type MaybePromise<T> = T | PromiseLike<T>;

export interface TatenukiScope {
  dispose(): MaybePromise<void>;
}

export type TatenukiHonoEnv<Scope extends TatenukiScope, Key extends string = "di"> = {
  Variables: {
    [Name in Key]: Scope;
  };
};

type ScopedEnv<E extends Env, Scope extends TatenukiScope, Key extends string> = E &
  TatenukiHonoEnv<Scope, Key>;

type ScopedContext<E extends Env, Scope extends TatenukiScope, Key extends string> = Context<
  ScopedEnv<E, Scope, Key>
>;

export interface TatenukiHonoOptions<
  Scope extends TatenukiScope,
  E extends Env = Env,
  Key extends string = "di",
> {
  readonly createScope: (context: Context<E>) => MaybePromise<Scope>;
  readonly key?: Key;
  readonly setupScope?: (scope: Scope, context: ScopedContext<E, Scope, Key>) => MaybePromise<void>;
  readonly disposeScope?: (
    scope: Scope,
    context: ScopedContext<E, Scope, Key>,
  ) => MaybePromise<void>;
  readonly autoDispose?:
    | boolean
    | ((context: ScopedContext<E, Scope, Key>) => MaybePromise<boolean>);
  readonly onDisposeError?: (
    error: unknown,
    context: ScopedContext<E, Scope, Key>,
  ) => MaybePromise<void>;
}

const skippedContexts = new WeakSet<Context>();

function logDisposeError(error: unknown): void {
  try {
    console.error("Failed to dispose tatenuki Hono request scope", error);
  } catch {
    // Cleanup reporting must not replace the route or setup error.
  }
}

async function reportDisposeError<E extends Env, Scope extends TatenukiScope, Key extends string>(
  error: unknown,
  context: ScopedContext<E, Scope, Key>,
  onDisposeError: TatenukiHonoOptions<Scope, E, Key>["onDisposeError"],
): Promise<void> {
  if (!onDisposeError) {
    logDisposeError(error);
    return;
  }

  try {
    await onDisposeError(error, context);
  } catch (handlerError) {
    logDisposeError(
      new AggregateError([error, handlerError], "Failed to handle tatenuki disposal error"),
    );
  }
}

async function disposeSafely<E extends Env, Scope extends TatenukiScope, Key extends string>(
  scope: Scope,
  context: ScopedContext<E, Scope, Key>,
  disposeScope: NonNullable<TatenukiHonoOptions<Scope, E, Key>["disposeScope"]>,
  onDisposeError: TatenukiHonoOptions<Scope, E, Key>["onDisposeError"],
): Promise<void> {
  try {
    await disposeScope(scope, context);
  } catch (error) {
    await reportDisposeError(error, context, onDisposeError);
  }
}

export function skipTatenukiDispose(context: Context): void {
  skippedContexts.add(context);
}

export function tatenukiHono<Scope extends TatenukiScope, E extends Env = Env>(
  options: Omit<TatenukiHonoOptions<Scope, E, "di">, "key"> & {
    readonly key?: "di";
  },
): MiddlewareHandler<ScopedEnv<E, Scope, "di">>;

export function tatenukiHono<
  Scope extends TatenukiScope,
  const Key extends string,
  E extends Env = Env,
>(
  options: TatenukiHonoOptions<Scope, E, Key> & {
    readonly key: Key;
  },
): MiddlewareHandler<ScopedEnv<E, Scope, Key>>;

export function tatenukiHono<
  Scope extends TatenukiScope,
  E extends Env = Env,
  Key extends string = string,
>(options: TatenukiHonoOptions<Scope, E, Key>): MiddlewareHandler<ScopedEnv<E, Scope, Key>> {
  const key = (options.key ?? "di") as Key;
  const disposeScope = options.disposeScope ?? ((scope: Scope) => scope.dispose());

  return async (context, next) => {
    const scopedContext = context as ScopedContext<E, Scope, Key>;
    const setScope = (value: Scope | undefined) => {
      const set = scopedContext.set as unknown as (name: Key, value: Scope | undefined) => void;
      set(key, value);
    };
    const scope = await options.createScope(context as unknown as Context<E>);

    setScope(scope);

    if (options.setupScope) {
      try {
        await options.setupScope(scope, scopedContext);
      } catch (error) {
        await disposeSafely(scope, scopedContext, disposeScope, options.onDisposeError);
        skippedContexts.delete(context);
        setScope(undefined);
        throw error;
      }
    }

    let routeError: unknown;
    let routeThrew = false;
    try {
      await next();
    } catch (error) {
      routeError = error;
      routeThrew = true;
    }

    const routeFailed = routeThrew || scopedContext.error !== undefined;
    const skipRequested = skippedContexts.delete(context);

    if (routeFailed || !skipRequested) {
      let shouldDispose = options.autoDispose !== false;

      if (typeof options.autoDispose === "function") {
        try {
          shouldDispose = await options.autoDispose(scopedContext);
        } catch (error) {
          shouldDispose = true;
          await reportDisposeError(error, scopedContext, options.onDisposeError);
        }
      }

      if (shouldDispose) {
        await disposeSafely(scope, scopedContext, disposeScope, options.onDisposeError);
      }
    }

    if (routeThrew) {
      throw routeError;
    }
  };
}
