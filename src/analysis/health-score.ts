import { z } from "zod";

import type { RepositoryInspection } from "../tools/inspect-repository.js";

const healthSignalSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["pass", "partial", "fail"]),
  score: z.number().int().nonnegative(),
  maxScore: z.number().int().positive(),
  evidence: z.string(),
  recommendation: z.string().nullable(),
});

const healthCategorySchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number().int().nonnegative(),
  maxScore: z.number().int().positive(),
  signals: z.array(healthSignalSchema),
});

export const projectHealthAnalysisSchema = z.object({
  repository: z.object({
    fullName: z.string(),
    url: z.string(),
  }),
  score: z.number().int().min(0).max(100),
  maxScore: z.literal(100),
  grade: z.enum(["excellent", "healthy", "mixed", "at-risk"]),
  summary: z.string(),
  categories: z.array(healthCategorySchema),
  strengths: z.array(z.string()),
  recommendations: z.array(z.string()),
  generatedAt: z.string(),
});

export type HealthSignal = z.infer<typeof healthSignalSchema>;
export type HealthCategory = z.infer<typeof healthCategorySchema>;
export type ProjectHealthAnalysis = z.infer<
  typeof projectHealthAnalysisSchema
>;

function binarySignal(options: {
  key: string;
  label: string;
  present: boolean;
  maxScore: number;
  evidence: string;
  recommendation: string;
}): HealthSignal {
  return {
    key: options.key,
    label: options.label,
    status: options.present ? "pass" : "fail",
    score: options.present ? options.maxScore : 0,
    maxScore: options.maxScore,
    evidence: options.evidence,
    recommendation: options.present ? null : options.recommendation,
  };
}

function ageInDays(timestamp: string | null, nowMs: number): number | null {
  if (timestamp === null) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.floor((nowMs - parsed) / 86_400_000))
    : null;
}

function recencySignal(options: {
  key: string;
  label: string;
  timestamp: string | null;
  nowMs: number;
  maxScore: number;
  freshDays: number;
  acceptableDays: number;
  recommendation: string;
}): HealthSignal {
  const ageDays = ageInDays(options.timestamp, options.nowMs);
  if (ageDays === null) {
    return {
      key: options.key,
      label: options.label,
      status: "fail",
      score: 0,
      maxScore: options.maxScore,
      evidence: "No valid activity timestamp was available.",
      recommendation: options.recommendation,
    };
  }

  if (ageDays <= options.freshDays) {
    return {
      key: options.key,
      label: options.label,
      status: "pass",
      score: options.maxScore,
      maxScore: options.maxScore,
      evidence: `Activity occurred ${ageDays} day(s) ago.`,
      recommendation: null,
    };
  }

  if (ageDays <= options.acceptableDays) {
    return {
      key: options.key,
      label: options.label,
      status: "partial",
      score: Math.ceil(options.maxScore / 2),
      maxScore: options.maxScore,
      evidence: `Activity occurred ${ageDays} day(s) ago.`,
      recommendation: options.recommendation,
    };
  }

  return {
    key: options.key,
    label: options.label,
    status: "fail",
    score: 0,
    maxScore: options.maxScore,
    evidence: `Activity occurred ${ageDays} day(s) ago.`,
    recommendation: options.recommendation,
  };
}

function buildCategory(
  key: string,
  label: string,
  signals: HealthSignal[],
): HealthCategory {
  return {
    key,
    label,
    score: signals.reduce((total, signal) => total + signal.score, 0),
    maxScore: signals.reduce((total, signal) => total + signal.maxScore, 0),
    signals,
  };
}

function gradeForScore(score: number): ProjectHealthAnalysis["grade"] {
  if (score >= 85) return "excellent";
  if (score >= 70) return "healthy";
  if (score >= 50) return "mixed";
  return "at-risk";
}

