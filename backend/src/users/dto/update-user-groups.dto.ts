import { IsArray, IsString } from 'class-validator';

export class UpdateUserGroupsDto {
  @IsArray()
  @IsString({ each: true })
  groupIds: string[];
}
