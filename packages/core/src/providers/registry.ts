import {
  ProviderError,
  type ProviderHealthResult,
  type ProviderRuntime,
  type TutorProvider,
  type TutorTaskType,
} from './types.js';

export interface ProviderFilterOptions {
  runtimes?: ProviderRuntime[];
  requireVision?: boolean;
  requireThinking?: boolean;
}

/**
 * Central registry managing all configured TutorProvider instances,
 * environment capability filtering (Desktop vs Android), task routing, and batch health checks.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, TutorProvider>();
  private defaultProviderId: string | null = null;
  private readonly taskRoutes = new Map<TutorTaskType, string>();

  register(provider: TutorProvider, options?: { setAsDefault?: boolean }): void {
    this.providers.set(provider.id, provider);
    if (options?.setAsDefault || this.defaultProviderId === null) {
      this.defaultProviderId = provider.id;
    }
  }

  unregister(providerId: string): boolean {
    const existed = this.providers.delete(providerId);
    if (existed && this.defaultProviderId === providerId) {
      const firstRemaining = this.providers.keys().next();
      this.defaultProviderId = firstRemaining.done ? null : firstRemaining.value;
    }
    for (const [task, mappedId] of this.taskRoutes.entries()) {
      if (mappedId === providerId) {
        this.taskRoutes.delete(task);
      }
    }
    return existed;
  }

  get(providerId: string): TutorProvider | undefined {
    return this.providers.get(providerId);
  }

  getOrThrow(providerId: string): TutorProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError({
        code: 'UNKNOWN',
        message: `Provider '${providerId}' is not registered.`,
      });
    }
    return provider;
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  setDefault(providerId: string): void {
    this.getOrThrow(providerId);
    this.defaultProviderId = providerId;
  }

  getDefault(): TutorProvider | undefined {
    if (!this.defaultProviderId) {
      return undefined;
    }
    return this.providers.get(this.defaultProviderId);
  }

  /**
   * Routes a specific teaching task (e.g., 'reverse_engineer', 'grade', 'teach') to a preferred provider.
   */
  setTaskRoute(task: TutorTaskType, providerId: string): void {
    this.getOrThrow(providerId);
    this.taskRoutes.set(task, providerId);
  }

  clearTaskRoute(task: TutorTaskType): void {
    this.taskRoutes.delete(task);
  }

  resolveForTask(task: TutorTaskType, overrideProviderId?: string): TutorProvider {
    if (overrideProviderId) {
      return this.getOrThrow(overrideProviderId);
    }
    const routedId = this.taskRoutes.get(task);
    if (routedId) {
      const routed = this.providers.get(routedId);
      if (routed) {
        return routed;
      }
    }
    const fallback = this.getDefault();
    if (!fallback) {
      throw new ProviderError({
        code: 'UNKNOWN',
        message: `No provider registered to handle task '${task}'.`,
      });
    }
    return fallback;
  }

  list(filter?: ProviderFilterOptions): TutorProvider[] {
    const all = Array.from(this.providers.values());
    if (!filter) {
      return all;
    }
    return all.filter((provider) => {
      if (filter.runtimes && !filter.runtimes.includes(provider.capabilities.runtime)) {
        return false;
      }
      if (filter.requireVision && !provider.capabilities.supportsVision) {
        return false;
      }
      if (filter.requireThinking && !provider.capabilities.supportsThinking) {
        return false;
      }
      return true;
    });
  }

  /**
   * Convenience filter for Android / Mobile runtimes (excludes desktop-cli providers).
   */
  listMobileCompatible(options?: { requireVision?: boolean }): TutorProvider[] {
    return this.list({
      runtimes: ['universal-api', 'companion-remote'],
      requireVision: options?.requireVision,
    });
  }

  async healthCheckAll(
    options?: ProviderFilterOptions & { signal?: AbortSignal }
  ): Promise<ProviderHealthResult[]> {
    const targets = this.list(options);
    return Promise.all(targets.map((provider) => provider.healthCheck(options?.signal)));
  }
}
