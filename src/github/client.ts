import type { GitHubConfig } from "../config.js";
import { TtlCache } from "../cache/ttl-cache.js";
import {
  createGitHubApiError,
  readRateLimit,
  type GitHubRateLimit,
} from "./errors.js";
import type {
  GitHubCommunityProfileResponse,
  GitHubIssueResponse,
  GitHubLanguagesResponse,
  GitHubReleaseResponse,
  GitHubRepositoryResponse,
} from "./types.js";

export type FetchImplementation = typeof globalThis.fetch;

const DEFAULT_CACHE_TTL_MS = 60_000;

export class GitHubClient {
  readonly #config: GitHubConfig;
  readonly #fetch: FetchImplementation;
  readonly #cache: TtlCache<string, unknown>;
  #lastRateLimit: GitHubRateLimit | null = null;

  constructor(
    config: GitHubConfig,
    fetchImplementation: FetchImplementation = globalThis.fetch,
    cache: TtlCache<string, unknown> = new TtlCache({
      ttlMs: DEFAULT_CACHE_TTL_MS,
    }),
  ) {
    this.#config = config;
    this.#fetch = fetchImplementation;
    this.#cache = cache;
  }

  get lastRateLimit(): GitHubRateLimit | null {
    return this.#lastRateLimit;
  }

  async getRepository(
    owner: string,
    repository: string,
  ): Promise<GitHubRepositoryResponse> {
    return this.#get(
      `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    );
  }

  async getCommunityProfile(
    owner: string,
    repository: string,
  ): Promise<GitHubCommunityProfileResponse> {
    return this.#get(
      `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/community/profile`,
    );
  }

  async getLanguages(
    owner: string,
    repository: string,
  ): Promise<GitHubLanguagesResponse> {
    return this.#get(
      `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/languages`,
    );
  }

  async listOpenIssues(
    owner: string,
    repository: string,
    perPage = 100,
  ): Promise<readonly GitHubIssueResponse[]> {
    const safePerPage = Math.min(100, Math.max(1, Math.trunc(perPage)));
    return this.#get(
      `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues?state=open&sort=updated&direction=desc&per_page=${safePerPage}`,
    );
  }

  async listReleases(
    owner: string,
    repository: string,
    perPage = 30,
  ): Promise<readonly GitHubReleaseResponse[]> {
    const safePerPage = Math.min(100, Math.max(1, Math.trunc(perPage)));
    return this.#get(
      `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases?per_page=${safePerPage}`,
    );
  }

  async #get<T>(path: string): Promise<T> {
    const cachedValue = this.#cache.get(path);
    if (cachedValue !== undefined) {
      return cachedValue as T;
    }

    const baseUrl = `${this.#config.apiBaseUrl}/`;
    const url = new URL(path.replace(/^\/+/, ""), baseUrl);
    const headers = new Headers({
      Accept: "application/vnd.github+json",
      "User-Agent": this.#config.userAgent,
      "X-GitHub-Api-Version": "2022-11-28",
    });

    if (this.#config.token) {
      headers.set("Authorization", `Bearer ${this.#config.token}`);
    }

    const response = await this.#fetch(url, {
      method: "GET",
      headers,
    });

    this.#lastRateLimit = readRateLimit(response.headers);

    if (!response.ok) {
      throw await createGitHubApiError(response, this.#lastRateLimit);
    }

    const value = (await response.json()) as T;
    this.#cache.set(path, value);
    return value;
  }
}
