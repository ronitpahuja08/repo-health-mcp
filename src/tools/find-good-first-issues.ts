import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GitHubClient } from "../github/client.js";
import type {
  GitHubIssueResponse,
  GitHubLabelResponse,
} from "../github/types.js";
import { repositoryInputSchema } from "./inspect-repository.js";

const inputSchema = repositoryInputSchema.extend({
  limit: z.number().int().min(1).max(30).default(10),
  includeHelpWanted: z.boolean().default(true),
});

const issueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  labels: z.array(z.string()),
  comments: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reason: z.string(),
});

const outputSchema = z.object({
  repository: z.string(),
  labelsSearched: z.array(z.string()),
  openIssuesScanned: z.number().int().nonnegative(),
  totalMatches: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  issues: z.array(issueSchema),
});

export type GoodFirstIssueResult = z.infer<typeof outputSchema>;

function labelName(label: string | GitHubLabelResponse): string | null {
  return typeof label === "string" ? label : label.name;
}

function normalizedLabels(issue: GitHubIssueResponse): string[] {
  return issue.labels.flatMap((label) => {
    const name = labelName(label)?.trim();
    return name ? [name] : [];
  });
}

function formatResult(result: GoodFirstIssueResult): string {
  if (result.issues.length === 0) {
    return `No matching contribution issues were found in ${result.repository} among the ${result.openIssuesScanned} open items scanned.`;
  }

  const issueLines = result.issues.map(
    (issue) =>
      `- #${issue.number} ${issue.title} (${issue.reason}, ${issue.comments} comment(s))\n  ${issue.url}`,
  );

  return [
    `Contribution opportunities in ${result.repository}:`,
    ...issueLines,
    "",
    `Showing ${result.returned} of ${result.totalMatches} matching issue(s).`,
  ].join("\n");
}

export function selectGoodFirstIssues(options: {
  openItems: readonly GitHubIssueResponse[];
  repository: string;
  labelsSearched: string[];
  limit: number;
}): GoodFirstIssueResult {
  const soughtLabels = new Set(
    options.labelsSearched.map((label) => label.toLowerCase()),
  );
  const matches = options.openItems.flatMap((issue) => {
    if (issue.pull_request !== undefined) {
      return [];
    }

    const labels = normalizedLabels(issue);
    const matchingLabels = labels.filter((label) =>
      soughtLabels.has(label.toLowerCase()),
    );
    if (matchingLabels.length === 0) {
      return [];
    }

    return [
      {
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        labels,
        comments: issue.comments,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        reason: matchingLabels.join(", "),
      },
    ];
  });
  const issues = matches.slice(0, options.limit);

  return {
    repository: options.repository,
    labelsSearched: options.labelsSearched,
    openIssuesScanned: options.openItems.length,
    totalMatches: matches.length,
    returned: issues.length,
    issues,
  };
}

export function registerFindGoodFirstIssuesTool(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerTool(
    "find_good_first_issues",
    {
      title: "Find Good First Issues",
      description:
        "Find open, non-pull-request issues labeled good first issue and optionally help wanted in a GitHub repository.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ owner, repository, limit, includeHelpWanted }) => {
      const openItems = await githubClient.listOpenIssues(owner, repository);
      const labelsSearched = includeHelpWanted
        ? ["good first issue", "help wanted"]
        : ["good first issue"];
      const result = selectGoodFirstIssues({
        openItems,
        repository: `${owner}/${repository}`,
        labelsSearched,
        limit,
      });

      return {
        content: [{ type: "text", text: formatResult(result) }],
        structuredContent: result,
      };
    },
  );
}
