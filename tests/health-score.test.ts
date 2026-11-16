import { describe, expect, it } from "vitest";

import { analyzeProjectHealth } from "../src/analysis/health-score.js";
import type { RepositoryInspection } from "../src/tools/inspect-repository.js";

function inspection(overrides: Partial<RepositoryInspection> = {}): RepositoryInspection {
  return {
    repository: {
      fullName: "octo-org/healthy-project",
      url: "https://github.com/octo-org/healthy-project",
      description: "An example project.",
      ownerType: "Organization",
      visibility: "public",
      defaultBranch: "main",
      primaryLanguage: "TypeScript",
      languages: { TypeScript: 1024 },
      topics: ["typescript", "mcp", "github"],
      sizeKb: 1024,
    },
    activity: {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      pushedAt: "2026-05-20T00:00:00.000Z",
      archived: false,
      disabled: false,
    },
    features: { issues: true, discussions: false, wiki: false, pages: false },
    popularity: { stars: 0, watchers: 0, forks: 0, openIssues: 0 },
    community: {
      healthPercentage: 100,
      description: "An example project.",
      documentation: "https://example.com/docs",
      files: {
        codeOfConduct: true,
        contributing: true,
        issueTemplate: true,
        license: true,
        pullRequestTemplate: true,
        readme: true,
      },
    },
    rateLimit: null,
    ...overrides,
  };
}

describe("analyzeProjectHealth", () => {
  it("produces an excellent score for a well-maintained project", () => {
    const analysis = analyzeProjectHealth(
      inspection(),
      new Date("2026-06-01T00:00:00.000Z"),
    );

    expect(analysis.score).toBe(100);
    expect(analysis.grade).toBe("excellent");
    expect(analysis.recommendations).toEqual([]);
    expect(analysis.generatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("reports actionable gaps for stale repositories with missing community files", () => {
    const base = inspection();
    const analysis = analyzeProjectHealth(
      inspection({
        activity: { ...base.activity, pushedAt: null, archived: true },
        repository: { ...base.repository, description: null, topics: [] },
        community: {
          ...base.community,
          documentation: null,
          files: { ...base.community.files, readme: false, license: false },
        },
      }),
      new Date("2026-06-01T00:00:00.000Z"),
    );

    expect(analysis.grade).toBe("at-risk");
    expect(analysis.recommendations).toContain(
      "Add a README with purpose, setup, usage, and support expectations.",
    );
    expect(analysis.recommendations).toContain(
      "Restore active maintenance or clearly document archival status.",
    );
  });
});
