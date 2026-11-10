import { describe, expect, it, vi } from "vitest";

import { TtlCache } from "../src/cache/ttl-cache.js";
import { GitHubClient, type FetchImplementation } from "../src/github/client.js";
import { GitHubApiError } from "../src/github/errors.js";

const config = {
  apiBaseUrl: "https://api.github.test",
  token: "test-token",
  userAgent: "repo-health-test",
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

describe("GitHubClient", () => {
  it("caches successful GET responses and sends GitHub headers", async () => {
    const payload = { full_name: "acme/widget" };
    const fetchMock = vi.fn(async () =>
      jsonResponse(payload, {
        headers: {
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "59",
        },
      }),
    );
    const client = new GitHubClient(
      config,
      fetchMock as FetchImplementation,
      new TtlCache({ ttlMs: 60_000 }),
    );

    await expect(client.getRepository("acme", "widget")).resolves.toEqual(
      payload,
    );
    await expect(client.getRepository("acme", "widget")).resolves.toEqual(
      payload,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.github.test/repos/acme/widget");
    const headers = request?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("User-Agent")).toBe("repo-health-test");
    expect(client.lastRateLimit?.remaining).toBe(59);
  });

  it("does not cache failed requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { message: "temporary failure" },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ full_name: "acme/widget" }));
    const client = new GitHubClient(
      config,
      fetchMock as FetchImplementation,
      new TtlCache({ ttlMs: 60_000 }),
    );

    const firstAttempt = client.getRepository("acme", "widget");
    await expect(firstAttempt).rejects.toMatchObject<GitHubApiError>({
      name: "GitHubApiError",
      message: "temporary failure",
      status: 503,
    });
    await expect(client.getRepository("acme", "widget")).resolves.toEqual({
      full_name: "acme/widget",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clamps collection page sizes", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      requestedUrls.push(String(input));
      return jsonResponse([]);
    });
    const client = new GitHubClient(
      config,
      fetchMock as FetchImplementation,
      new TtlCache({ ttlMs: 60_000 }),
    );

    await client.listOpenIssues("acme", "widget", 500);
    await client.listReleases("acme", "widget", -5);

    expect(requestedUrls[0]).toContain("per_page=100");
    expect(requestedUrls[1]).toContain("per_page=1");
  });
});
