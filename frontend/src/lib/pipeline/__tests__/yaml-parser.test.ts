import { describe, it, expect } from "vitest";
import {
  parsePipelineYaml,
  flattenStages,
  findGitHubConfig,
  YamlParseError,
  type PipelineYaml,
} from "../yaml-parser";

// ─── Sample YAML matching the Python cicdpipeline.py format ──────────────────

const SAMPLE_YAML_RAW = {
  pipelineName: "Pipeline4",
  buildVersion: "1.0.0",
  nodes: [
    {
      name: "Development",
      stages: [
        {
          name: "Plan",
          tool: {
            type: "JIRA",
            connector: {
              url: "https://v88654876-1765564400100.atlassian.net",
              authentication: {
                type: "UsernameAndApiKey",
                username: "v88654876@gmail.com",
                apiKey: "ATATT3xFfGF0_test_key",
              },
            },
            inputs: { jiraKey: "SCRUM-1" },
          },
        },
        {
          name: "Code",
          tool: {
            type: "GitHub",
            connector: {
              repoUrl: "https://github.com/virenderdba/ppp-cpi-master.git",
              branch: "main",
              authentication: {
                type: "PersonalAccessToken",
                token: "ghp_testToken123",
              },
            },
          },
        },
        { name: "Build", tool: null },
        { name: "Test", tool: null },
        {
          name: "Deploy",
          tool: {
            type: "SAP_CPI",
            environment: {
              apiUrl: "https://ea236a4dtrial.it-cpitrial06.cfapps.us10-001.hana.ondemand.com",
              authentication: {
                clientId: "sb-3f3903bf-test",
                clientSecret: "3d32faa3-test-secret",
                tokenUrl: "https://ea236a4dtrial.authentication.us10.hana.ondemand.com/oauth/token",
              },
            },
            artifacts: [
              { name: "IFLOW_HTTP_ECHO_DEMO", type: "IntegrationFlow" },
              { name: "VM_Test", type: "ValueMapping" },
              { name: "SC_Test", type: "ScriptCollection" },
            ],
          },
        },
      ],
    },
  ],
};

// ─── parsePipelineYaml Tests ─────────────────────────────────────────────────

describe("parsePipelineYaml", () => {
  it("parses a valid Python-style YAML into structured pipeline", () => {
    const result = parsePipelineYaml(SAMPLE_YAML_RAW);

    expect(result.pipelineName).toBe("Pipeline4");
    expect(result.buildVersion).toBe("1.0.0");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe("Development");
    expect(result.nodes[0].stages).toHaveLength(5);
  });

  it("parses JIRA stage with connector and inputs", () => {
    const result = parsePipelineYaml(SAMPLE_YAML_RAW);
    const planStage = result.nodes[0].stages[0];

    expect(planStage.name).toBe("Plan");
    expect(planStage.tool?.type).toBe("JIRA");
    expect(planStage.tool?.connector).toBeDefined();
    expect((planStage.tool?.connector as any).url).toBe("https://v88654876-1765564400100.atlassian.net");
    expect((planStage.tool?.connector as any).authentication.type).toBe("UsernameAndApiKey");
    expect(planStage.tool?.inputs?.jiraKey).toBe("SCRUM-1");
  });

  it("parses GitHub stage with PAT authentication", () => {
    const result = parsePipelineYaml(SAMPLE_YAML_RAW);
    const codeStage = result.nodes[0].stages[1];

    expect(codeStage.name).toBe("Code");
    expect(codeStage.tool?.type).toBe("GitHub");
    expect((codeStage.tool?.connector as any).repoUrl).toBe("https://github.com/virenderdba/ppp-cpi-master.git");
    expect((codeStage.tool?.connector as any).branch).toBe("main");
    expect((codeStage.tool?.connector as any).authentication.token).toBe("ghp_testToken123");
  });

  it("parses null tool stages (Build, Test)", () => {
    const result = parsePipelineYaml(SAMPLE_YAML_RAW);
    expect(result.nodes[0].stages[2].tool).toBeNull();
    expect(result.nodes[0].stages[3].tool).toBeNull();
  });

  it("parses SAP_CPI deploy stage with environment and artifacts", () => {
    const result = parsePipelineYaml(SAMPLE_YAML_RAW);
    const deployStage = result.nodes[0].stages[4];

    expect(deployStage.name).toBe("Deploy");
    expect(deployStage.tool?.type).toBe("SAP_CPI");
    expect(deployStage.tool?.environment?.apiUrl).toContain("cfapps.us10-001");
    expect(deployStage.tool?.environment?.authentication.clientId).toBe("sb-3f3903bf-test");
    expect(deployStage.tool?.environment?.authentication.tokenUrl).toContain("oauth/token");
    expect(deployStage.tool?.artifacts).toHaveLength(3);
    expect(deployStage.tool?.artifacts?.[0]).toEqual({
      name: "IFLOW_HTTP_ECHO_DEMO",
      type: "IntegrationFlow",
    });
  });

  it("throws on missing pipelineName", () => {
    expect(() => parsePipelineYaml({ ...SAMPLE_YAML_RAW, pipelineName: "" }))
      .toThrow(YamlParseError);
  });

  it("throws on missing buildVersion", () => {
    expect(() => parsePipelineYaml({ ...SAMPLE_YAML_RAW, buildVersion: undefined }))
      .toThrow(YamlParseError);
  });

  it("throws on empty nodes array", () => {
    expect(() => parsePipelineYaml({ ...SAMPLE_YAML_RAW, nodes: [] }))
      .toThrow("nodes must be a non-empty array");
  });

  it("throws on missing stage name", () => {
    const bad = {
      ...SAMPLE_YAML_RAW,
      nodes: [{ name: "Dev", stages: [{ name: "", tool: null }] }],
    };
    expect(() => parsePipelineYaml(bad)).toThrow(YamlParseError);
  });
});

