import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  analyzeProjectHealth,
  type ProjectHealthAnalysis,
} from "../analysis/health-score.js";
import type { GitHubClient } from "../github/client.js";
import {
  inspectRepository,
  repositoryInputSchema,
  type RepositoryInspection,
} from "./inspect-repository.js";

const inputSchema = z.object({
  left: repositoryInputSchema,
  right: repositoryInputSchema,
});

const repositorySummarySchema = z.object({
  fullName: z.string(),
  url: z.string(),
  healthScore: z.number().int().min(0).max(100),
  grade: z.enum(["excellent", "healthy", "mixed", "at-risk"]),
  lastPushAt: z.string().nullable(),
  communityHealthPercentage: z.number().min(0).max(100),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  openIssues: z.number().int().nonnegative(),
  primaryLanguage: z.string().nullable(),
});

const categoryComparisonSchema = z.object({
  category: z.string(),
  label: z.string(),
  leftScore: z.number().int().nonnegative(),
  rightScore: z.number().int().nonnegative(),
  maxScore: z.number().int().positive(),
  winner: z.enum(["left", "right", "tie"]),
});

const outputSchema = z.object({
  left: repositorySummarySchema,
  right: repositorySummarySchema,
  healthScoreDifference: z.number().int(),
  overallWinner: z.enum(["left", "right", "tie"]),
  categoryComparisons: z.array(categoryComparisonSchema),
  sharedLanguages: z.array(z.string()),
  summary: z.string(),
});

export type RepositoryComparison = z.infer<typeof outputSchema>;

function winner(left: number, right: number): "left" | "right" | "tie" {
  if (left > right) return "left";
  if (right > left) return "right";
  return "tie";
}

function repositorySummary(
  inspection: RepositoryInspection,
  health: ProjectHealthAnalysis,
): z.infer<typeof repositorySummarySchema> {
  return {
    fullName: inspection.repository.fullName,
    url: inspection.repository.url,
    healthScore: health.score,
    grade: health.grade,
    lastPushAt: inspection.activity.pushedAt,
    communityHealthPercentage: inspection.community.healthPercentage,
    stars: inspection.popularity.stars,
    forks: inspection.popularity.forks,
    openIssues: inspection.popularity.openIssues,
    primaryLanguage: inspection.repository.primaryLanguage,
  };
}

export function compareRepositoryEvidence(options: {
  leftInspection: RepositoryInspection;
  rightInspection: RepositoryInspection;
  now?: Date;
}): RepositoryComparison {
  const now = options.now ?? new Date();
  const leftHealth = analyzeProjectHealth(options.leftInspection, now);
  const rightHealth = analyzeProjectHealth(options.rightInspection, now);
  const rightCategories = new Map(
    rightHealth.categories.map((category) => [category.key, category]),
  );
  const categoryComparisons = leftHealth.categories.flatMap((leftCategory) => {
    const rightCategory = rightCategories.get(leftCategory.key);
    if (rightCategory === undefined) {
      return [];
    }

    return [
      {
        category: leftCategory.key,
        label: leftCategory.label,
        leftScore: leftCategory.score,
        rightScore: rightCategory.score,
        maxScore: leftCategory.maxScore,
        winner: winner(leftCategory.score, rightCategory.score),
      },
    ];
  });
  const leftLanguages = new Set(
    Object.keys(options.leftInspection.repository.languages),
  );
  const sharedLanguages = Object.keys(
    options.rightInspection.repository.languages,
  )
    .filter((language) => leftLanguages.has(language))
    .sort();
  const overallWinner = winner(leftHealth.score, rightHealth.score);
  const winnerText =
    overallWinner === "tie"
      ? "Both repositories have the same health score."
      : `${overallWinner === "left" ? options.leftInspection.repository.fullName : options.rightInspection.repository.fullName} has the higher health score.`;

  return {
    left: repositorySummary(options.leftInspection, leftHealth),
    right: repositorySummary(options.rightInspection, rightHealth),
    healthScoreDifference: leftHealth.score - rightHealth.score,
    overallWinner,
    categoryComparisons,
    sharedLanguages,
    summary: `${options.leftInspection.repository.fullName} scored ${leftHealth.score}/100; ${options.rightInspection.repository.fullName} scored ${rightHealth.score}/100. ${winnerText}`,
  };
}

function formatComparison(comparison: RepositoryComparison): string {
  return [
    `${comparison.left.fullName}: ${comparison.left.healthScore}/100 (${comparison.left.grade})`,
    `${comparison.right.fullName}: ${comparison.right.healthScore}/100 (${comparison.right.grade})`,
    "",
    "Category comparison:",
    ...comparison.categoryComparisons.map(
      (category) =>
        `- ${category.label}: ${category.leftScore} vs ${category.rightScore} (${category.winner})`,
    ),
    "",
    `Shared languages: ${comparison.sharedLanguages.join(", ") || "None detected"}`,
    comparison.summary,
  ].join("\n");
}

export function registerCompareRepositoriesTool(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerTool(
    "compare_repositories",
    {
      title: "Compare GitHub Repositories",
      description:
        "Compare two repositories using the same explainable health model, category evidence, activity, community readiness, and language data.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ left, right }) => {
      const [leftInspection, rightInspection] = await Promise.all([
        inspectRepository(githubClient, left.owner, left.repository),
        inspectRepository(githubClient, right.owner, right.repository),
      ]);
      const comparison = compareRepositoryEvidence({
        leftInspection,
        rightInspection,
      });

      return {
        content: [{ type: "text", text: formatComparison(comparison) }],
        structuredContent: comparison,
      };
    },
  );
}
