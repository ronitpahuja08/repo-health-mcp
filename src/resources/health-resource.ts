import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/server";

import { analyzeProjectHealth } from "../analysis/health-score.js";
import type { GitHubClient } from "../github/client.js";
import { inspectRepository } from "../tools/inspect-repository.js";

function templateValue(
  value: string | string[] | undefined,
  field: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${field} in repository health resource URI.`);
  }

  return value;
}

/**
 * Expose a complete health report as model-readable JSON.
 *
 * URI pattern: repo-health://{owner}/{repository}
 */
export function registerRepositoryHealthResource(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  const template = new ResourceTemplate(
    "repo-health://{owner}/{repository}",
    { list: undefined },
  );

  server.registerResource(
    "repository-health",
    template,
    {
      title: "GitHub Repository Health Report",
      description:
        "A structured repository health score with category evidence, strengths, and recommended improvements.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const owner = templateValue(variables.owner, "owner");
      const repository = templateValue(
        variables.repository,
        "repository",
      );
      const inspection = await inspectRepository(
        githubClient,
        owner,
        repository,
      );
      const report = analyzeProjectHealth(inspection);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    },
  );
}