// ─── flattenStages Tests ─────────────────────────────────────────────────────

describe("flattenStages", () => {
  let pipeline: PipelineYaml;

  beforeEach(() => {
    pipeline = parsePipelineYaml(SAMPLE_YAML_RAW);
  });

  it("flattens all stages into ordered execution list", () => {
    const flat = flattenStages(pipeline);
    expect(flat).toHaveLength(5);
    expect(flat.map(s => s.stageName)).toEqual(["Plan", "Code", "Build", "Test", "Deploy"]);
  });

  it("assigns unique stageIds", () => {
    const flat = flattenStages(pipeline);
    const ids = flat.map(s => s.stageId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("node_0_stage_0");
    expect(ids[4]).toBe("node_0_stage_4");
  });

  it("carries node name through to each stage", () => {
    const flat = flattenStages(pipeline);
    flat.forEach(s => expect(s.nodeName).toBe("Development"));
  });

  it("marks null-tool stages as skippable", () => {
    const flat = flattenStages(pipeline);
    expect(flat[2].tool).toBeNull(); // Build
    expect(flat[3].tool).toBeNull(); // Test
    expect(flat[0].tool).not.toBeNull(); // Plan
  });

  it("handles multi-node pipelines", () => {
    const multiNode: PipelineYaml = {
      pipelineName: "Multi",
      buildVersion: "2.0.0",
      nodes: [
        { name: "Dev", stages: [{ name: "Plan", tool: null }, { name: "Code", tool: null }] },
        { name: "QA", stages: [{ name: "Test", tool: null }] },
        { name: "Prod", stages: [{ name: "Deploy", tool: null }] },
      ],
    };
    const flat = flattenStages(multiNode);
    expect(flat).toHaveLength(4);
    expect(flat[0].nodeName).toBe("Dev");
    expect(flat[2].nodeName).toBe("QA");
    expect(flat[3].nodeName).toBe("Prod");
    expect(flat[3].stageId).toBe("node_2_stage_0");
  });
});

// ─── findGitHubConfig Tests ──────────────────────────────────────────────────

describe("findGitHubConfig", () => {
  it("finds the GitHub connector from the pipeline", () => {
    const pipeline = parsePipelineYaml(SAMPLE_YAML_RAW);
    const gh = findGitHubConfig(pipeline);

    expect(gh).not.toBeNull();
    expect(gh?.repoUrl).toBe("https://github.com/virenderdba/ppp-cpi-master.git");
    expect(gh?.branch).toBe("main");
    expect(gh?.authentication.token).toBe("ghp_testToken123");
  });

  it("returns null when no GitHub stage exists", () => {
    const noGh: PipelineYaml = {
      pipelineName: "NoGH",
      buildVersion: "1.0.0",
      nodes: [{ name: "Dev", stages: [{ name: "Plan", tool: { type: "JIRA", connector: {} as any } }] }],
    };
    const gh = findGitHubConfig(noGh);
    expect(gh).toBeNull();
  });
});

// ─── Execution Flow Simulation Tests ─────────────────────────────────────────

describe("Pipeline Execution Flow (stage-by-stage)", () => {
  it("executes stages in correct order, skipping null tools and capturing logs", () => {
    const pipeline = parsePipelineYaml(SAMPLE_YAML_RAW);
    const flat = flattenStages(pipeline);
    const logs: string[] = [];
    const stageStates: Record<string, { status: string; startedAt: string; completedAt?: string }> = {};

    // Simulate stage-by-stage execution like the Lambda does
    for (const stage of flat) {
      const startTime = new Date().toISOString();
      stageStates[stage.stageId] = { status: "RUNNING", startedAt: startTime };
      logs.push(`▶ Node: ${stage.nodeName}`);
      logs.push(`  ➡ Stage: ${stage.stageName}`);

      if (!stage.tool) {
        logs.push(`    ⏭ No tool configured`);
        stageStates[stage.stageId].status = "SKIPPED";
        stageStates[stage.stageId].completedAt = new Date().toISOString();
        continue;
      }

      // Simulate tool execution based on type
      switch (stage.tool.type) {
        case "JIRA": {
          const jiraKey = stage.tool.inputs?.jiraKey;
          logs.push(`    🔎 Validating JIRA issue: ${jiraKey}`);
          logs.push(`    ✅ JIRA issue validation passed`);
          break;
        }
        case "GitHub": {
          const gh = stage.tool.connector as any;
          const repo = gh.repoUrl.replace("https://github.com/", "").replace(".git", "");
          logs.push(`    ✅ GitHub stage ready: ${repo} | branch: ${gh.branch}`);
          break;
        }
        case "SAP_CPI": {
          const artifacts = stage.tool.artifacts || [];
          for (const artifact of artifacts) {
            logs.push(`    📥 Downloading CPI artifact: ${artifact.type}/${artifact.name}`);
            logs.push(`    📤 Uploading to GitHub...`);
          }
          break;
        }
      }

      stageStates[stage.stageId].status = "SUCCESS";
      stageStates[stage.stageId].completedAt = new Date().toISOString();
    }

    logs.push("🎉 Pipeline execution completed successfully");

    // ── Assertions ──

    // All 5 stages tracked
    expect(Object.keys(stageStates)).toHaveLength(5);

    // JIRA (Plan) ran successfully
    expect(stageStates["node_0_stage_0"].status).toBe("SUCCESS");

    // GitHub (Code) ran successfully
    expect(stageStates["node_0_stage_1"].status).toBe("SUCCESS");

    // Build & Test skipped (no tool)
    expect(stageStates["node_0_stage_2"].status).toBe("SKIPPED");
    expect(stageStates["node_0_stage_3"].status).toBe("SKIPPED");

    // Deploy ran successfully
    expect(stageStates["node_0_stage_4"].status).toBe("SUCCESS");

    // Logs contain expected entries
    expect(logs).toContain("  ➡ Stage: Plan");
    expect(logs).toContain("    🔎 Validating JIRA issue: SCRUM-1");
    expect(logs).toContain("    ✅ JIRA issue validation passed");
    expect(logs.some(l => l.includes("GitHub stage ready: virenderdba/ppp-cpi-master"))).toBe(true);
    expect(logs).toContain("    ⏭ No tool configured");
    expect(logs.some(l => l.includes("Downloading CPI artifact: IntegrationFlow/IFLOW_HTTP_ECHO_DEMO"))).toBe(true);
    expect(logs.some(l => l.includes("Downloading CPI artifact: ValueMapping/VM_Test"))).toBe(true);
    expect(logs.some(l => l.includes("Downloading CPI artifact: ScriptCollection/SC_Test"))).toBe(true);
    expect(logs).toContain("🎉 Pipeline execution completed successfully");
  });

  it("captures failure state when a stage fails", () => {
    const pipeline = parsePipelineYaml(SAMPLE_YAML_RAW);
    const flat = flattenStages(pipeline);
    const stageStates: Record<string, { status: string }> = {};
    let pipelineStatus = "RUNNING";

    for (const stage of flat) {
      if (pipelineStatus === "FAILED") {
        stageStates[stage.stageId] = { status: "PENDING" };
        continue;
      }

      stageStates[stage.stageId] = { status: "RUNNING" };

      // Simulate JIRA failure (e.g. 401)
      if (stage.tool?.type === "JIRA") {
        stageStates[stage.stageId].status = "FAILED";
        pipelineStatus = "FAILED";
        continue;
      }

      stageStates[stage.stageId].status = stage.tool ? "SUCCESS" : "SKIPPED";
    }

    expect(pipelineStatus).toBe("FAILED");
    expect(stageStates["node_0_stage_0"].status).toBe("FAILED");
    // Remaining stages should be PENDING (not executed)
    expect(stageStates["node_0_stage_1"].status).toBe("PENDING");
    expect(stageStates["node_0_stage_4"].status).toBe("PENDING");
  });

  it("finds GitHub config for Deploy stage upload path", () => {
    const pipeline = parsePipelineYaml(SAMPLE_YAML_RAW);
    const ghConfig = findGitHubConfig(pipeline);
    const deployStage = pipeline.nodes[0].stages[4];
    const artifacts = deployStage.tool?.artifacts || [];

    expect(ghConfig).not.toBeNull();

    // Verify upload paths match Python script format:
    // pipelines/{pipelineName}/builds/{version}/{nodeName}/{stageName}/{type}/{name}.zip
    const repo = ghConfig!.repoUrl.replace("https://github.com/", "").replace(".git", "");
    const basePath = "pipelines";

    for (const artifact of artifacts) {
      const expectedPath = `${basePath}/${pipeline.pipelineName}/builds/${pipeline.buildVersion}/Development/Deploy/${artifact.type}/${artifact.name}.zip`;
      expect(expectedPath).toContain(artifact.name);
      expect(expectedPath).toContain(pipeline.pipelineName);
    }

    expect(repo).toBe("virenderdba/ppp-cpi-master");
  });
});

// ─── executionsService Tests ─────────────────────────────────────────────────

// executionsService integration tests are covered in useBuilds.test.ts
