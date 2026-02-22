import { describe, it, expect, vi, beforeEach } from "vitest";
import { startProvisioning, getProvisioningStatus, getProvisioningEvents, deprovision } from "../provisioning.service";
import { httpClient } from "@/lib/api/http-client";

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockBackendJob = {
  id: "job-1",
  accountId: "acc-1",
  accountName: "Test Account",
  cloudType: "private" as const,
  status: "in_progress",
  message: "Creating resources...",
  progress: 50,
  startedAt: "2025-01-01T00:00:00Z",
  completedAt: null,
  stackId: "arn:aws:cf:us-east-1:123:stack/test",
  resources: [
    { name: "DynamoDBTable", type: "AWS::DynamoDB::Table", status: "active", arn: "arn:aws:dynamodb:table/test" },
    { name: "IAMRole", type: "AWS::IAM::Role", status: "creating", arn: undefined },
  ],
};

const mockBackendStatus = {
  accountId: "acc-1",
  accountName: "Test Account",
  cloudType: "private" as const,
  status: "completed",
  message: "Ready",
  progress: 100,
  startedAt: "2025-01-01T00:00:00Z",
  completedAt: "2025-01-01T00:05:00Z",
  stackId: "arn:aws:cf:us-east-1:123:stack/test",
  resources: [
    { name: "DynamoDBTable", type: "AWS::DynamoDB::Table", status: "active", arn: "arn:table" },
  ],
};

describe("provisioningService (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("startProvisioning", () => {
    it("posts to /provisioning and maps backend job", async () => {
      vi.mocked(httpClient.post).mockResolvedValue({ data: mockBackendJob, error: null });
      const input = { accountId: "acc-1", accountName: "Test Account", cloudType: "private" as const };
      const result = await startProvisioning(input);

      expect(httpClient.post).toHaveBeenCalledWith("/provisioning", input);
      expect(result.data!.id).toBe("job-1");
      expect(result.data!.resources[0].logicalId).toBe("DynamoDBTable");
      expect(result.data!.resources[0].status).toBe("CREATE_COMPLETE"); // active -> CREATE_COMPLETE
      expect(result.data!.resources[1].status).toBe("CREATE_IN_PROGRESS"); // creating -> CREATE_IN_PROGRESS
    });

    it("maps hybrid cloudType to private", async () => {
      vi.mocked(httpClient.post).mockResolvedValue({
        data: { ...mockBackendJob, cloudType: "hybrid" },
        error: null,
      });
      const result = await startProvisioning({ accountId: "acc-1", accountName: "Test", cloudType: "hybrid" as any });
      expect(result.data!.cloudType).toBe("private");
    });

    it("returns error when backend fails", async () => {
      vi.mocked(httpClient.post).mockResolvedValue({ data: null, error: { message: "Failed", code: "500" } });
      const result = await startProvisioning({ accountId: "acc-1", accountName: "Test", cloudType: "private" });
      expect(result.error!.message).toBe("Failed");
    });
  });

  describe("getProvisioningStatus", () => {
    it("gets status and maps backend DTO", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({ data: mockBackendStatus, error: null });
      const result = await getProvisioningStatus("acc-1");

      expect(httpClient.get).toHaveBeenCalledWith("/provisioning/acc-1/status");
      expect(result.data!.status).toBe("completed");
      expect(result.data!.resources[0].physicalId).toBe("arn:table");
    });

    it("returns error on failure", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({ data: null, error: { message: "Not found" } });
      const result = await getProvisioningStatus("acc-x");
      expect(result.error!.message).toBe("Not found");
    });
  });

  describe("getProvisioningEvents", () => {
    it("fetches events for account", async () => {
      const events = [{ id: "e-1", message: "Stack created", timestamp: "2025-01-01" }];
      vi.mocked(httpClient.get).mockResolvedValue({ data: events, error: null });
      const result = await getProvisioningEvents("acc-1");
      expect(httpClient.get).toHaveBeenCalledWith("/provisioning/acc-1/events");
      expect(result.data).toEqual(events);
    });
  });

  describe("deprovision", () => {
    it("deletes provisioning for account", async () => {
      vi.mocked(httpClient.delete).mockResolvedValue({ data: { success: true }, error: null });
      const result = await deprovision("acc-1");
      expect(httpClient.delete).toHaveBeenCalledWith("/provisioning/acc-1");
      expect(result.data!.success).toBe(true);
    });
  });
});
