import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";

export interface ExecutionListItem {
  executionId: string;
  pipelineId: string;
  buildJobId?: string;
  status: string;
  startTime: string;
  endTime?: string;
  currentNode?: string;
  currentStage?: string;
  branch?: string;
}

/**
 * Executions API Service
 * 
 * Provides methods to interact with the pipeline execution backend.
 */
export const executionsService = {
  /**
   * Start a pipeline execution
   */
  async run(pipelineId: string, buildJobId?: string, branch?: string, approverEmails?: string[]) {
    if (!isExternalApi()) {
      return { data: { executionId: crypto.randomUUID() }, error: null };
    }
    
    try {
      const response = await httpClient.post<{ executionId: string }>(
        '/executions/run',
        { pipelineId, buildJobId, branch, approverEmails },
      );
      return { data: response.data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  /**
   * Get execution logs (for polling)
   */
  async getLogs(executionId: string) {
    if (!isExternalApi()) {
      return { data: null, error: { message: 'Not available in Supabase mode' } };
    }

    try {
      const response = await httpClient.get<any>(`/executions/${executionId}/logs`);
      return { data: response.data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },

  /**
   * List executions for a pipeline
   */
  async listForPipeline(pipelineId: string) {
    if (!isExternalApi()) {
      return { data: [], error: null };
    }

    try {
      const response = await httpClient.get<ExecutionListItem[]>(
        `/executions/pipeline/${pipelineId}`,
      );
      return { data: response.data || [], error: null };
    } catch (error: any) {
      return { data: [], error: { message: error.message } };
    }
  },

  /**
   * Approve a stage
   */
  async approveStage(executionId: string, stageId: string) {
    if (!isExternalApi()) {
      return { data: { message: 'Simulated approval' }, error: null };
    }

    try {
      const response = await httpClient.post<{ message: string }>(
        `/executions/${executionId}/approve/${stageId}`,
        {},
      );
      return { data: response.data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },
};
