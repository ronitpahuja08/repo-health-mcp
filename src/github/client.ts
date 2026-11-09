import type { GitHubConfig } from "../config.js";
import {
  createGitHubApiError,
  readRateLimit,
  type GitHubRateLimit,
} from "./errors.js";
import type {
  GitHubCommunityProfileResponse,
  GitHubLanguagesResponse,
  GitHubRepositoryResponse,
} from "./types.js";

export type FetchImplementation = typeof globalThis.fetch;

export class GitHubClient {
  readonly #config: GitHubConfig;
  readonly #fetch: FetchImplementation;
  #lastRateLimit: GitHubRateLimit | null = null;

  constructor(
    config: GitHubConfig,
    fetchImplementation: FetchImplementation = globalThis.fetch,
  ) {
    this.#config = config;
    this.#fetch = fetchImplementation;
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

  async #get<T>(path: string): Promise<T> {
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

    return (await response.json()) as T;
  }
}
