import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GitHubClient } from "../github/client.js";
import type { GitHubReleaseResponse } from "../github/types.js";
import { repositoryInputSchema } from "./inspect-repository.js";

const inputSchema = repositoryInputSchema.extend({
  limit: z.number().int().min(1).max(20).default(5),
  includePrereleases: z.boolean().default(false),
});

const releaseSchema = z.object({
  tag: z.string(),
  name: z.string(),
  url: z.string(),
  publishedAt: z.string(),
  ageDays: z.number().int().nonnegative(),
  prerelease: z.boolean(),
  notesPreview: z.string(),
});

const outputSchema = z.object({
  repository: z.string(),
  releasesFetched: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  latestReleaseAt: z.string().nullable(),
  averageDaysBetweenReleases: z.number().nonnegative().nullable(),
  releases: z.array(releaseSchema),
});

export type ReleaseSummary = z.infer<typeof outputSchema>;

function preview(body: string | null): string {
  if (body === null || body.trim().length === 0) {
    return "No release notes provided.";
  }

  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length <= 280
    ? normalized
    : `${normalized.slice(0, 277)}...`;
}

export function summarizeReleases(options: {
  repository: string;
  releases: readonly GitHubReleaseResponse[];
  limit: number;
  includePrereleases: boolean;
  now?: Date;
}): ReleaseSummary {
  const nowMs = (options.now ?? new Date()).getTime();
  const published = options.releases
    .filter(
      (release) =>
        !release.draft &&
        release.published_at !== null &&
        (options.includePrereleases || !release.prerelease),
    )
    .sort(
      (left, right) =>
        Date.parse(right.published_at ?? "") -
        Date.parse(left.published_at ?? ""),
    );
  const releaseDates = published
    .map((release) => Date.parse(release.published_at ?? ""))
    .filter(Number.isFinite);
  const intervals = releaseDates.slice(1).map((date, index) => {
    const previousDate = releaseDates[index];
    return previousDate === undefined
      ? 0
      : Math.abs(previousDate - date) / 86_400_000;
  });
  const averageDaysBetweenReleases =
    intervals.length === 0
      ? null
      : Math.round(
          (intervals.reduce((total, interval) => total + interval, 0) /
            intervals.length) *
            10,
        ) / 10;
  const releases = published.slice(0, options.limit).map((release) => {
    const publishedAt = release.published_at ?? release.created_at;
    return {
      tag: release.tag_name,
      name: release.name?.trim() || release.tag_name,
      url: release.html_url,
      publishedAt,
      ageDays: Math.max(
        0,
        Math.floor((nowMs - Date.parse(publishedAt)) / 86_400_000),
      ),
      prerelease: release.prerelease,
      notesPreview: preview(release.body),
    };
  });

  return {
    repository: options.repository,
    releasesFetched: options.releases.length,
    returned: releases.length,
    latestReleaseAt: releases[0]?.publishedAt ?? null,
    averageDaysBetweenReleases,
    releases,
  };
}

function formatSummary(summary: ReleaseSummary): string {
  if (summary.releases.length === 0) {
    return `No published releases matching the requested criteria were found for ${summary.repository}.`;
  }

  return [
    `Recent releases for ${summary.repository}:`,
    ...summary.releases.map(
      (release) =>
        `- ${release.name} (${release.tag}) — ${release.ageDays} day(s) ago\n  ${release.url}\n  ${release.notesPreview}`,
    ),
    "",
    `Average interval: ${summary.averageDaysBetweenReleases === null ? "Not enough releases" : `${summary.averageDaysBetweenReleases} days`}`,
  ].join("\n");
}

export function registerSummarizeReleasesTool(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerTool(
    "summarize_recent_releases",
    {
      title: "Summarize Recent Releases",
      description:
        "List recent published releases, preview their notes, and estimate release cadence for a GitHub repository.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ owner, repository, limit, includePrereleases }) => {
      const releases = await githubClient.listReleases(
        owner,
        repository,
        Math.max(30, limit),
      );
      const summary = summarizeReleases({
        repository: `${owner}/${repository}`,
        releases,
        limit,
        includePrereleases,
      });

      return {
        content: [{ type: "text", text: formatSummary(summary) }],
        structuredContent: summary,
      };
    },
  );
}
