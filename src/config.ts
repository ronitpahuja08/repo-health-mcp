const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_USER_AGENT = "github-project-health-mcp/0.1.0";

export interface GitHubConfig {
  readonly apiBaseUrl: string;
  readonly token?: string;
  readonly userAgent: string;
}

export interface AppConfig {
  readonly github: GitHubConfig;
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const configuredUrl = optionalValue(value) ?? DEFAULT_GITHUB_API_BASE_URL;
  const url = new URL(configuredUrl);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("GITHUB_API_BASE_URL must use HTTP or HTTPS");
  }

  return url.toString().replace(/\/$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const token = optionalValue(env.GITHUB_TOKEN);
  const sharedConfig = {
    apiBaseUrl: normalizeApiBaseUrl(env.GITHUB_API_BASE_URL),
    userAgent: DEFAULT_USER_AGENT,
  };

  return {
    github: token ? { ...sharedConfig, token } : sharedConfig,
  };
}
