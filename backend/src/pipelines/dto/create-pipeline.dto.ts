import { IsString, IsOptional, IsArray, IsObject, IsEnum, ValidateNested, Allow } from 'class-validator';
import { Type, Exclude } from 'class-transformer';

/**
 * Pipeline status enum matching the database constraint
 */
export enum PipelineStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

/**
 * Represents a single node in the pipeline canvas
 */
export class PipelineNodeDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsObject()
  position: { x: number; y: number };

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  /** React Flow adds style, parentId, width, height, etc. — allow them through */
  @IsOptional()
  @Allow()
  style?: any;

  @IsOptional()
  @Allow()
  parentId?: string;

  @IsOptional()
  @Allow()
  width?: number;

  @IsOptional()
  @Allow()
  height?: number;

  @IsOptional()
  @Allow()
  draggable?: boolean;

  @IsOptional()
  @Allow()
  selectable?: boolean;

  @IsOptional()
  @Allow()
  connectable?: boolean;

  @IsOptional()
  @Allow()
  deletable?: boolean;

  @IsOptional()
  @Allow()
  focusable?: boolean;

  @IsOptional()
  @Allow()
  measured?: any;

  @IsOptional()
  @Allow()
  extent?: any;

  @IsOptional()
  @Allow()
  expandParent?: boolean;

  @IsOptional()
  @Allow()
  sourcePosition?: string;

  @IsOptional()
  @Allow()
  targetPosition?: string;

  @IsOptional()
  @Allow()
  hidden?: boolean;

  @IsOptional()
  @Allow()
  zIndex?: number;

  /** Catch-all for any other React Flow properties */
  [key: string]: any;
}

/**
 * Represents a connection (edge) between two nodes
 */
export class PipelineEdgeDto {
  @IsString()
  id: string;

  @IsString()
  source: string;

  @IsString()
  target: string;

  @IsString()
  @IsOptional()
  sourceHandle?: string;

  @IsString()
  @IsOptional()
  targetHandle?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;

  @IsOptional()
  @Allow()
  style?: any;

  @IsOptional()
  @Allow()
  animated?: boolean;

  @IsOptional()
  @Allow()
  hidden?: boolean;

  @IsOptional()
  @Allow()
  deletable?: boolean;

  @IsOptional()
  @Allow()
  selectable?: boolean;

  @IsOptional()
  @Allow()
  focusable?: boolean;

  @IsOptional()
  @Allow()
  markerStart?: any;

  @IsOptional()
  @Allow()
  markerEnd?: any;

  @IsOptional()
  @Allow()
  label?: any;

  @IsOptional()
  @Allow()
  labelStyle?: any;

  @IsOptional()
  @Allow()
  zIndex?: number;

  /** Catch-all for any other React Flow properties */
  [key: string]: any;
}

/**
 * DTO for creating a new pipeline
 * 
 * The pipeline is scoped to account + enterprise context extracted
 * from the authenticated user's JWT claims.
 */
export class CreatePipelineDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Account ID (injected from JWT context, not from body in production) */
  @IsString()
  accountId: string;

  /** Enterprise ID for multi-tenant scoping */
  @IsString()
  enterpriseId: string;

  /** Product association */
  @IsString()
  @IsOptional()
  productId?: string;

  /** Service associations (many-to-many) */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceIds?: string[];

  /** Deployment type: e.g., 'cloud', 'on-premise', 'hybrid' */
  @IsString()
  @IsOptional()
  deploymentType?: string;

  /** Pipeline status */
  @IsEnum(PipelineStatus)
  @IsOptional()
  status?: PipelineStatus;

  /** React Flow nodes (persisted as JSON) */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineNodeDto)
  @IsOptional()
  nodes?: PipelineNodeDto[];

  /** React Flow edges (persisted as JSON) */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineEdgeDto)
  @IsOptional()
  edges?: PipelineEdgeDto[];

  /** Generated YAML content for CI/CD portability */
  @IsString()
  @IsOptional()
  yamlContent?: string;
}
