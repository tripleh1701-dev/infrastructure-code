/**
 * Pipeline Types
 */

// Pipeline status
export type PipelineStatus = 'draft' | 'active' | 'inactive' | 'archived';

// Pipeline mode
export type PipelineMode = 'create' | 'edit' | 'preview';

// Deployment type
export type DeploymentType = 'Integration' | 'Extension' | 'Kubernetes' | 'CloudFoundry' | 'MobileServices';

// Node categories
export type NodeCategory = 'plan' | 'code' | 'build' | 'test' | 'deploy' | 'approval' | 'environment';

// Node types for the visual canvas
export type WorkflowNodeType =
  | 'plan_jira'
  | 'plan_azure_devops'
  | 'plan_trello'
  | 'plan_asana'
  | 'code_github'
  | 'code_gitlab'
  | 'code_azure_repos'
  | 'code_bitbucket'
  | 'code_sonarqube'
  | 'build_jenkins'
  | 'build_github_actions'
  | 'build_circleci'
  | 'build_aws_codebuild'
  | 'build_google_cloud_build'
  | 'build_azure_pipelines'
  | 'test_cypress'
  | 'test_selenium'
  | 'test_jest'
  | 'test_tricentis'
  | 'release_argocd'
  | 'release_servicenow'
  | 'release_azure_devops'
  | 'deploy_kubernetes'
  | 'deploy_helm'
  | 'deploy_terraform'
  | 'deploy_ansible'
  | 'deploy_docker'
  | 'deploy_aws_codepipeline'
  | 'deploy_cloud_foundry'
  | 'approval_manual'
  | 'approval_slack'
  | 'approval_teams'
  | 'env_dev'
  | 'env_qa'
  | 'env_staging'
  | 'env_uat'
  | 'env_prod'
  | 'note'
  | 'comment'
  | `env_custom_${string}`; // Support for custom environments

// Pipeline Canvas Row (for summary table)
export interface PipelineCanvasRow {
  id: string;
  enterpriseId: string;
  enterpriseName: string;
  productId: string;
  productName: string;
  serviceIds: string[];
  serviceNames: string[];
  status: PipelineStatus;
  lastUpdated: string;
  createdBy: string;
  isNew?: boolean;
  isModified?: boolean;
}

// Pipeline Template
export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  steps: TemplateStep[];
}

export interface TemplateStep {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position: { x: number; y: number };
}

// Pipeline Canvas Config
export interface PipelineCanvasConfig {
  id: string;
  name: string;
  enterpriseId: string;
  productId: string;
  serviceIds: string[];
  deploymentType: DeploymentType;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  yaml?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Pipeline Node
export interface PipelineNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    config?: Record<string, unknown>;
    status?: 'pending' | 'running' | 'success' | 'failed';
  };
}

// Pipeline Edge
export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  type?: 'default' | 'smoothstep' | 'straight' | 'bezier';
  animated?: boolean;
  style?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  };
}

// Pipeline Execution
export interface PipelineExecution {
  id: string;
  pipelineId: string;
  pipelineName: string;
  buildId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  stages: ExecutionStage[];
  logs: ExecutionLog[];
}

export interface ExecutionStage {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

export interface ExecutionLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  stage?: string;
  nodeId?: string;
}

// Smart Pipeline Project Types
export type SmartPipelineProjectType = 
  | 'web_app'
  | 'api_microservice'
  | 'mobile'
  | 'sap_extension'
  | 'data_pipeline'
  | 'infrastructure';

export interface SmartPipelineConfig {
  projectType: SmartPipelineProjectType;
  projectName: string;
  repository: string;
  framework?: string;
  deployment: string;
}
