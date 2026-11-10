import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/server";

import type { GitHubClient } from "../github/client.js";
import { getContributorActivity } from "../tools/analyze-contributor-activity.js";
import { getReleaseSummary } from "../tools/summarize-releases.js";

function value(
  variable: string | string[] | undefined,
  field: string,
): string {
  if (typeof variable !== "string" || variable.length === 0) {
    throw new Error(`Missing ${field} in repository activity resource URI.`);
  }

  return variable;
}

function repositoryVariables(variables: Record<string, string | string[]>): {
  owner: string;
  repository: string;
} {
  return {
    owner: value(variables.owner, "owner"),
    repository: value(variables.repository, "repository"),
  };
}

function jsonResource(uri: URL, valueToSerialize: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json" as const,
        text: JSON.stringify(valueToSerialize, null, 2),
      },
    ],
  };
}

export function registerRepositoryActivityResources(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerResource(
    "repository-releases",
    new ResourceTemplate(
      "repo-health://{owner}/{repository}/releases",
      { list: undefined },
    ),
    {
      title: "GitHub Repository Releases",
      description:
        "The five most recent stable releases and the repository's release cadence.",
      mimeType: "application/json",
    },
    async (uri, variables) =>
      jsonResource(
        uri,
        await getReleaseSummary(
          githubClient,
          repositoryVariables(variables),
        ),
      ),
  );

  server.registerResource(
    "repository-contributors",
    new ResourceTemplate(
      "repo-health://{owner}/{repository}/contributors",
      { list: undefined },
    ),
    {
      title: "GitHub Repository Contributor Activity",
      description:
        "A 90-day view of commit volume, active days, and contributor concentration.",
      mimeType: "application/json",
    },
    async (uri, variables) =>
      jsonResource(
        uri,
        await getContributorActivity(
          githubClient,
          repositoryVariables(variables),
        ),
      ),
  );
}
