import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { CredentialsService } from '../credentials/credentials.service';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';

const mockConnector = {
  id: 'conn-1',
  name: 'Jira Cloud',
  accountId: 'acc-1',
  enterpriseId: 'ent-1',
  connectorTool: 'jira',
  connectorType: 'cloud',
  category: 'project_management',
  status: 'active',
  health: 'healthy',
  syncCount: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockConnectorsService = {
  findAll: jest.fn().mockResolvedValue([mockConnector]),
  findOne: jest.fn().mockResolvedValue(mockConnector),
  create: jest.fn().mockResolvedValue(mockConnector),
  update: jest.fn().mockResolvedValue(mockConnector),
  remove: jest.fn().mockResolvedValue(undefined),
};

const mockCredentialsService = {
  findOne: jest.fn().mockResolvedValue(null),
};

describe('ConnectorsController — envelope contract', () => {
  let controller: ConnectorsController;
  const interceptor = new TransformInterceptor();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectorsController],
      providers: [
        { provide: ConnectorsService, useValue: mockConnectorsService },
        { provide: CredentialsService, useValue: mockCredentialsService },
      ],
    }).compile();
    controller = module.get(ConnectorsController);
    jest.clearAllMocks();
  });

  async function wrap<T>(raw: T) {
    const envelope = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, { handle: () => of(raw) } as CallHandler),
    );
    if (envelope && typeof envelope === 'object' && 'data' in envelope && 'error' in envelope) {
      return { data: (envelope as any).data, error: (envelope as any).error };
    }
    return { data: envelope, error: null };
  }

  it('GET /connectors → array, no double-wrap', async () => {
    const raw = await controller.findAll('acc-1', 'ent-1');
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('id');
  });

  it('GET /connectors/:id → object, no double-wrap', async () => {
    const raw = await controller.findOne('conn-1');
    expect(raw).toHaveProperty('id');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id', 'conn-1');
  });

  it('POST /connectors → created object, no double-wrap', async () => {
    const raw = await controller.create({} as any);
    expect(raw).toHaveProperty('id');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('PUT /connectors/:id → updated object, no double-wrap', async () => {
    const raw = await controller.update('conn-1', {} as any);
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('DELETE /connectors/:id → void (204)', async () => {
    const raw = await controller.remove('conn-1');
    expect(raw).toBeUndefined();
  });

  it('POST /connectors/oauth/initiate → no double-wrap', async () => {
    const raw = await controller.oauthInitiate({
      provider: 'github',
      credentialId: 'cred-1',
      redirectUri: 'http://localhost',
    });
    expect(raw).toHaveProperty('authorizationUrl');
    expect(raw).toHaveProperty('state');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('authorizationUrl');
  });

  it('GET /connectors/oauth/status/:id → no double-wrap', async () => {
    const raw = await controller.oauthStatus('cred-1');
    expect(raw).toEqual({ status: 'pending' });
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toEqual({ status: 'pending' });
  });

  it('POST /connectors/oauth/revoke → no double-wrap', async () => {
    const raw = await controller.oauthRevoke({ credentialId: 'cred-1' });
    expect(raw).toEqual({ success: true });
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toEqual({ success: true });
  });
});
