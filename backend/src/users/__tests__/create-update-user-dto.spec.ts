import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

const validCreateInput = {
  accountId: 'acc-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  assignedRole: 'developer',
  startDate: '2026-01-15',
};

describe('CreateUserDto', () => {
  it('should pass with all required fields', async () => {
    const dto = plainToInstance(CreateUserDto, validCreateInput);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with all optional fields included', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...validCreateInput,
      enterpriseId: 'ent-1',
      middleName: 'M',
      assignedGroup: 'devs',
      groupIds: ['g-1', 'g-2'],
      endDate: '2027-01-15',
      isTechnicalUser: true,
      workstreamIds: ['ws-1'],
      accountName: 'Acme',
      status: 'active',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when accountId is missing', async () => {
    const { accountId, ...rest } = validCreateInput;
    const dto = plainToInstance(CreateUserDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'accountId')).toBe(true);
  });

  it('should fail when firstName is missing', async () => {
    const { firstName, ...rest } = validCreateInput;
    const dto = plainToInstance(CreateUserDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'firstName')).toBe(true);
  });

  it('should fail when lastName is missing', async () => {
    const { lastName, ...rest } = validCreateInput;
    const dto = plainToInstance(CreateUserDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'lastName')).toBe(true);
  });

  it('should fail when email is missing', async () => {
    const { email, ...rest } = validCreateInput;
    const dto = plainToInstance(CreateUserDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when email is invalid', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...validCreateInput,
      email: 'not-an-email',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when assignedRole is missing', async () => {
    const { assignedRole, ...rest } = validCreateInput;
    const dto = plainToInstance(CreateUserDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'assignedRole')).toBe(true);
  });

  it('should fail when startDate is missing', async () => {
    const { startDate, ...rest } = validCreateInput;
    const dto = plainToInstance(CreateUserDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('should fail when startDate is not a valid date string', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...validCreateInput,
      startDate: 'not-a-date',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('should fail when isTechnicalUser is not a boolean', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...validCreateInput,
      isTechnicalUser: 'yes',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'isTechnicalUser')).toBe(true);
  });
});

describe('UpdateUserDto', () => {
  it('should pass with no fields (all optional via PartialType)', async () => {
    const dto = plainToInstance(UpdateUserDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with only status', async () => {
    const dto = plainToInstance(UpdateUserDto, { status: 'inactive' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with partial fields', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      firstName: 'Updated',
      email: 'updated@example.com',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when email is invalid', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      email: 'bad-email',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('should fail when startDate is not a valid date string', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      startDate: 'nope',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('should fail when isTechnicalUser is not a boolean', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      isTechnicalUser: 'true',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'isTechnicalUser')).toBe(true);
  });
});