export function analyzeProjectHealth(
  inspection: RepositoryInspection,
  now: Date = new Date(),
): ProjectHealthAnalysis {
  const nowMs = now.getTime();
  const operational =
    !inspection.activity.archived && !inspection.activity.disabled;

  const activity = buildCategory("activity", "Maintenance activity", [
    binarySignal({
      key: "operational",
      label: "Repository is operational",
      present: operational,
      maxScore: 10,
      evidence: operational
        ? "The repository is neither archived nor disabled."
        : "The repository is archived or disabled.",
      recommendation: "Restore active maintenance or clearly document archival status.",
    }),
    recencySignal({
      key: "recent-push",
      label: "Recent code activity",
      timestamp: inspection.activity.pushedAt,
      nowMs,
      maxScore: 20,
      freshDays: 30,
      acceptableDays: 180,
      recommendation: "Publish a maintenance update or clarify the project's support status.",
    }),
    recencySignal({
      key: "recent-update",
      label: "Recently updated repository metadata",
      timestamp: inspection.activity.updatedAt,
      nowMs,
      maxScore: 10,
      freshDays: 90,
      acceptableDays: 365,
      recommendation: "Refresh repository metadata and maintenance documentation.",
    }),
  ]);

  const files = inspection.community.files;
  const community = buildCategory("community", "Community readiness", [
    binarySignal({
      key: "readme",
      label: "README available",
      present: files.readme,
      maxScore: 10,
      evidence: files.readme ? "A README is present." : "No README was detected.",
      recommendation: "Add a README with purpose, setup, usage, and support expectations.",
    }),
    binarySignal({
      key: "license",
      label: "License available",
      present: files.license,
      maxScore: 8,
      evidence: files.license ? "A license is present." : "No license was detected.",
      recommendation: "Add an explicit open-source license.",
    }),
    binarySignal({
      key: "contributing",
      label: "Contribution guide available",
      present: files.contributing,
      maxScore: 8,
      evidence: files.contributing
        ? "A contribution guide is present."
        : "No contribution guide was detected.",
      recommendation: "Document the development and contribution workflow.",
    }),
    binarySignal({
      key: "code-of-conduct",
      label: "Code of conduct available",
      present: files.codeOfConduct,
      maxScore: 5,
      evidence: files.codeOfConduct
        ? "A code of conduct is present."
        : "No code of conduct was detected.",
      recommendation: "Add a code of conduct for community participation.",
    }),
    binarySignal({
      key: "issue-template",
      label: "Issue template available",
      present: files.issueTemplate,
      maxScore: 5,
      evidence: files.issueTemplate
        ? "An issue template is present."
        : "No issue template was detected.",
      recommendation: "Add issue templates that request reproducible information.",
    }),
    binarySignal({
      key: "pull-request-template",
      label: "Pull request template available",
      present: files.pullRequestTemplate,
      maxScore: 4,
      evidence: files.pullRequestTemplate
        ? "A pull request template is present."
        : "No pull request template was detected.",
      recommendation: "Add a pull request template with verification and review prompts.",
    }),
  ]);

  const topicCount = inspection.repository.topics.length;
  const topicScore = topicCount >= 3 ? 5 : topicCount > 0 ? 3 : 0;
  const metadata = buildCategory("metadata", "Project discoverability", [
    binarySignal({
      key: "description",
      label: "Repository description available",
      present: inspection.repository.description !== null,
      maxScore: 5,
      evidence:
        inspection.repository.description ?? "No repository description was provided.",
      recommendation: "Add a concise repository description.",
    }),
    binarySignal({
      key: "documentation",
      label: "Documentation link available",
      present: inspection.community.documentation !== null,
      maxScore: 5,
      evidence:
        inspection.community.documentation ?? "No documentation URL was detected.",
      recommendation: "Link to maintained documentation from the repository profile.",
    }),
    binarySignal({
      key: "primary-language",
      label: "Primary language detected",
      present: inspection.repository.primaryLanguage !== null,
      maxScore: 5,
      evidence:
        inspection.repository.primaryLanguage ?? "No primary language was detected.",
      recommendation: "Add source code or configure language detection appropriately.",
    }),
    {
      key: "topics",
      label: "Repository topics available",
      status: topicScore === 5 ? "pass" : topicScore > 0 ? "partial" : "fail",
      score: topicScore,
      maxScore: 5,
      evidence: `${topicCount} repository topic(s) detected.`,
      recommendation:
        topicScore === 5
          ? null
          : "Add at least three accurate topics to improve discovery.",
    },
  ]);

  const categories = [activity, community, metadata];
  const score = categories.reduce(
    (total, category) => total + category.score,
    0,
  );
  const grade = gradeForScore(score);
  const signals = categories.flatMap((category) => category.signals);
  const strengths = signals
    .filter((signal) => signal.status === "pass")
    .map((signal) => signal.label);
  const recommendations = signals.flatMap((signal) =>
    signal.recommendation === null ? [] : [signal.recommendation],
  );

  return {
    repository: {
      fullName: inspection.repository.fullName,
      url: inspection.repository.url,
    },
    score,
    maxScore: 100,
    grade,
    summary: `${inspection.repository.fullName} scored ${score}/100 and is rated ${grade}. ${strengths.length} strength(s) and ${recommendations.length} improvement(s) were identified.`,
    categories,
    strengths,
    recommendations,
    generatedAt: now.toISOString(),
  };
}
