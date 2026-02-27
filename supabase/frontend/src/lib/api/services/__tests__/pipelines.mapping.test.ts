import { describe, it, expect } from "vitest";
import type { Pipeline } from "@/hooks/usePipelines";

/**
 * Test the mapExternalPipeline logic inline since it's not extracted
 * into a service. We replicate the mapping function here to unit-test
 * the camelCase → snake_case transformation independently.
 */
function mapExternalPipeline(p: any): Pipeline {
  return {
    id: p.id,
    account_id: p.accountId ?? p.account_id ?? '',
    enterprise_id: p.enterpriseId ?? p.enterprise_id ?? '',
    name: p.name ?? '',
    description: p.description ?? null,
    status: p.status ?? 'draft',
    deployment_type: p.deploymentType ?? p.deployment_type ?? 'Integration',
    nodes: p.nodes ?? [],
    edges: p.edges ?? [],
    yaml_content: p.yamlContent ?? p.yaml_content ?? null,
    product_id: p.productId ?? p.product_id ?? null,
    service_ids: p.serviceIds ?? p.service_ids ?? null,
    created_by: p.createdBy ?? p.created_by ?? null,
    created_at: p.createdAt ?? p.created_at ?? '',
    updated_at: p.updatedAt ?? p.updated_at ?? '',
  };
}

describe("mapExternalPipeline", () => {
  it("maps camelCase API response to snake_case Pipeline", () => {
    const apiItem = {
      id: "p1",
      accountId: "a1",
      enterpriseId: "e1",
      name: "Deploy Pipeline",
      description: "Main deploy",
      status: "active",
      deploymentType: "CD",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
      yamlContent: "steps:\n  - build",
      productId: "prod1",
      serviceIds: ["s1", "s2"],
      createdBy: "user1",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
    };

    const result = mapExternalPipeline(apiItem);

    expect(result).toEqual({
      id: "p1",
      account_id: "a1",
      enterprise_id: "e1",
      name: "Deploy Pipeline",
      description: "Main deploy",
      status: "active",
      deployment_type: "CD",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
      yaml_content: "steps:\n  - build",
      product_id: "prod1",
      service_ids: ["s1", "s2"],
      created_by: "user1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
    });
  });

  it("falls back to snake_case keys when camelCase absent", () => {
    const item = {
      id: "p2",
      account_id: "a2",
      enterprise_id: "e2",
      deployment_type: "Integration",
      yaml_content: "yaml",
      product_id: "prod2",
      service_ids: ["s3"],
      created_by: "u2",
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    };

    const result = mapExternalPipeline(item);
    expect(result.account_id).toBe("a2");
    expect(result.deployment_type).toBe("Integration");
    expect(result.yaml_content).toBe("yaml");
    expect(result.product_id).toBe("prod2");
  });

  it("defaults missing optional fields", () => {
    const result = mapExternalPipeline({ id: "p3" });

    expect(result.account_id).toBe("");
    expect(result.enterprise_id).toBe("");
    expect(result.name).toBe("");
    expect(result.description).toBeNull();
    expect(result.status).toBe("draft");
    expect(result.deployment_type).toBe("Integration");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.yaml_content).toBeNull();
    expect(result.product_id).toBeNull();
    expect(result.service_ids).toBeNull();
    expect(result.created_by).toBeNull();
    expect(result.created_at).toBe("");
    expect(result.updated_at).toBe("");
  });

  it("handles empty object", () => {
    const result = mapExternalPipeline({});
    expect(result.id).toBeUndefined();
    expect(result.status).toBe("draft");
  });

  it("prefers camelCase over snake_case when both present", () => {
    const item = {
      id: "p4",
      accountId: "camel-a",
      account_id: "snake-a",
      deploymentType: "camel-deploy",
      deployment_type: "snake-deploy",
    };

    const result = mapExternalPipeline(item);
    expect(result.account_id).toBe("camel-a");
    expect(result.deployment_type).toBe("camel-deploy");
  });
});
