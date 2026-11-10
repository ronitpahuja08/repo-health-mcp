import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../src/server.js";

describe("Repo Health MCP capabilities", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it("advertises its complete tool, resource, and prompt surface", async () => {
    const server = createServer();
    const client = new Client({
      name: "repo-health-test-client",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    closers.push(() => client.close(), () => server.close());

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const [{ tools }, { resourceTemplates }, { prompts }] =
      await Promise.all([
        client.listTools(),
        client.listResourceTemplates(),
        client.listPrompts(),
      ]);

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "analyze_contributor_activity",
      "analyze_project_health",
      "check_repository_readiness",
      "compare_repositories",
      "find_good_first_issues",
      "inspect_repository",
      "summarize_recent_releases",
    ]);
    expect(
      resourceTemplates.map((resource) => resource.name).sort(),
    ).toEqual([
      "repository-contributors",
      "repository-health",
      "repository-releases",
    ]);
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual([
      "compare_project_health",
      "evaluate_project",
    ]);
    expect(
      tools.every((tool) => tool.annotations?.readOnlyHint === true),
    ).toBe(true);
  });
});
