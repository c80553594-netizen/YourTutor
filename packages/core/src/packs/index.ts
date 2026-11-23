import { generalExamPromptPack } from './general-exam/index.js';
import { PromptPackRegistry } from './types.js';

export * from './types.js';
export * from './general-exam/templates.js';
export * from './general-exam/index.js';

/**
 * Creates a PromptPackRegistry preloaded with built-in packs (general-exam as default).
 */
export function createDefaultPromptPackRegistry(): PromptPackRegistry {
  const registry = new PromptPackRegistry();
  registry.register(generalExamPromptPack, { setAsDefault: true });
  return registry;
}
