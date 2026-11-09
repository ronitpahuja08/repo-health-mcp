import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GitHubClient } from "../github/client.js";
import type { GitHubCommitResponse } from "../github/types.js";
import { repositoryInputSchema } from "./inspect-repository.js";

const inputSchema = repositoryInputSchema.extend({
  lookbackDays: z.number().int().min(7).max(365).default(90),
  contributorLimit: z.number().int().min(1).max(30).default(10),
});

const contributorSchema = z.object({
  identity: z.string(),
  profileUrl: z.string().nullable(),
  commits: z.number().int().positive(),
  sharePercentage: z.number().min(0).max(100),
  lastCommitAt: z.string(),
});

const outputSchema = z.object({
  repository: z.string(),
  lookbackDays: z.number().int().positive(),
  since: z.string(),
  commitsFetched: z.number().int().nonnegative(),
  resultMayBeTruncated: z.boolean(),
  uniqueContributors: z.number().int().nonnegative(),
  attributedCommits: z.number().int().nonnegative(),
  unattributedCommits: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  mostRecentCommitAt: z.string().nullable(),
  contributors: z.array(contributorSchema),
});

export type ContributorActivity = z.infer<typeof outputSchema>;

interface ContributorAccumulator {
  commits: number;
  lastCommitAt: string;
  profileUrl: string | null;
}

function commitDate(commit: GitHubCommitResponse): string | null {
  return commit.commit.author?.date ?? commit.commit.committer?.date ?? null;
}

export function analyzeContributorActivity(options: {
  repository: string;
  commits: readonly GitHubCommitResponse[];
  lookbackDays: number;
  since: string;
  contributorLimit: number;
}): ContributorActivity {
  const contributors = new Map<string, ContributorAccumulator>();
  const activeDays = new Set<string>();
  let unattributedCommits = 0;
  let mostRecentCommitAt: string | null = null;

  for (const commit of options.commits) {
    const date = commitDate(commit);
    if (date !== null) {
      activeDays.add(date.slice(0, 10));
      if (mostRecentCommitAt === null || date > mostRecentCommitAt) {
        mostRecentCommitAt = date;
      }
    }

    const identity = commit.author?.login ?? commit.commit.author?.name?.trim();
    if (!identity || date === null) {
      unattributedCommits += 1;
      continue;
    }

    const existing = contributors.get(identity);
    contributors.set(identity, {
      commits: (existing?.commits ?? 0) + 1,
      lastCommitAt:
        existing === undefined || date > existing.lastCommitAt
          ? date
          : existing.lastCommitAt,
      profileUrl: commit.author?.html_url ?? existing?.profileUrl ?? null,
    });
  }

  const attributedCommits = [...contributors.values()].reduce(
    (total, contributor) => total + contributor.commits,
    0,
  );
  const ranked = [...contributors.entries()]
    .sort(
      ([leftIdentity, left], [rightIdentity, right]) =>
        right.commits - left.commits ||
        leftIdentity.localeCompare(rightIdentity),
    )
    .slice(0, options.contributorLimit)
    .map(([identity, contributor]) => ({
      identity,
      profileUrl: contributor.profileUrl,
      commits: contributor.commits,
      sharePercentage:
        attributedCommits === 0
          ? 0
          : Math.round((contributor.commits / attributedCommits) * 1_000) / 10,
      lastCommitAt: contributor.lastCommitAt,
    }));

  return {
    repository: options.repository,
    lookbackDays: options.lookbackDays,
    since: options.since,
    commitsFetched: options.commits.length,
    resultMayBeTruncated: options.commits.length === 100,
    uniqueContributors: contributors.size,
    attributedCommits,
    unattributedCommits,
    activeDays: activeDays.size,
    mostRecentCommitAt,
    contributors: ranked,
  };
}

function formatActivity(activity: ContributorActivity): string {
  const contributorLines = activity.contributors.map(
    (contributor) =>
      `- ${contributor.identity}: ${contributor.commits} commit(s), ${contributor.sharePercentage}% of attributed activity`,
  );

  return [
    `Contributor activity for ${activity.repository} over ${activity.lookbackDays} days:`,
    `Commits fetched: ${activity.commitsFetched}${activity.resultMayBeTruncated ? " (API page limit reached)" : ""}`,
    `Unique contributors: ${activity.uniqueContributors}`,
    `Active days: ${activity.activeDays}`,
    `Unattributed commits: ${activity.unattributedCommits}`,
    "",
    "Top contributors:",
    ...(contributorLines.length > 0
      ? contributorLines
      : ["- No attributed commits found."]),
  ].join("\n");
}

export function registerContributorActivityTool(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerTool(
    "analyze_contributor_activity",
    {
      title: "Analyze Contributor Activity",
      description:
        "Analyze recent commit authorship, contributor concentration, and active development days for a GitHub repository.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ owner, repository, lookbackDays, contributorLimit }) => {
      const since = new Date(
        Date.now() - lookbackDays * 86_400_000,
      ).toISOString();
      const commits = await githubClient.listCommits({
        owner,
        repository,
        since,
      });
      const activity = analyzeContributorActivity({
        repository: `${owner}/${repository}`,
        commits,
        lookbackDays,
        since,
        contributorLimit,
      });

      return {
        content: [{ type: "text", text: formatActivity(activity) }],
        structuredContent: activity,
      };
    },
  );
}
