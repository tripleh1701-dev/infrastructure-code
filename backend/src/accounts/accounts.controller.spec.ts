import { Test, TestingModule } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';

const mockAccount = {
  PK: 'ACCOUNT#acc-1',
  SK: 'METADATA',
  id: 'acc-1',
  name: 'Test Account',
  masterAccountName: 'Master',
  cloudType: 'private',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockService = {
  findAll: jest.fn().mockResolvedValue([mockAccount]),
  findOne: jest.fn().mockResolvedValue(mockAccount),
  checkGlobalAccess: jest.fn().mockResolvedValue({ hasGlobalAccess: true }),
  create: jest.fn().mockResolvedValue(mockAccount),
  update: jest.fn().mockResolvedValue(mockAccount),
  remove: jest.fn().mockResolvedValue(undefined),
};

describe('AccountsController — envelope contract', () => {
  let controller: AccountsController;
  const interceptor = new TransformInterceptor();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [{ provide: AccountsService, useValue: mockService }],
    }).compile();
    controller = module.get(AccountsController);
    jest.clearAllMocks();
  });

  async function wrap<T>(raw: T) {
    const envelope = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, { handle: () => of(raw) } as CallHandler),
    );
    // Simulate httpClient auto-unwrap
    if (envelope && typeof envelope === 'object' && 'data' in envelope && 'error' in envelope) {
      return { data: (envelope as any).data, error: (envelope as any).error };
    }
    return { data: envelope, error: null };
  }

  it('GET /accounts → array, no double-wrap', async () => {
    const raw = await controller.findAll();
    expect(Array.isArray(raw)).toBe(true);
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('id');
  });

  it('GET /accounts/:id → object, no double-wrap', async () => {
    const raw = await controller.findOne('acc-1');
    expect(raw).toHaveProperty('id');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id', 'acc-1');
  });

  it('GET /accounts/:id/global-access → object, no double-wrap', async () => {
    const raw = await controller.checkGlobalAccess('acc-1');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('hasGlobalAccess');
  });

  it('POST /accounts → created object, no double-wrap', async () => {
    const raw = await controller.create({ name: 'New', masterAccountName: 'M', cloudType: 'public' } as any);
    expect(raw).toHaveProperty('id');
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('PUT /accounts/:id → updated object, no double-wrap', async () => {
    const raw = await controller.update('acc-1', { name: 'Updated' } as any);
    expect(raw).not.toHaveProperty('error');

    const { data, error } = await wrap(raw);
    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
  });

  it('DELETE /accounts/:id → void (204), no double-wrap', async () => {
    const raw = await controller.remove('acc-1');
    expect(raw).toBeUndefined();
  });
});
