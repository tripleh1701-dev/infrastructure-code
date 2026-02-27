/**
 * Pipeline Constants
 */

import { WorkflowNodeType, PipelineTemplate, TemplateStep } from '@/types/pipeline';

// Node labels by type
export const NODE_LABELS: Record<WorkflowNodeType, string> = {
  // Plan
  plan_jira: 'JIRA',
  plan_azure_devops: 'Azure DevOps',
  plan_trello: 'Trello',
  plan_asana: 'Asana',
  // Code
  code_github: 'GitHub',
  code_gitlab: 'GitLab',
  code_azure_repos: 'Azure Repos',
  code_bitbucket: 'Bitbucket',
  code_sonarqube: 'SonarQube',
  // Build
  build_jenkins: 'Jenkins',
  build_github_actions: 'GitHub Actions',
  build_circleci: 'CircleCI',
  build_aws_codebuild: 'AWS CodeBuild',
  build_google_cloud_build: 'Google Cloud Build',
  build_azure_pipelines: 'Azure Pipelines',
  // Test
  test_cypress: 'Cypress',
  test_selenium: 'Selenium',
  test_jest: 'Jest',
  test_tricentis: 'Tricentis',
  // Release
  release_argocd: 'Argo CD',
  release_servicenow: 'ServiceNow',
  release_azure_devops: 'Azure DevOps Release',
  // Deploy
  deploy_kubernetes: 'Kubernetes',
  deploy_helm: 'Helm',
  deploy_terraform: 'Terraform',
  deploy_ansible: 'Ansible',
  deploy_docker: 'Docker',
  deploy_aws_codepipeline: 'AWS CodePipeline',
  deploy_cloud_foundry: 'Cloud Foundry',
  // Approval
  approval_manual: 'Manual Approval',
  approval_slack: 'Slack Approval',
  approval_teams: 'Teams Approval',
  // Environment
  env_dev: 'Development',
  env_qa: 'QA',
  env_staging: 'Staging',
  env_uat: 'UAT',
  env_prod: 'Production',
  // Annotations
  note: 'Sticky Note',
  comment: 'Comment',
};

// Node categories - Nodes (environments) first, then workflow stages in order
export const NODE_CATEGORIES = {
  environment: ['env_dev', 'env_qa', 'env_prod'],
  plan: ['plan_jira', 'plan_azure_devops', 'plan_trello', 'plan_asana'],
  code: ['code_github', 'code_gitlab', 'code_azure_repos', 'code_bitbucket', 'code_sonarqube'],
  build: ['build_jenkins', 'build_github_actions', 'build_circleci', 'build_aws_codebuild', 'build_google_cloud_build', 'build_azure_pipelines'],
  test: ['test_cypress', 'test_selenium', 'test_jest', 'test_tricentis'],
  release: ['release_argocd', 'release_servicenow', 'release_azure_devops'],
  deploy: ['deploy_kubernetes', 'deploy_helm', 'deploy_terraform', 'deploy_ansible', 'deploy_docker', 'deploy_aws_codepipeline', 'deploy_cloud_foundry'],
  approval: ['approval_manual', 'approval_slack', 'approval_teams'],
  annotation: ['note', 'comment'],
} as const;

// Node category colors
export const CATEGORY_COLORS: Record<string, string> = {
  plan: '#8b5cf6',
  code: '#3b82f6',
  build: '#f59e0b',
  test: '#10b981',
  release: '#06b6d4',
  deploy: '#ec4899',
  approval: '#f97316',
  environment: '#6366f1',
  annotation: '#64748b',
};

