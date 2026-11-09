import type { McpServer } from "@modelcontextprotocol/server";

import {
  analyzeProjectHealth,
  projectHealthAnalysisSchema,
  type ProjectHealthAnalysis,
} from "../analysis/health-score.js";
import type { GitHubClient } from "../github/client.js";
import {
  inspectRepository,
  repositoryInputSchema,
} from "./inspect-repository.js";

function formatHealthAnalysis(analysis: ProjectHealthAnalysis): string {
  const categoryLines = analysis.categories.map(
    (category) =>
      `- ${category.label}: ${category.score}/${category.maxScore}`,
  );
  const recommendationLines = analysis.recommendations.map(
    (recommendation) => `- ${recommendation}`,
  );

  return [
    `Repository: ${analysis.repository.fullName}`,
    `Health score: ${analysis.score}/${analysis.maxScore}`,
    `Rating: ${analysis.grade}`,
    "",
    "Categories:",
    ...categoryLines,
    "",
    "Recommended improvements:",
    ...(recommendationLines.length > 0
      ? recommendationLines
      : ["- No immediate improvements identified."]),
    "",
    analysis.summary,
  ].join("\n");
}

export function registerAnalyzeProjectHealthTool(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerTool(
    "analyze_project_health",
    {
      title: "Analyze GitHub Project Health",
      description:
        "Calculate an explainable 0–100 repository health score from maintenance activity, community files, and project metadata.",
      inputSchema: repositoryInputSchema,
      outputSchema: projectHealthAnalysisSchema,
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
      const analysis = analyzeProjectHealth(inspection);

      return {
        content: [{ type: "text", text: formatHealthAnalysis(analysis) }],
        structuredContent: analysis,
      };
    },
  );
}
