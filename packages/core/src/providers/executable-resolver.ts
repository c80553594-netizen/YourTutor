export interface ExecutableResolverEnv {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  homeDir: string;
  fileExists: (filePath: string) => Promise<boolean>;
  readDir?: (dirPath: string) => Promise<string[]>;
}

export interface ResolveExecutableOptions {
  /** Base executable name such as 'agy', 'codex', or 'claude'. */
  binaryName: string;
  /** Optional user-configured explicit binary path. */
  customPath?: string;
  /** Optional extra search directories. */
  extraSearchDirs?: string[];
  /** Injectable filesystem/env hooks for deterministic cross-platform unit tests. */
  resolverEnv?: ExecutableResolverEnv;
}

function joinPath(platform: NodeJS.Platform, dir: string, file: string): string {
  const sep = platform === 'win32' ? '\\' : '/';
  const cleanedDir = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir;
  return `${cleanedDir}${sep}${file}`;
}

function isExplicitPath(target: string): boolean {
  return target.includes('/') || target.includes('\\') || /^[A-Za-z]:/.test(target);
}

/**
 * Builds candidate search directories across Windows, macOS, and Linux,
 * compensating for macOS/Linux GUI apps that launch without login-shell PATH.
 */
export async function buildSearchDirectories(
  envInfo: ExecutableResolverEnv,
  extraSearchDirs: string[] = []
): Promise<string[]> {
  const { platform, env, homeDir, readDir } = envInfo;
  const pathDelimiter = platform === 'win32' ? ';' : ':';
  const rawPath = env.PATH ?? env.Path ?? '';
  const pathEntries = rawPath
    .split(pathDelimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const fallbackDirs: string[] = [];

  if (platform === 'win32') {
    const appData = env.APPDATA;
    const localAppData = env.LOCALAPPDATA;
    const userProfile = env.USERPROFILE ?? homeDir;
    if (appData) {
      fallbackDirs.push(`${appData}\\npm`);
    }
    if (localAppData) {
      fallbackDirs.push(`${localAppData}\\pnpm`, `${localAppData}\\Volta\\bin`);
    }
    if (userProfile) {
      fallbackDirs.push(`${userProfile}\\.local\\bin`, `${userProfile}\\scoop\\shims`);
    }
  } else {
    fallbackDirs.push(
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      `${homeDir}/.local/bin`,
      `${homeDir}/.npm-global/bin`,
      `${homeDir}/.volta/bin`,
      `${homeDir}/.pnpm-global/bin`,
      `${homeDir}/.cargo/bin`,
      `${homeDir}/.bun/bin`
    );

    // Discover nvm node versions on macOS/Linux GUI launches where ~/.zshrc was not sourced
    if (readDir) {
      const nvmBase = `${homeDir}/.nvm/versions/node`;
      try {
        const versions = await readDir(nvmBase);
        const sorted = [...versions].sort().reverse();
        for (const ver of sorted) {
          fallbackDirs.push(`${nvmBase}/${ver}/bin`);
        }
      } catch {
        // nvm directory not present
      }
    }
  }

  const seen = new Set<string>();
  const combined = [...extraSearchDirs, ...pathEntries, ...fallbackDirs];
  const unique: string[] = [];
  for (const dir of combined) {
    const key = platform === 'win32' ? dir.toLowerCase() : dir;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(dir);
    }
  }
  return unique;
}

/**
 * Generates candidate executable filenames for the current OS
 * (adds .cmd/.exe/.bat/.ps1 on Windows when extension is omitted).
 */
export function buildCandidateNames(
  binaryName: string,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>
): string[] {
  if (platform !== 'win32') {
    return [binaryName];
  }

  const lower = binaryName.toLowerCase();
  const hasKnownExt = /\.(exe|cmd|bat|com|ps1)$/i.test(lower);
  if (hasKnownExt) {
    return [binaryName];
  }

  const rawPathext = env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD';
  const pathextList = rawPathext
    .split(';')
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext.startsWith('.'));

  // Prioritize .cmd and .exe for npm/Node CLIs on Windows
  const prioritized = ['.cmd', '.exe', '.bat', ...pathextList];
  const uniqueExts = Array.from(new Set(prioritized));
  return [...uniqueExts.map((ext) => `${binaryName}${ext}`), binaryName];
}

async function getDefaultResolverEnv(): Promise<ExecutableResolverEnv> {
  const [{ access, constants, readdir }, os] = await Promise.all([
    import('node:fs/promises'),
    import('node:os'),
  ]);

  return {
    platform: process.platform,
    env: process.env,
    homeDir: os.homedir(),
    fileExists: async (filePath: string) => {
      try {
        await access(filePath, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
    readDir: async (dirPath: string) => readdir(dirPath),
  };
}

/**
 * Resolves a CLI binary across Windows (.cmd/.exe) and macOS/Linux (including GUI launches
 * missing login-shell PATH entries).
 */
export async function resolveExecutable(options: ResolveExecutableOptions): Promise<string | null> {
  const envInfo = options.resolverEnv ?? (await getDefaultResolverEnv());
  const target = options.customPath?.trim() || options.binaryName;

  if (isExplicitPath(target)) {
    const candidates = buildCandidateNames(target, envInfo.platform, envInfo.env);
    for (const candidate of candidates) {
      if (await envInfo.fileExists(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  const dirs = await buildSearchDirectories(envInfo, options.extraSearchDirs);
  const names = buildCandidateNames(target, envInfo.platform, envInfo.env);

  for (const dir of dirs) {
    for (const name of names) {
      const fullPath = joinPath(envInfo.platform, dir, name);
      if (await envInfo.fileExists(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Builds an enriched PATH string including GUI-safe fallback directories so spawned
 * subprocesses (e.g., node shims like `#!/usr/bin/env node`) can find `node` reliably.
 */
export async function buildEnrichedPathEnv(
  envInfo?: ExecutableResolverEnv
): Promise<Record<string, string>> {
  const resolved = envInfo ?? (await getDefaultResolverEnv());
  const dirs = await buildSearchDirectories(resolved);
  const delimiter = resolved.platform === 'win32' ? ';' : ':';
  const result: Record<string, string> = {};

  for (const [k, v] of Object.entries(resolved.env)) {
    if (v !== undefined) {
      result[k] = v;
    }
  }
  result.PATH = dirs.join(delimiter);
  return result;
}
