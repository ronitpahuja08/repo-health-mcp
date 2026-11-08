import { McpServer } from "@modelcontextprotocol/server";

export const SERVER_NAME = "github-project-health";
export const SERVER_VERSION = "0.1.0";

/**
 * Create an isolated server instance for a single MCP connection.
 * Tool, resource, and prompt registration is added through this factory.
 */
export function createServer(): McpServer {
  return new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    title: "GitHub Project Health",
    description:
      "Evaluate GitHub repository maintenance, documentation, and contribution readiness.",
  });
}
