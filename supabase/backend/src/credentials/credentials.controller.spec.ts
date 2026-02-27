import { Test, TestingModule } from '@nestjs/testing';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';

const mockCredential = {
  PK: 'CREDENTIAL#cred-1',
  SK: 'METADATA',
  id: 'cred-1',
  name: 'Jenkins API Key',
  accountId: 'acc-1',
  enterpriseId: 'ent-1',
  connector: 'jenkins',
  authType: 'api_key',
  category: 'ci_cd',
  status: 'active',
  expiresAt: '2027-01-01T00:00:00.000Z',
  expiryNotify: true,
  expiryNoticeDays: 30,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockService = {
  findAll: jest.fn().mockResolvedValue([mockCredential]),
  findOne: jest.fn().mockResolvedValue(mockCredential),
  findExpiring: jest.fn().mockResolvedValue([mockCredential]),
  create: jest.fn().mockResolvedValue(mockCredential),
  update: jest.fn().mockResolvedValue(mockCredential),
  rotate: jest.fn().mockResolvedValue(mockCredential),
  remove: jest.fn().mockResolvedValue(undefined),
};

describe('CredentialsController — envelope contract', () => {
  let controller: CredentialsController;
  const interceptor = new TransformInterceptor();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CredentialsController],
      providers: [{ provide: CredentialsService, useValue: mockService }],
    }).compile();
    controller = module.get(CredentialsController);
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

  it('GET /credentials → array, no double-wrap', async () => {
    const raw = await controller.findAll('acc-1', 'ent-1');
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /credentials/expiring → array, no double-wrap', async () => {
    const raw = await controller.findExpiring('acc-1', 'ent-1', '30');
    expect(Array.isArray(raw)).toBe(true);

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /credentials/check-name → array, no double-wrap', async () => {
    const raw = await controller.checkName('Jenkins API Key', 'acc-1', 'ent-1');
    expect(Array.isArray(raw)).toBe(true);

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /credentials/:id → object, no double-wrap', async () => {
    const raw = await controller.findOne('cred-1');
    expect(raw).toHaveProperty('id');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id', 'cred-1');
  });

  it('POST /credentials → created object, no double-wrap', async () => {
    const raw = await controller.create({} as any);
    expect(raw).toHaveProperty('id');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('PUT /credentials/:id → updated object, no double-wrap', async () => {
    const raw = await controller.update('cred-1', {} as any);
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('PATCH /credentials/:id → updated object, no double-wrap', async () => {
    const raw = await controller.patch('cred-1', {} as any);
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('POST /credentials/:id/rotate → rotated object, no double-wrap', async () => {
    const raw = await controller.rotate('cred-1', { credentials: { key: 'new' } });
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('DELETE /credentials/:id → void (204)', async () => {
    const raw = await controller.remove('cred-1');
    expect(raw).toBeUndefined();
  });
});
