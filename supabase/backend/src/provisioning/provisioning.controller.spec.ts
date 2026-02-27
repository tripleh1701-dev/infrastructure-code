import { Test, TestingModule } from "@nestjs/testing";
import { ProvisioningController } from "./provisioning.controller";
import { ProvisioningService } from "./provisioning.service";
import { ProvisioningJobDto, ProvisioningStatusDto } from "./dto/provisioning-status.dto";
import { TransformInterceptor } from "../common/interceptors/transform.interceptor";
import { CallHandler, ExecutionContext } from "@nestjs/common";
import { of, lastValueFrom } from "rxjs";

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockJob: ProvisioningJobDto = {
  id: "job-1",
  accountId: "acc-1",
  accountName: "Test Account",
  cloudType: "private",
  status: "pending",
  message: "Initializing provisioning...",
  progress: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  resources: [
    { type: "cloudformation", name: "Infrastructure Stack", status: "pending" },
    { type: "dynamodb", name: "Data Table", status: "pending" },
    { type: "iam", name: "Access Roles", status: "pending" },
    { type: "ssm", name: "Configuration Parameters", status: "pending" },
  ],
};

const mockStatus: ProvisioningStatusDto = {
  accountId: "acc-1",
  accountName: "Test Account",
  cloudType: "private",
  status: "in_progress",
  message: "Creating DynamoDB table...",
  progress: 40,
  startedAt: "2026-01-01T00:00:00.000Z",
  resources: [{ type: "dynamodb", name: "Data Table", status: "creating" }],
};

// ── Mock ProvisioningService ────────────────────────────────────────────────

const mockProvisioningService = {
  startProvisioning: jest.fn().mockResolvedValue(mockJob),
  getActiveJobs: jest.fn().mockResolvedValue([mockJob]),
  getProvisioningStatus: jest.fn().mockResolvedValue(mockStatus),
  deprovision: jest.fn().mockResolvedValue({ message: "Deprovisioned successfully" }),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ProvisioningController", () => {
  let controller: ProvisioningController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProvisioningController],
      providers: [{ provide: ProvisioningService, useValue: mockProvisioningService }],
    }).compile();

    controller = module.get<ProvisioningController>(ProvisioningController);
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // 1. Controller returns raw data (no manual wrapping)
  // ────────────────────────────────────────────────────────────────────────

  describe("raw return values (no double-wrapping)", () => {
    it("startProvisioning returns ProvisioningJobDto directly", async () => {
      const result = await controller.startProvisioning({
        accountId: "acc-1",
        accountName: "Test Account",
        cloudType: "private",
      });

      // Must NOT be { data: ..., error: null } — that's the interceptor's job
      expect(result).not.toHaveProperty("error");
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("accountId");
      expect(result).toHaveProperty("status");
    });

    it("getActiveJobs returns ProvisioningJobDto[] directly", async () => {
      const result = await controller.getActiveJobs();

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).not.toHaveProperty("error");
    });

    it("getStatus returns ProvisioningStatusDto directly", async () => {
      const result = await controller.getStatus("acc-1");

      expect(result).toHaveProperty("accountId");
      expect(result).toHaveProperty("progress");
      expect(result).not.toHaveProperty("error");
    });

    it("deprovision returns { message } directly", async () => {
      const result = await controller.deprovision("acc-1");

      expect(result).toEqual({ message: "Deprovisioned successfully" });
      expect(result).not.toHaveProperty("error");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. TransformInterceptor wraps into { data, error: null }
  // ────────────────────────────────────────────────────────────────────────

  describe("TransformInterceptor envelope", () => {
    const interceptor = new TransformInterceptor();

    function applyInterceptor<T>(rawData: T) {
      const mockContext = {} as ExecutionContext;
      const mockCallHandler: CallHandler = { handle: () => of(rawData) };
      return lastValueFrom(interceptor.intercept(mockContext, mockCallHandler));
    }

    it("wraps startProvisioning result in { data, error: null }", async () => {
      const raw = await controller.startProvisioning({
        accountId: "acc-1",
        accountName: "Test",
        cloudType: "private",
      });
      const envelope = await applyInterceptor(raw);

      expect(envelope).toEqual({ data: raw, error: null });
      // Ensure single layer — data should be the job, not { data: job, error: null }
      expect(envelope.data).toHaveProperty("id");
      expect(envelope.data).not.toHaveProperty("error");
    });

    it("wraps getActiveJobs result in { data, error: null }", async () => {
      const raw = await controller.getActiveJobs();
      const envelope = await applyInterceptor(raw);

      expect(envelope).toEqual({ data: raw, error: null });
      expect(Array.isArray(envelope.data)).toBe(true);
    });

    it("wraps getStatus result in { data, error: null }", async () => {
      const raw = await controller.getStatus("acc-1");
      const envelope = await applyInterceptor(raw);

      expect(envelope).toEqual({ data: raw, error: null });
      expect(envelope.data).toHaveProperty("progress");
    });

    it("wraps deprovision result in { data, error: null }", async () => {
      const raw = await controller.deprovision("acc-1");
      const envelope = await applyInterceptor(raw);

      expect(envelope).toEqual({ data: { message: "Deprovisioned successfully" }, error: null });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Shape matches frontend expectations
  //    (what httpClient.handleResponse auto-unwraps → what services consume)
  // ────────────────────────────────────────────────────────────────────────

  describe("frontend contract: final envelope shape", () => {
    const interceptor = new TransformInterceptor();

    async function simulateHttpResponse<T>(rawData: T) {
      const mockContext = {} as ExecutionContext;
      const mockCallHandler: CallHandler = { handle: () => of(rawData) };
      const envelope = await lastValueFrom(interceptor.intercept(mockContext, mockCallHandler));

      // Simulate httpClient auto-unwrap: if { data, error } → return { data: envelope.data, error: envelope.error }
      if (envelope && typeof envelope === "object" && "data" in envelope && "error" in envelope) {
        return { data: envelope.data, error: envelope.error };
      }
      return { data: envelope, error: null };
    }

    it("POST /provisioning → frontend gets BackendProvisioningJob shape", async () => {
      const raw = await controller.startProvisioning({
        accountId: "acc-1",
        accountName: "Test",
        cloudType: "private",
      });
      const { data, error } = await simulateHttpResponse(raw);

      expect(error).toBeNull();
      // These are the fields mapBackendJob() requires
      expect(data).toMatchObject({
        id: expect.any(String),
        accountId: expect.any(String),
        accountName: expect.any(String),
        cloudType: expect.stringMatching(/^(public|private)$/),
        status: expect.any(String),
        message: expect.any(String),
        progress: expect.any(Number),
        startedAt: expect.any(String),
      });
      expect((data as any).resources).toBeInstanceOf(Array);
      // Must NOT be double-wrapped
      expect(data).not.toHaveProperty("error");
    });

    it("GET /provisioning/:id/status → frontend gets BackendProvisioningStatus shape", async () => {
      const raw = await controller.getStatus("acc-1");
      const { data, error } = await simulateHttpResponse(raw);

      expect(error).toBeNull();
      // These are the fields mapBackendStatus() requires
      expect(data).toMatchObject({
        accountId: expect.any(String),
        accountName: expect.any(String),
        cloudType: expect.stringMatching(/^(public|private|hybrid)$/),
        status: expect.any(String),
        message: expect.any(String),
        progress: expect.any(Number),
        startedAt: expect.any(String),
      });
      expect((data as any).resources).toBeInstanceOf(Array);
    });
  });
});
