import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface Pipeline {
  id: string;
  account_id: string;
  enterprise_id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "inactive" | "archived";
  deployment_type: string;
  nodes: Json;
  edges: Json;
  yaml_content: string | null;
  product_id: string | null;
  service_ids: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePipelineInput {
  name: string;
  description?: string;
  status?: "draft" | "active" | "inactive" | "archived";
  deployment_type?: string;
  nodes?: Json;
  edges?: Json;
  yaml_content?: string;
  product_id?: string;
  service_ids?: string[];
}

export interface UpdatePipelineInput extends Partial<CreatePipelineInput> {
  id: string;
}

export function usePipelines() {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const selectedAccountId = selectedAccount?.id;
  const selectedEnterpriseId = selectedEnterprise?.id;

  // Fetch all pipelines for the current account/enterprise context
  const {
    data: pipelines = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["pipelines", selectedAccountId, selectedEnterpriseId],
    queryFn: async () => {
      if (!selectedAccountId) return [];

      if (isExternalApi()) {
        const { data, error } = await httpClient.get<Pipeline[]>('/api/pipelines', {
          params: { accountId: selectedAccountId, enterpriseId: selectedEnterpriseId },
        });
        if (error) throw new Error(error.message);
        return data || [];
      }

      let query = supabase
        .from("pipelines")
        .select("*")
        .eq("account_id", selectedAccountId)
        .order("updated_at", { ascending: false });

      if (selectedEnterpriseId) {
        query = query.eq("enterprise_id", selectedEnterpriseId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching pipelines:", error);
        throw error;
      }

      return (data || []) as Pipeline[];
    },
    enabled: !!selectedAccountId,
  });

  // Fetch a single pipeline by ID
  const fetchPipeline = useCallback(async (id: string): Promise<Pipeline | null> => {
    if (isExternalApi()) {
      const { data, error } = await httpClient.get<Pipeline>(`/api/pipelines/${id}`);
      if (error) return null;
      return data;
    }

    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching pipeline:", error);
      return null;
    }

    return data as Pipeline;
  }, []);

  // Create a new pipeline
  const createPipelineMutation = useMutation({
    mutationFn: async (input: CreatePipelineInput) => {
      if (!selectedAccountId || !selectedEnterpriseId) {
        throw new Error("Account and Enterprise must be selected");
      }

      if (isExternalApi()) {
        const { data, error } = await httpClient.post<Pipeline>('/api/pipelines', {
          ...input,
          accountId: selectedAccountId,
          enterpriseId: selectedEnterpriseId,
        });
        if (error) throw new Error(error.message);
        return data as Pipeline;
      }

      const { data, error } = await supabase
        .from("pipelines")
        .insert({
          account_id: selectedAccountId,
          enterprise_id: selectedEnterpriseId,
          name: input.name,
          description: input.description || null,
          status: input.status || "draft",
          deployment_type: input.deployment_type || "Integration",
          nodes: input.nodes || [],
          edges: input.edges || [],
          yaml_content: input.yaml_content || null,
          product_id: input.product_id || null,
          service_ids: input.service_ids || [],
          created_by: user?.sub || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating pipeline:", error);
        throw error;
      }

      return data as Pipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Pipeline created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create pipeline: " + error.message);
    },
  });

  // Update an existing pipeline
  const updatePipelineMutation = useMutation({
    mutationFn: async (input: UpdatePipelineInput) => {
      if (isExternalApi()) {
        const { id, ...updates } = input;
        const { data, error } = await httpClient.put<Pipeline>(`/api/pipelines/${id}`, updates);
        if (error) throw new Error(error.message);
        return data as Pipeline;
      }

      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from("pipelines")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating pipeline:", error);
        throw error;
      }

      return data as Pipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Pipeline saved successfully");
    },
    onError: (error) => {
      toast.error("Failed to save pipeline: " + error.message);
    },
  });

  // Delete a pipeline
  const deletePipelineMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/api/pipelines/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from("pipelines").delete().eq("id", id);

      if (error) {
        console.error("Error deleting pipeline:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Pipeline deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete pipeline: " + error.message);
    },
  });

  return {
    pipelines,
    isLoading,
    error,
    refetch,
    fetchPipeline,
    createPipeline: createPipelineMutation.mutateAsync,
    updatePipeline: updatePipelineMutation.mutateAsync,
    deletePipeline: deletePipelineMutation.mutateAsync,
    isCreating: createPipelineMutation.isPending,
    isUpdating: updatePipelineMutation.isPending,
    isDeleting: deletePipelineMutation.isPending,
    selectedAccountId,
    selectedEnterpriseId,
  };
}
