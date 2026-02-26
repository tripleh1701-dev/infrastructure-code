/**
 * Hook for saving/loading selected integration artifacts for a build job.
 * Persists to both `selected_artifacts` JSONB column and YAML content.
 */
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";

export interface SelectedArtifact {
  packageId: string;
  packageName: string;
  packageVersion: string;
  artifactId: string;
  artifactName: string;
  artifactVersion: string;
  artifactType: string; // e.g. "IntegrationDesigntimeArtifacts"
}

export function useSelectedArtifacts(buildJobId: string | undefined) {
  const [selectedArtifacts, setSelectedArtifacts] = useState<SelectedArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load saved selections when buildJobId changes
  useEffect(() => {
    if (!buildJobId) return;
    loadSelections(buildJobId);
  }, [buildJobId]);

  async function loadSelections(id: string) {
    setLoading(true);
    try {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<any>(`/builds/jobs/${id}`);
        if (error) throw new Error(error.message);
        const raw = data?.selectedArtifacts ?? data?.selected_artifacts ?? [];
        setSelectedArtifacts(Array.isArray(raw) ? raw : []);
      } else {
        const { data, error } = await (supabase
          .from("build_jobs" as any)
          .select("selected_artifacts")
          .eq("id", id)
          .single() as any);
        if (error) throw error;
        const raw = (data as any)?.selected_artifacts ?? [];
        setSelectedArtifacts(Array.isArray(raw) ? raw : []);
      }
    } catch {
      // Silently fail on load – user can still make fresh selections
      setSelectedArtifacts([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveSelections(artifacts: SelectedArtifact[]) {
    if (!buildJobId) return;
    setSaving(true);
    try {
      if (isExternalApi()) {
        const { error } = await httpClient.put(`/builds/jobs/${buildJobId}`, {
          selectedArtifacts: artifacts,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await (supabase
          .from("build_jobs" as any)
          .update({ selected_artifacts: artifacts })
          .eq("id", buildJobId) as any);
        if (error) throw error;
      }
      setSelectedArtifacts(artifacts);
      toast.success(`Saved ${artifacts.length} artifact selection(s)`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save artifact selections");
    } finally {
      setSaving(false);
    }
  }

  const isSelected = useCallback(
    (packageId: string, artifactId: string, artifactType: string) =>
      selectedArtifacts.some(
        (a) => a.packageId === packageId && a.artifactId === artifactId && a.artifactType === artifactType,
      ),
    [selectedArtifacts],
  );

  const isPackageFullySelected = useCallback(
    (packageId: string, totalArtifactIds: { id: string; type: string }[]) =>
      totalArtifactIds.length > 0 &&
      totalArtifactIds.every((a) =>
        selectedArtifacts.some(
          (s) => s.packageId === packageId && s.artifactId === a.id && s.artifactType === a.type,
        ),
      ),
    [selectedArtifacts],
  );

  return {
    selectedArtifacts,
    setSelectedArtifacts,
    loading,
    saving,
    saveSelections,
    isSelected,
    isPackageFullySelected,
  };
}
