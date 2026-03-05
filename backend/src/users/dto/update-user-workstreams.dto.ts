import { IsArray, IsString } from 'class-validator';

export class UpdateUserWorkstreamsDto {
  @IsArray()
  @IsString({ each: true })
  workstreamIds: string[];
}
