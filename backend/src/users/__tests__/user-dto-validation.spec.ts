import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserWorkstreamsDto } from '../dto/update-user-workstreams.dto';
import { UpdateUserGroupsDto } from '../dto/update-user-groups.dto';

describe('UpdateUserWorkstreamsDto', () => {
  it('should pass with valid string array', async () => {
    const dto = plainToInstance(UpdateUserWorkstreamsDto, {
      workstreamIds: ['ws-1', 'ws-2'],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with empty array', async () => {
    const dto = plainToInstance(UpdateUserWorkstreamsDto, {
      workstreamIds: [],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when workstreamIds is missing', async () => {
    const dto = plainToInstance(UpdateUserWorkstreamsDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('workstreamIds');
  });

  it('should fail when workstreamIds is not an array', async () => {
    const dto = plainToInstance(UpdateUserWorkstreamsDto, {
      workstreamIds: 'not-an-array',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when array contains non-strings', async () => {
    const dto = plainToInstance(UpdateUserWorkstreamsDto, {
      workstreamIds: [123, true],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateUserGroupsDto', () => {
  it('should pass with valid string array', async () => {
    const dto = plainToInstance(UpdateUserGroupsDto, {
      groupIds: ['g-1', 'g-2'],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass with empty array', async () => {
    const dto = plainToInstance(UpdateUserGroupsDto, {
      groupIds: [],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when groupIds is missing', async () => {
    const dto = plainToInstance(UpdateUserGroupsDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('groupIds');
  });

  it('should fail when groupIds is not an array', async () => {
    const dto = plainToInstance(UpdateUserGroupsDto, {
      groupIds: 'not-an-array',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when array contains non-strings', async () => {
    const dto = plainToInstance(UpdateUserGroupsDto, {
      groupIds: [42, null],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
