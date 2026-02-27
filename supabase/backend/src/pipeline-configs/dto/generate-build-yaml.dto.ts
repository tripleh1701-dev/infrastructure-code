import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsObject,
} from 'class-validator';
import { Allow } from 'class-validator';

/**
 * DTO for generating a Build YAML from a pipeline + stages state.
 *
 * The frontend sends:
 *   - buildJobId: the build job that references a pipeline
 *   - buildVersion: user-defined version string
 *   - pipelineStagesState: the runtime config (selectedConnectors, environments, etc.)
 */
export class GenerateBuildYamlDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  enterpriseId: string;

  @IsString()
  @IsNotEmpty()
  buildJobId: string;

  @IsString()
  @IsNotEmpty()
  buildVersion: string;

  /** The stages state from the build job UI — connectors, environments, branches, approvers */
  @IsObject()
  pipelineStagesState: {
    selectedConnectors: Record<string, string>;
    selectedEnvironments: Record<string, string>;
    connectorRepositoryUrls: Record<string, string>;
    selectedBranches: Record<string, string>;
    selectedApprovers: Record<string, string[]>;
    [key: string]: any;
  };

  /** Optional status override */
  @IsString()
  @IsOptional()
  status?: 'DRAFT' | 'ACTIVE';
}