// Template flows
export const TEMPLATE_FLOWS: Record<string, TemplateStep[]> = {
  'sap-integration-suite': [
    { id: '1', type: 'plan_jira', label: 'JIRA Planning', position: { x: 100, y: 100 } },
    { id: '2', type: 'code_github', label: 'GitHub Source', position: { x: 300, y: 100 } },
    { id: '3', type: 'build_jenkins', label: 'Jenkins Build', position: { x: 500, y: 100 } },
    { id: '4', type: 'test_cypress', label: 'Cypress Tests', position: { x: 700, y: 100 } },
    { id: '5', type: 'approval_manual', label: 'Manual Approval', position: { x: 900, y: 100 } },
    { id: '6', type: 'deploy_cloud_foundry', label: 'Cloud Foundry Deploy', position: { x: 1100, y: 100 } },
  ],
  'sap-s4hana-extension': [
    { id: '1', type: 'plan_azure_devops', label: 'Azure DevOps Planning', position: { x: 100, y: 100 } },
    { id: '2', type: 'code_github', label: 'GitHub Source', position: { x: 300, y: 100 } },
    { id: '3', type: 'build_azure_pipelines', label: 'Azure Pipelines', position: { x: 500, y: 100 } },
    { id: '4', type: 'test_jest', label: 'Jest Tests', position: { x: 700, y: 100 } },
    { id: '5', type: 'deploy_kubernetes', label: 'Kubernetes Deploy', position: { x: 900, y: 100 } },
  ],
  'fiori-app': [
    { id: '1', type: 'plan_jira', label: 'JIRA Planning', position: { x: 100, y: 100 } },
    { id: '2', type: 'code_github', label: 'GitHub Source', position: { x: 300, y: 100 } },
    { id: '3', type: 'build_github_actions', label: 'GitHub Actions', position: { x: 500, y: 100 } },
    { id: '4', type: 'test_cypress', label: 'Cypress Tests', position: { x: 700, y: 100 } },
    { id: '5', type: 'deploy_cloud_foundry', label: 'SAP BTP Deploy', position: { x: 900, y: 100 } },
  ],
  'mobile-services': [
    { id: '1', type: 'plan_jira', label: 'JIRA Planning', position: { x: 100, y: 100 } },
    { id: '2', type: 'code_gitlab', label: 'GitLab Source', position: { x: 300, y: 100 } },
    { id: '3', type: 'build_circleci', label: 'CircleCI Build', position: { x: 500, y: 100 } },
    { id: '4', type: 'test_selenium', label: 'Selenium Tests', position: { x: 700, y: 100 } },
    { id: '5', type: 'deploy_docker', label: 'Docker Deploy', position: { x: 900, y: 100 } },
  ],
  'bas-devspace': [
    { id: '1', type: 'code_github', label: 'GitHub Source', position: { x: 100, y: 100 } },
    { id: '2', type: 'build_github_actions', label: 'GitHub Actions', position: { x: 300, y: 100 } },
    { id: '3', type: 'test_jest', label: 'Jest Tests', position: { x: 500, y: 100 } },
    { id: '4', type: 'deploy_cloud_foundry', label: 'BAS Deploy', position: { x: 700, y: 100 } },
  ],
  'abap-cloud': [
    { id: '1', type: 'plan_azure_devops', label: 'Azure DevOps', position: { x: 100, y: 100 } },
    { id: '2', type: 'code_github', label: 'GitHub Source', position: { x: 300, y: 100 } },
    { id: '3', type: 'build_jenkins', label: 'Jenkins Build', position: { x: 500, y: 100 } },
    { id: '4', type: 'test_tricentis', label: 'Tricentis Tests', position: { x: 700, y: 100 } },
    { id: '5', type: 'approval_manual', label: 'Manual Approval', position: { x: 900, y: 100 } },
    { id: '6', type: 'deploy_kubernetes', label: 'Kubernetes Deploy', position: { x: 1100, y: 100 } },
  ],
};

// Pipeline templates
export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'sap-integration-suite',
    name: 'SAP Integration Suite',
    description: 'CI/CD pipeline for SAP CPI artifacts with Jenkins and Cloud Foundry',
    icon: 'Layers',
    category: 'SAP',
    steps: TEMPLATE_FLOWS['sap-integration-suite'],
  },
  {
    id: 'sap-s4hana-extension',
    name: 'S/4HANA Extension',
    description: 'Extension development pipeline for S/4HANA with Azure DevOps',
    icon: 'Building2',
    category: 'SAP',
    steps: TEMPLATE_FLOWS['sap-s4hana-extension'],
  },
  {
    id: 'fiori-app',
    name: 'Fiori App',
    description: 'Fiori application deployment with GitHub Actions',
    icon: 'Smartphone',
    category: 'SAP',
    steps: TEMPLATE_FLOWS['fiori-app'],
  },
  {
    id: 'mobile-services',
    name: 'Mobile Services',
    description: 'Mobile services sync and deployment with CircleCI',
    icon: 'Tablet',
    category: 'Mobile',
    steps: TEMPLATE_FLOWS['mobile-services'],
  },
  {
    id: 'bas-devspace',
    name: 'BAS DevSpace',
    description: 'Business Application Studio development pipeline',
    icon: 'Code2',
    category: 'Development',
    steps: TEMPLATE_FLOWS['bas-devspace'],
  },
  {
    id: 'abap-cloud',
    name: 'ABAP Cloud',
    description: 'ABAP Cloud development with Jenkins and Tricentis',
    icon: 'Server',
    category: 'SAP',
    steps: TEMPLATE_FLOWS['abap-cloud'],
  },
];

// Smart pipeline project types
export const SMART_PIPELINE_TYPES = [
  {
    id: 'web_app',
    name: 'Web Application',
    description: 'Modern web apps with React, Vue, or Angular',
    icon: 'Globe',
  },
  {
    id: 'api_microservice',
    name: 'API / Microservice',
    description: 'RESTful APIs and microservices',
    icon: 'Server',
  },
  {
    id: 'mobile',
    name: 'Mobile Application',
    description: 'iOS, Android, or cross-platform apps',
    icon: 'Smartphone',
  },
  {
    id: 'sap_extension',
    name: 'SAP Extension',
    description: 'SAP BTP and S/4HANA extensions',
    icon: 'Building2',
  },
  {
    id: 'data_pipeline',
    name: 'Data Pipeline',
    description: 'ETL and data processing workflows',
    icon: 'Database',
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    description: 'IaC with Terraform, CloudFormation',
    icon: 'Cloud',
  },
];

// Canvas background types
export const CANVAS_BACKGROUNDS = ['dots', 'lines', 'cross', 'solid'] as const;

// Edge line styles
export const EDGE_LINE_TYPES = ['smoothstep', 'straight', 'bezier'] as const;
export const EDGE_LINE_PATTERNS = ['solid', 'dotted', 'dashed'] as const;
