/**
 * Builds API Service
 * 
 * Provides build job and build execution CRUD operations
 * with automatic provider switching (Supabase ↔ NestJS/DynamoDB).
 */

import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildJob {
  id: string;
  account_id: string;
  enterprise_id: string;
  connector_name: string;
  description: string | null;
  entity: string | null;
  pipeline: string | null;
  product: string;
  service: string;
  status: string;
  scope: string | null;
  connector_icon_name: string | null;
  pipeline_stages_state: any;
  created_at: string;
  updated_at: string;
}

export interface BuildExecution {
  id: string;
  build_job_id: string;
  build_number: string;
  branch: string;
  status: string;
  duration: string | null;
  timestamp: string;
  jira_number: string | null;
  approvers: string[] | null;
  logs: string | null;
  created_at: string;
}

export interface CreateBuildJobInput {
  connector_name: string;
  description?: string;
  entity?: string;
  pipeline?: string;
  product?: string;
  service?: string;
  status?: string;
  scope?: string;
  connector_icon_name?: string;
}

export interface CreateExecutionInput {
  build_job_id: string;
  build_number: string;
  branch?: string;
  jira_number?: string;
  approvers?: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const buildsService = {
  // ── Build Jobs ──────────────────────────────────────────────────────────────

  async getBuildJobs(accountId: string, enterpriseId: string): Promise<BuildJob[]> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<BuildJob[]>('/api/builds/jobs', {
        params: { accountId, enterpriseId },
      });
      if (error) throw new Error(error.message);
      return data || [];
    }

    const { data, error } = await (supabase
      .from("build_jobs" as any)
      .select("*")
      .eq("account_id", accountId)
      .eq("enterprise_id", enterpriseId)
      .order("created_at", { ascending: false }) as any);

    if (error) throw error;
    return (data || []) as BuildJob[];
  },

  async createBuildJob(accountId: string, enterpriseId: string, input: CreateBuildJobInput): Promise<BuildJob> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.post<BuildJob>('/api/builds/jobs', {
        account_id: accountId,
        enterprise_id: enterpriseId,
        ...input,
      });
      if (error) throw new Error(error.message);
      return data!;
    }

    const { data, error } = await (supabase
      .from("build_jobs" as any)
      .insert({
        account_id: accountId,
        enterprise_id: enterpriseId,
        connector_name: input.connector_name,
        description: input.description || null,
        entity: input.entity || null,
        pipeline: input.pipeline || null,
        product: input.product || "DevOps",
        service: input.service || "Integration",
        status: input.status || "ACTIVE",
        scope: input.scope || null,
        connector_icon_name: input.connector_icon_name || null,
      })
      .select()
      .single() as any);

    if (error) throw error;
    return data as BuildJob;
  },

  async updateBuildJob(id: string, updates: Partial<CreateBuildJobInput & { pipeline_stages_state: any }>): Promise<BuildJob> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.put<BuildJob>(`/api/builds/jobs/${id}`, updates);
      if (error) throw new Error(error.message);
      return data!;
    }

    const { data, error } = await (supabase
      .from("build_jobs" as any)
      .update(updates)
      .eq("id", id)
      .select()
      .single() as any);

    if (error) throw error;
    return data as BuildJob;
  },

  async deleteBuildJob(id: string): Promise<void> {
    if (isExternalApi()) {
      const { error } = await httpClient.delete(`/api/builds/jobs/${id}`);
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await (supabase
      .from("build_jobs" as any)
      .delete()
      .eq("id", id) as any);

    if (error) throw error;
  },

  // ── Build Executions ────────────────────────────────────────────────────────

  async getExecutions(buildJobId: string): Promise<BuildExecution[]> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<BuildExecution[]>(`/api/builds/jobs/${buildJobId}/executions`);
      if (error) throw new Error(error.message);
      return data || [];
    }

    const { data, error } = await (supabase
      .from("build_executions" as any)
      .select("*")
      .eq("build_job_id", buildJobId)
      .order("timestamp", { ascending: false }) as any);

    if (error) throw error;
    return (data || []) as BuildExecution[];
  },

  async createExecution(input: CreateExecutionInput): Promise<BuildExecution> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.post<BuildExecution>(`/api/builds/jobs/${input.build_job_id}/executions`, {
        build_number: input.build_number,
        branch: input.branch || "main",
        jira_number: input.jira_number || null,
        approvers: input.approvers || null,
      });
      if (error) throw new Error(error.message);
      return data!;
    }

    const { data, error } = await (supabase
      .from("build_executions" as any)
      .insert({
        build_job_id: input.build_job_id,
        build_number: input.build_number,
        branch: input.branch || "main",
        status: "running",
        jira_number: input.jira_number || null,
        approvers: input.approvers || null,
      })
      .select()
      .single() as any);

    if (error) throw error;
    return data as BuildExecution;
  },

  async updateExecution(id: string, updates: Partial<BuildExecution>): Promise<BuildExecution> {
    if (isExternalApi()) {
      const { data, error } = await httpClient.put<BuildExecution>(`/api/builds/jobs/${(updates as any).build_job_id || 'unknown'}/executions/${id}`, updates);
      if (error) throw new Error(error.message);
      return data!;
    }

    const { data, error } = await (supabase
      .from("build_executions" as any)
      .update(updates)
      .eq("id", id)
      .select()
      .single() as any);

    if (error) throw error;
    return data as BuildExecution;
  },
};
