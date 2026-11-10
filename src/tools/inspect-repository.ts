import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GitHubClient } from "../github/client.js";

export const repositoryInputSchema = z.object({
  owner: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/, {
      message: "owner must be a valid GitHub account name",
    }),
  repository: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, {
      message: "repository must be a valid GitHub repository name",
    }),
});

const rateLimitSchema = z
  .object({
    limit: z.number().int().nullable(),
    remaining: z.number().int().nullable(),
    used: z.number().int().nullable(),
    resetAt: z.string().nullable(),
    resource: z.string().nullable(),
  })
  .nullable();

export const repositoryInspectionSchema = z.object({
  repository: z.object({
    fullName: z.string(),
    url: z.string(),
    description: z.string().nullable(),
    ownerType: z.enum(["User", "Organization"]),
    visibility: z.enum(["public", "private", "internal"]),
    defaultBranch: z.string(),
    primaryLanguage: z.string().nullable(),
    languages: z.record(z.string(), z.number().int().nonnegative()),
    topics: z.array(z.string()),
    sizeKb: z.number().int().nonnegative(),
  }),
  activity: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    pushedAt: z.string().nullable(),
    archived: z.boolean(),
    disabled: z.boolean(),
  }),
  features: z.object({
    issues: z.boolean(),
    discussions: z.boolean(),
    wiki: z.boolean(),
    pages: z.boolean(),
  }),
  popularity: z.object({
    stars: z.number().int().nonnegative(),
    watchers: z.number().int().nonnegative(),
    forks: z.number().int().nonnegative(),
    openIssues: z.number().int().nonnegative(),
  }),
  community: z.object({
    healthPercentage: z.number().min(0).max(100),
    description: z.string().nullable(),
    documentation: z.string().nullable(),
    files: z.object({
      codeOfConduct: z.boolean(),
      contributing: z.boolean(),
      issueTemplate: z.boolean(),
      license: z.boolean(),
      pullRequestTemplate: z.boolean(),
      readme: z.boolean(),
    }),
  }),
  rateLimit: rateLimitSchema,
});

export type RepositoryInspection = z.infer<typeof repositoryInspectionSchema>;

function formatInspection(inspection: RepositoryInspection): string {
  const languageNames = Object.keys(inspection.repository.languages);
  const communityFiles = Object.entries(inspection.community.files)
    .filter(([, present]) => present)
    .map(([name]) => name)
    .join(", ");

  return [
    `Repository: ${inspection.repository.fullName}`,
    `Description: ${inspection.repository.description ?? "Not provided"}`,
    `Visibility: ${inspection.repository.visibility}`,
    `Primary language: ${inspection.repository.primaryLanguage ?? "Not detected"}`,
    `Languages: ${languageNames.join(", ") || "None detected"}`,
    `Stars: ${inspection.popularity.stars}`,
    `Forks: ${inspection.popularity.forks}`,
    `Open issues: ${inspection.popularity.openIssues}`,
    `Community health: ${inspection.community.healthPercentage}%`,
    `Community files: ${communityFiles || "None detected"}`,
    `Last push: ${inspection.activity.pushedAt ?? "Unknown"}`,
    `URL: ${inspection.repository.url}`,
  ].join("\n");
}

export async function inspectRepository(
  githubClient: GitHubClient,
  owner: string,
  repository: string,
): Promise<RepositoryInspection> {
  const [details, community, languages] = await Promise.all([
    githubClient.getRepository(owner, repository),
    githubClient.getCommunityProfile(owner, repository),
    githubClient.getLanguages(owner, repository),
  ]);

  return {
    repository: {
      fullName: details.full_name,
      url: details.html_url,
      description: details.description,
      ownerType: details.owner.type,
      visibility: details.visibility,
      defaultBranch: details.default_branch,
      primaryLanguage: details.language,
      languages: { ...languages },
      topics: [...details.topics],
      sizeKb: details.size,
    },
    activity: {
      createdAt: details.created_at,
      updatedAt: details.updated_at,
      pushedAt: details.pushed_at,
      archived: details.archived,
      disabled: details.disabled,
    },
    features: {
      issues: details.has_issues,
      discussions: details.has_discussions,
      wiki: details.has_wiki,
      pages: details.has_pages,
    },
    popularity: {
      stars: details.stargazers_count,
      watchers: details.watchers_count,
      forks: details.forks_count,
      openIssues: details.open_issues_count,
    },
    community: {
      healthPercentage: community.health_percentage,
      description: community.description,
      documentation: community.documentation,
      files: {
        codeOfConduct: community.files.code_of_conduct !== null,
        contributing: community.files.contributing !== null,
        issueTemplate: community.files.issue_template !== null,
        license: community.files.license !== null,
        pullRequestTemplate: community.files.pull_request_template !== null,
        readme: community.files.readme !== null,
      },
    },
    rateLimit: githubClient.lastRateLimit,
  };
}

export function registerInspectRepositoryTool(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerTool(
    "inspect_repository",
    {
      title: "Inspect GitHub Repository",
      description:
        "Collect repository metadata, languages, activity, popularity, and community-profile evidence without modifying the repository.",
      inputSchema: repositoryInputSchema,
      outputSchema: repositoryInspectionSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ owner, repository }) => {
      const inspection = await inspectRepository(
        githubClient,
        owner,
        repository,
      );

      return {
        content: [{ type: "text", text: formatInspection(inspection) }],
        structuredContent: inspection,
      };
    },
  );
}
