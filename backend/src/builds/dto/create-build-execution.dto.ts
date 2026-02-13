export class CreateBuildExecutionDto {
  buildJobId: string;
  buildNumber: string;
  branch?: string;
  jiraNumber?: string;
  approvers?: string[];
}
