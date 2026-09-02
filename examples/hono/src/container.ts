import { defineContainer, inject, type DependencyGraph } from "tatenuki";

export type RequestContext = {
  requestId: string;
  userId: string | undefined;
};

export type UserProfile = {
  id: string;
  requestedBy: string | undefined;
  requestId: string;
  databasePoolId: number;
  profileServiceId: number;
};

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
    request: RequestContext;
    userRepository: UserRepository;
    databasePool: DatabasePool;
  };

  constructor(dependencies: {
    request: RequestContext;
    userRepository: UserRepository;
    databasePool: DatabasePool;
  }) {
    this.dependencies = dependencies;
  }

  getProfile(id: string): UserProfile {
    const user = this.dependencies.userRepository.findById(id);

    return {
      id: user.id,
      requestedBy: this.dependencies.request.userId,
      requestId: this.dependencies.request.requestId,
      databasePoolId: this.dependencies.databasePool.id,
      profileServiceId: this.id,
    };
  }
}

type Definition = {
  databasePool: DatabasePool;
  request: RequestContext;
  userRepository: UserRepository;
  profileService: ProfileService;
};

const dependencies = {
  databasePool: [],
  request: [],
  userRepository: ["databasePool"],
  profileService: ["request", "userRepository", "databasePool"],
} as const satisfies DependencyGraph<Definition>;

// This immutable builder is the unresolved application graph. It is safe to
// retain globally and use as the template for every request container.
const requestScopeBuilder = defineContainer<Definition>()
  .graph(dependencies)
  .factories({
    userRepository: inject(UserRepository),
    profileService: inject(ProfileService),
  });

// Long-lived resources are constructed once and supplied to every request.
export const databasePool = new DatabasePool();

export function createRequestScope(request: RequestContext) {
  return requestScopeBuilder.build({ databasePool, request });
}

export type RequestScope = ReturnType<typeof createRequestScope>;
