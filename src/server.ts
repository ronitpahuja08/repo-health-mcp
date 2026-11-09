import { McpServer } from "@modelcontextprotocol/server";

import { loadConfig } from "./config.js";
import { GitHubClient } from "./github/client.js";
import { registerAnalyzeProjectHealthTool } from "./tools/analyze-project-health.js";
import { registerFindGoodFirstIssuesTool } from "./tools/find-good-first-issues.js";
import { registerInspectRepositoryTool } from "./tools/inspect-repository.js";
import { registerSummarizeReleasesTool } from "./tools/summarize-releases.js";

export const SERVER_NAME = "repo-health";
export const SERVER_VERSION = "0.1.0";

/**
 * Create an isolated server instance for a single MCP connection.
 * Tool, resource, and prompt registration is added through this factory.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    title: "Repo Health MCP",
    description:
      "Evaluate GitHub repository maintenance, documentation, and contribution readiness.",
  });

  const githubClient = new GitHubClient(loadConfig().github);
  registerInspectRepositoryTool(server, githubClient);
  registerAnalyzeProjectHealthTool(server, githubClient);
  registerFindGoodFirstIssuesTool(server, githubClient);
  registerSummarizeReleasesTool(server, githubClient);

  return server;
}
