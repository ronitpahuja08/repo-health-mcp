import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { GitHubClient } from "../github/client.js";
import {
  inspectRepository,
  repositoryInputSchema,
  type RepositoryInspection,
} from "./inspect-repository.js";

const readinessCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  category: z.enum(["project", "documentation", "community"]),
  required: z.boolean(),
  passed: z.boolean(),
  evidence: z.string(),
  action: z.string().nullable(),
});

const outputSchema = z.object({
  repository: z.string(),
  readyForContributors: z.boolean(),
  completionPercentage: z.number().int().min(0).max(100),
  passedChecks: z.number().int().nonnegative(),
  totalChecks: z.number().int().positive(),
  requiredChecksMissing: z.number().int().nonnegative(),
  checks: z.array(readinessCheckSchema),
  nextActions: z.array(z.string()),
});

export type RepositoryReadiness = z.infer<typeof outputSchema>;
type ReadinessCheck = z.infer<typeof readinessCheckSchema>;

function check(options: {
  key: string;
  label: string;
  category: ReadinessCheck["category"];
  required: boolean;
  passed: boolean;
  successEvidence: string;
  failureEvidence: string;
  action: string;
}): ReadinessCheck {
  return {
    key: options.key,
    label: options.label,
    category: options.category,
    required: options.required,
    passed: options.passed,
    evidence: options.passed
      ? options.successEvidence
      : options.failureEvidence,
    action: options.passed ? null : options.action,
  };
}

export function evaluateRepositoryReadiness(
  inspection: RepositoryInspection,
): RepositoryReadiness {
  const files = inspection.community.files;
  const operational =
    !inspection.activity.archived && !inspection.activity.disabled;
  const checks: ReadinessCheck[] = [
    check({
      key: "operational",
      label: "Repository accepts active work",
      category: "project",
      required: true,
      passed: operational,
      successEvidence: "The repository is active and enabled.",
      failureEvidence: "The repository is archived or disabled.",
      action: "Restore active maintenance or explain the archived status.",
    }),
    check({
      key: "issues-enabled",
      label: "Issue tracking is enabled",
      category: "project",
      required: true,
      passed: inspection.features.issues,
      successEvidence: "GitHub Issues is enabled.",
      failureEvidence: "GitHub Issues is disabled.",
      action: "Enable GitHub Issues or link to the external issue tracker.",
    }),
    check({
      key: "description",
      label: "Repository purpose is summarized",
      category: "documentation",
      required: false,
      passed: inspection.repository.description !== null,
      successEvidence: "A repository description is present.",
      failureEvidence: "No repository description was detected.",
      action: "Add a concise repository description.",
    }),
    check({
      key: "readme",
      label: "README is available",
      category: "documentation",
      required: true,
      passed: files.readme,
      successEvidence: "A README is present.",
      failureEvidence: "No README was detected.",
      action: "Add setup, usage, architecture, and support guidance to a README.",
    }),
    check({
      key: "license",
      label: "License is explicit",
      category: "documentation",
      required: true,
      passed: files.license,
      successEvidence: "A license file is present.",
      failureEvidence: "No license file was detected.",
      action: "Choose and add an explicit license.",
    }),
    check({
      key: "contributing",
      label: "Contribution workflow is documented",
      category: "community",
      required: true,
      passed: files.contributing,
      successEvidence: "A contribution guide is present.",
      failureEvidence: "No contribution guide was detected.",
      action: "Add CONTRIBUTING.md with setup, tests, and review expectations.",
    }),
    check({
      key: "code-of-conduct",
      label: "Community conduct is documented",
      category: "community",
      required: false,
      passed: files.codeOfConduct,
      successEvidence: "A code of conduct is present.",
      failureEvidence: "No code of conduct was detected.",
      action: "Add a code of conduct and enforcement contact.",
    }),
    check({
      key: "issue-template",
      label: "Issue reports are structured",
      category: "community",
      required: false,
      passed: files.issueTemplate,
      successEvidence: "An issue template is present.",
      failureEvidence: "No issue template was detected.",
      action: "Add issue templates for bugs and feature requests.",
    }),
    check({
      key: "pull-request-template",
      label: "Pull requests include verification prompts",
      category: "community",
      required: false,
      passed: files.pullRequestTemplate,
      successEvidence: "A pull request template is present.",
      failureEvidence: "No pull request template was detected.",
      action: "Add a pull request template with tests and review notes.",
    }),
    check({
      key: "topics",
      label: "Repository has discovery topics",
      category: "project",
      required: false,
      passed: inspection.repository.topics.length >= 3,
      successEvidence: `${inspection.repository.topics.length} topics are configured.`,
      failureEvidence: `${inspection.repository.topics.length} topics are configured.`,
      action: "Add at least three accurate repository topics.",
    }),
  ];
  const passedChecks = checks.filter((item) => item.passed).length;
  const requiredChecksMissing = checks.filter(
    (item) => item.required && !item.passed,
  ).length;

  return {
    repository: inspection.repository.fullName,
    readyForContributors: requiredChecksMissing === 0,
    completionPercentage: Math.round((passedChecks / checks.length) * 100),
    passedChecks,
    totalChecks: checks.length,
    requiredChecksMissing,
    checks,
    nextActions: checks.flatMap((item) =>
      item.action === null ? [] : [item.action],
    ),
  };
}

function formatReadiness(readiness: RepositoryReadiness): string {
  const missing = readiness.checks.filter((item) => !item.passed);
  return [
    `Repository: ${readiness.repository}`,
    `Contributor-ready: ${readiness.readyForContributors ? "Yes" : "No"}`,
    `Checklist completion: ${readiness.passedChecks}/${readiness.totalChecks} (${readiness.completionPercentage}%)`,
    `Required checks missing: ${readiness.requiredChecksMissing}`,
    "",
    "Missing or incomplete items:",
    ...(missing.length > 0
      ? missing.map(
          (item) =>
            `- ${item.label}${item.required ? " [required]" : ""}: ${item.action}`,
        )
      : ["- None"]),
  ].join("\n");
}

export function registerRepositoryReadinessTool(
  server: McpServer,
  githubClient: GitHubClient,
): void {
  server.registerTool(
    "check_repository_readiness",
    {
      title: "Check Repository Readiness",
      description:
        "Evaluate whether a repository is ready for outside contributors using an actionable documentation, project, and community checklist.",
      inputSchema: repositoryInputSchema,
      outputSchema,
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
      const readiness = evaluateRepositoryReadiness(inspection);

      return {
        content: [{ type: "text", text: formatReadiness(readiness) }],
        structuredContent: readiness,
      };
    },
  );
}
