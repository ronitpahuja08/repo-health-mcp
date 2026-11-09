export interface GitHubRateLimit {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly used: number | null;
  readonly resetAt: string | null;
  readonly resource: string | null;
}

function numericHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readRateLimit(headers: Headers): GitHubRateLimit | null {
  const limit = numericHeader(headers, "x-ratelimit-limit");
  const remaining = numericHeader(headers, "x-ratelimit-remaining");
  const used = numericHeader(headers, "x-ratelimit-used");
  const resetSeconds = numericHeader(headers, "x-ratelimit-reset");
  const resource = headers.get("x-ratelimit-resource");

  if (
    limit === null &&
    remaining === null &&
    used === null &&
    resetSeconds === null &&
    resource === null
  ) {
    return null;
  }

  return {
    limit,
    remaining,
    used,
    resetAt:
      resetSeconds === null
        ? null
        : new Date(resetSeconds * 1_000).toISOString(),
    resource,
  };
}

export class GitHubApiError extends Error {
  readonly status: number;
  readonly documentationUrl: string | null;
  readonly rateLimit: GitHubRateLimit | null;

  constructor(options: {
    message: string;
    status: number;
    documentationUrl: string | null;
    rateLimit: GitHubRateLimit | null;
  }) {
    super(options.message);
    this.name = "GitHubApiError";
    this.status = options.status;
    this.documentationUrl = options.documentationUrl;
    this.rateLimit = options.rateLimit;
  }

  get isRateLimitError(): boolean {
    return (
      this.status === 429 ||
      (this.status === 403 && this.rateLimit?.remaining === 0)
    );
  }
}

interface GitHubErrorBody {
  readonly message?: unknown;
  readonly documentation_url?: unknown;
}

export async function createGitHubApiError(
  response: Response,
  rateLimit: GitHubRateLimit | null,
): Promise<GitHubApiError> {
  let body: GitHubErrorBody = {};

  try {
    body = (await response.json()) as GitHubErrorBody;
  } catch {
    // GitHub may return an empty or non-JSON response through a proxy.
  }

  const message =
    typeof body.message === "string"
      ? body.message
      : `GitHub API request failed with status ${response.status}`;
  const documentationUrl =
    typeof body.documentation_url === "string"
      ? body.documentation_url
      : null;

  return new GitHubApiError({
    message,
    status: response.status,
    documentationUrl,
    rateLimit,
  });
}
