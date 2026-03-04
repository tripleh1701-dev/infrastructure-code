import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountsService } from '../accounts.service';

// ── Mock NestJS Logger ──────────────────────────────────────────────────
jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  return {
    ...actual,
    Logger: jest.fn().mockImplementation(() => ({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Stable UUID sequence for deterministic tests
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: () => `uuid-${++uuidCounter}`,
}));

// ── Mock dependencies ───────────────────────────────────────────────────
const mockDynamoDb = {
  put: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue({ Item: null }),
  query: jest.fn().mockResolvedValue({ Items: [] }),
  queryByIndex: jest.fn().mockResolvedValue({ Items: [] }),
  update: jest.fn().mockResolvedValue({ Attributes: {} }),
  delete: jest.fn().mockResolvedValue({}),
  transactWrite: jest.fn().mockResolvedValue({}),
};

const mockDynamoDbRouter = {
  put: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  invalidateCache: jest.fn(),
};

const mockAccountProvisioner = {
  provisionAccount: jest.fn().mockResolvedValue({
    success: true,
    tableName: 'test-table',
    message: 'ok',
  }),
  getProvisioningStatus: jest.fn().mockResolvedValue(null),
};

const mockCognitoProvisioning = {
  createUser: jest.fn().mockResolvedValue({ created: true, cognitoSub: 'sub-123' }),
};

function createService(): AccountsService {
  return new AccountsService(
    mockDynamoDb as any,
    mockDynamoDbRouter as any,
    mockAccountProvisioner as any,
    mockCognitoProvisioning as any,
  );
}

describe('AccountsService', () => {
  let service: AccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;
    service = createService();
  });

  // ── create() ────────────────────────────────────────────────────────

  describe('create()', () => {
    const baseDto = {
      name: 'Acme Corp',
      masterAccountName: 'master-001',
      cloudType: 'public' as const,
      addresses: [
        { line1: '123 Main St', city: 'NY', state: 'NY', postalCode: '10001', country: 'US' },
      ],
      technicalUser: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@acme.com',
        assignedRole: 'admin',
        assignedGroup: 'TechnicalUsers',
        startDate: '2025-01-01',
      },
      licenses: [
        {
          enterpriseId: 'ent-1',
          productId: 'prod-1',
          serviceId: 'svc-1',
          startDate: '2025-01-01',
          endDate: '2026-01-01',
          numberOfUsers: 10,
          contactFullName: 'Jane Doe',
          contactEmail: 'jane@acme.com',
        },
      ],
    };

    it('creates a public account and returns mapped result', async () => {
      const result = await service.create(baseDto as any);

      expect(result).toMatchObject({
        id: 'uuid-1',
        name: 'Acme Corp',
        cloudType: 'public',
        status: 'active',
      });
      expect(mockAccountProvisioner.provisionAccount).toHaveBeenCalledTimes(1);
      expect(mockDynamoDb.transactWrite).toHaveBeenCalledTimes(1);
    });

    it('writes address and tech user operations in the transactWrite batch', async () => {
      await service.create(baseDto as any);

      const ops = mockDynamoDb.transactWrite.mock.calls[0][0];
      // account metadata + 1 address + 1 tech user = 3 Put ops
      expect(ops.length).toBe(3);
      expect(ops[0].Put.Item.SK).toBe('METADATA');
      expect(ops[1].Put.Item.SK).toMatch(/^ADDRESS#/);
      expect(ops[2].Put.Item.SK).toMatch(/^TECH_USER#/);
    });

    it('sets status to "provisioning" for private cloud accounts', async () => {
      const privateDto = { ...baseDto, cloudType: 'private' as const };
      const result = await service.create(privateDto as any);

      expect(result.status).toBe('provisioning');
    });

    it('stores PENDING_INIT record for private accounts', async () => {
      const privateDto = { ...baseDto, cloudType: 'private' as const };
      await service.create(privateDto as any);

      const pendingPut = mockDynamoDb.put.mock.calls.find(
        (call: any) => call[0]?.Item?.SK === 'PENDING_INIT',
      );
      expect(pendingPut).toBeDefined();
      expect(pendingPut![0].Item.accountId).toBe('uuid-1');
    });

    it('defers Cognito provisioning for private accounts', async () => {
      const privateDto = { ...baseDto, cloudType: 'private' as const };
      await service.create(privateDto as any);

      expect(mockCognitoProvisioning.createUser).not.toHaveBeenCalled();
    });

    it('calls Cognito createUser for public accounts with tech user', async () => {
      await service.create(baseDto as any);

      expect(mockCognitoProvisioning.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@acme.com',
          firstName: 'Jane',
          lastName: 'Doe',
        }),
      );
    });

    it('does not throw when Cognito provisioning fails', async () => {
      mockCognitoProvisioning.createUser.mockRejectedValueOnce(new Error('Cognito down'));

      await expect(service.create(baseDto as any)).resolves.toBeDefined();
    });

    it('throws BadRequestException when provisioning fails', async () => {
      mockAccountProvisioner.provisionAccount.mockResolvedValueOnce({
        success: false,
        message: 'quota exceeded',
      });

      await expect(service.create(baseDto as any)).rejects.toThrow(BadRequestException);
    });

    it('emits structured latency log with stepTimings', async () => {
      const loggerInstance = (service as any).logger;
      await service.create(baseDto as any);

      // Find the AccountCreateComplete log call
      const completeCalls = loggerInstance.log.mock.calls.filter(
        (call: any) => typeof call[0] === 'string' && call[0].includes('AccountCreateComplete'),
      );
      expect(completeCalls.length).toBe(1);

      const payload = JSON.parse(completeCalls[0][0]);
      expect(payload.event).toBe('AccountCreateComplete');
      expect(payload.cloudType).toBe('public');
      expect(payload.totalMs).toBeGreaterThanOrEqual(0);
      expect(payload.stepTimings).toHaveProperty('provisioning');
      expect(payload.stepTimings).toHaveProperty('metadataWrite');
      expect(payload.stepTimings).toHaveProperty('rbac');
    });

    it('creates licenses via createLicense for each license in dto', async () => {
      await service.create(baseDto as any);

      // License is written via dynamoDb.put (separate from transactWrite)
      const licensePuts = mockDynamoDb.put.mock.calls.filter(
        (call: any) => call[0]?.Item?.SK?.startsWith?.('LICENSE#'),
      );
      expect(licensePuts.length).toBe(1);
    });
  });

  // ── findOne() ───────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('throws NotFoundException when account does not exist', async () => {
      mockDynamoDb.get.mockResolvedValueOnce({ Item: null });

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('returns account with addresses and technical user', async () => {
      const mockAccount = {
        id: 'acc-1',
        name: 'Test',
        masterAccountName: 'master',
        cloudType: 'public',
        status: 'active',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };
      mockDynamoDb.get.mockResolvedValueOnce({ Item: mockAccount });
      mockDynamoDb.query
        .mockResolvedValueOnce({
          Items: [
            { id: 'addr-1', accountId: 'acc-1', line1: '1 St', city: 'NY', state: 'NY', postalCode: '10001', country: 'US' },
          ],
        })
        .mockResolvedValueOnce({
          Items: [
            { id: 'tu-1', accountId: 'acc-1', firstName: 'A', lastName: 'B', email: 'a@b.com', assignedRole: 'admin', assignedGroup: 'Tech', startDate: '2025-01-01', status: 'active', isTechnicalUser: true },
          ],
        });

      const result = await service.findOne('acc-1');

      expect(result.name).toBe('Test');
      expect(result.addresses).toHaveLength(1);
      expect(result.technicalUser).toBeDefined();
      expect(result.technicalUser!.firstName).toBe('A');
    });
  });

  // ── checkGlobalAccess() ─────────────────────────────────────────────

  describe('checkGlobalAccess()', () => {
    it('returns true when a license references the global enterprise', async () => {
      mockDynamoDb.query.mockResolvedValueOnce({
        Items: [{ enterpriseId: '00000000-0000-0000-0000-000000000001' }],
      });

      const result = await service.checkGlobalAccess('acc-1');
      expect(result.hasGlobalAccess).toBe(true);
    });

    it('returns false when no license references the global enterprise', async () => {
      mockDynamoDb.query.mockResolvedValueOnce({
        Items: [{ enterpriseId: 'ent-other' }],
      });

      const result = await service.checkGlobalAccess('acc-1');
      expect(result.hasGlobalAccess).toBe(false);
    });
  });

  // ── finalizeProvisionedAccounts() ───────────────────────────────────

  describe('finalizeProvisionedAccounts()', () => {
    it('finalizes accounts whose provisioning status is active', async () => {
      mockDynamoDb.queryByIndex.mockResolvedValueOnce({
        Items: [
          { id: 'acc-1', status: 'provisioning', cloudType: 'private' },
        ],
      });
      mockAccountProvisioner.getProvisioningStatus.mockResolvedValueOnce({ status: 'active' });
      // PENDING_INIT record
      mockDynamoDb.get.mockResolvedValueOnce({
        Item: {
          PK: 'ACCOUNT#acc-1',
          SK: 'PENDING_INIT',
          accountId: 'acc-1',
          accountData: { id: 'acc-1', name: 'Test' },
          addresses: [],
          technicalUser: null,
        },
      });
      // Groups & roles queries for replication
      mockDynamoDb.queryByIndex
        .mockResolvedValueOnce({ Items: [] }) // groups
        .mockResolvedValueOnce({ Items: [] }); // roles

      const result = await service.finalizeProvisionedAccounts();

      expect(result.finalized).toContain('acc-1');
      expect(result.failed).toHaveLength(0);
    });

    it('marks accounts as failed when provisioning status is failed', async () => {
      mockDynamoDb.queryByIndex.mockResolvedValueOnce({
        Items: [
          { id: 'acc-2', status: 'provisioning', cloudType: 'private' },
        ],
      });
      mockAccountProvisioner.getProvisioningStatus.mockResolvedValueOnce({ status: 'failed' });

      const result = await service.finalizeProvisionedAccounts();

      expect(result.failed).toContain('acc-2');
      expect(result.finalized).toHaveLength(0);
    });

    it('keeps accounts as still pending when status is creating', async () => {
      mockDynamoDb.queryByIndex.mockResolvedValueOnce({
        Items: [
          { id: 'acc-3', status: 'provisioning', cloudType: 'private' },
        ],
      });
      mockAccountProvisioner.getProvisioningStatus.mockResolvedValueOnce({ status: 'creating' });

      const result = await service.finalizeProvisionedAccounts();

      expect(result.stillPending).toContain('acc-3');
    });
  });
});
