import { defineContainer, inject, type DependencyGraph } from "tatenuki";

export type RequestContext = {
  requestId: string;
  userId: string | undefined;
};

export type UserProfile = {
  id: string;
  databasePoolId: number;
  profileServiceId: number;
};

export type LogEntry = Readonly<{
  message: string;
  [key: string]: unknown;
}>;

export class Logger {
  private readonly write: (entry: LogEntry) => void;
  private readonly fields: Readonly<Record<string, unknown>>;

  constructor(write: (entry: LogEntry) => void, fields: Readonly<Record<string, unknown>> = {}) {
    this.write = write;
    this.fields = fields;
  }

  child(fields: Readonly<Record<string, unknown>>): Logger {
    return new Logger(this.write, { ...this.fields, ...fields });
  }

  info(message: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.write({ ...this.fields, ...fields, message });
  }
}

export class DatabasePool {
  static instances = 0;
  readonly id = ++DatabasePool.instances;

  findUser(id: string) {
    return { id };
  }
}

class UserRepository {
  private readonly dependencies: { databasePool: DatabasePool };

  constructor(dependencies: { databasePool: DatabasePool }) {
    this.dependencies = dependencies;
  }

  findById(id: string) {
    return this.dependencies.databasePool.findUser(id);
  }
}

class ProfileService {
  static instances = 0;
  readonly id = ++ProfileService.instances;
  private readonly dependencies: {
    logger: Logger;
    userRepository: UserRepository;
    databasePool: DatabasePool;
  };

  constructor(dependencies: {
    logger: Logger;
    userRepository: UserRepository;
    databasePool: DatabasePool;
  }) {
    this.dependencies = dependencies;
  }

  getProfile(id: string): UserProfile {
    const user = this.dependencies.userRepository.findById(id);
    this.dependencies.logger.info("user profile requested", { profileId: id });

    return {
      id: user.id,
      databasePoolId: this.dependencies.databasePool.id,
      profileServiceId: this.id,
    };
  }
}

type Definition = {
  databasePool: DatabasePool;
  rootLogger: Logger;
  request: RequestContext;
  logger: Logger;
  userRepository: UserRepository;
  profileService: ProfileService;
};

const dependencies = {
  databasePool: [],
  rootLogger: [],
  request: [],
  logger: ["rootLogger", "request"],
  userRepository: ["databasePool"],
  profileService: ["logger", "userRepository", "databasePool"],
} as const satisfies DependencyGraph<Definition>;

// This immutable builder is the unresolved application graph. It is safe to
// retain globally and use as the template for every request container.
const requestScopeBuilder = defineContainer<Definition>()
  .graph(dependencies)
  .factories({
    logger: ({ request, rootLogger }) => rootLogger.child(request),
    userRepository: inject(UserRepository),
    profileService: inject(ProfileService),
  });

// Long-lived resources are constructed once and supplied to every request.
export const databasePool = new DatabasePool();
export const applicationLogger = new Logger((entry) => console.info(entry));

export function createRequestScope(request: RequestContext, rootLogger = applicationLogger) {
  return requestScopeBuilder.build({ databasePool, request, rootLogger });
}

export type RequestScope = ReturnType<typeof createRequestScope>;
