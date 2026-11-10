import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const repositoryFields = {
  owner: z.string().min(1).describe("GitHub repository owner"),
  repository: z.string().min(1).describe("GitHub repository name"),
};

export function registerProjectEvaluationPrompts(server: McpServer): void {
  server.registerPrompt(
    "evaluate_project",
    {
      title: "Evaluate a GitHub Project",
      description:
        "Create an evidence-based health and contributor-readiness evaluation for one repository.",
      argsSchema: z.object({
        ...repositoryFields,
        focus: z
          .enum(["overall", "maintenance", "community", "contributors"])
          .default("overall")
          .describe("Area to emphasize in the final evaluation"),
      }),
    },
    ({ owner, repository, focus }) => ({
      description: `Evaluate ${owner}/${repository} with emphasis on ${focus}.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Evaluate the GitHub repository ${owner}/${repository}.`,
              `Emphasize the ${focus} dimension without ignoring critical findings elsewhere.`,
              "Use inspect_repository, analyze_project_health, and check_repository_readiness before drawing conclusions.",
              "Use analyze_contributor_activity when contributor evidence is relevant.",
              "Separate observed evidence from interpretation, explain the score, and finish with three prioritized actions.",
              "Do not infer missing repository data or recommend changes that the tool evidence does not support.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "compare_project_health",
    {
      title: "Compare GitHub Project Health",
      description:
        "Compare two repositories using the same health model and clearly explain the trade-offs.",
      argsSchema: z.object({
        leftOwner: z.string().min(1),
        leftRepository: z.string().min(1),
        rightOwner: z.string().min(1),
        rightRepository: z.string().min(1),
      }),
    },
    ({
      leftOwner,
      leftRepository,
      rightOwner,
      rightRepository,
    }) => ({
      description: `Compare ${leftOwner}/${leftRepository} with ${rightOwner}/${rightRepository}.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Compare ${leftOwner}/${leftRepository} and ${rightOwner}/${rightRepository}.`,
              "Call compare_repositories so both projects are scored with the same model.",
              "Explain category-level differences, shared languages, and meaningful ties.",
              "Identify which repository is stronger for maintenance and which is easier for a new contributor to approach.",
              "Do not treat stars as a substitute for project health, and clearly label any inference.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
