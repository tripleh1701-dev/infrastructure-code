import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Package, FileCode, ArrowRightLeft, ScrollText, GitMerge, FileText } from "lucide-react";

interface ArtifactsSummaryProps {
  selectedArtifacts: any[] | null | undefined;
}

const TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  IntegrationDesigntimeArtifacts: { label: "IFlows", icon: FileCode, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  ValueMappingDesigntimeArtifacts: { label: "Value Mappings", icon: ArrowRightLeft, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  ScriptCollectionDesigntimeArtifacts: { label: "Script Collections", icon: ScrollText, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  MessageMappingDesigntimeArtifacts: { label: "Message Mappings", icon: GitMerge, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  MessageResourcesDesigntimeArtifacts: { label: "Message Resources", icon: FileText, color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

export function ArtifactsSummary({ selectedArtifacts }: ArtifactsSummaryProps) {
  const artifacts = useMemo(() => (Array.isArray(selectedArtifacts) ? selectedArtifacts : []), [selectedArtifacts]);

  const grouped = useMemo(() => {
    const byPkg = new Map<string, { name: string; version: string; artifacts: { name: string; type: string; id: string }[] }>();
    for (const a of artifacts) {
      const pkgId = a.packageId || "unknown";
      if (!byPkg.has(pkgId)) {
        byPkg.set(pkgId, { name: a.packageName || pkgId, version: a.packageVersion || "", artifacts: [] });
      }
      byPkg.get(pkgId)!.artifacts.push({
        name: a.artifactName || a.artifactId || "",
        type: a.artifactType || "",
        id: a.artifactId || "",
      });
    }
    return byPkg;
  }, [artifacts]);

  if (artifacts.length === 0) {
    return (
      <div className="col-span-full mt-1 bg-muted/30 rounded-lg p-3 border border-border/30">
        <p className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
          <Package className="w-3 h-3" /> Selected Artifacts
        </p>
        <p className="text-xs text-muted-foreground">No artifacts selected</p>
      </div>
    );
  }

  return (
    <div className="col-span-full mt-1 space-y-2">
      <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
        <Package className="w-3 h-3" /> Selected Artifacts
        <Badge variant="secondary" className="text-[9px] ml-1 px-1.5 py-0">{artifacts.length}</Badge>
      </p>
      {[...grouped.entries()].map(([pkgId, pkg]) => (
        <div key={pkgId} className="bg-muted/30 rounded-lg p-2.5 border border-border/30">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Package className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium text-foreground">{pkg.name}</span>
            <span className="text-[10px] text-muted-foreground">v{pkg.version}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {pkg.artifacts.map((art) => {
              const meta = TYPE_META[art.type];
              const Icon = meta?.icon || FileCode;
              return (
                <Badge
                  key={`${art.id}-${art.type}`}
                  variant="secondary"
                  className={`text-[10px] gap-1 ${meta?.color || ""}`}
                >
                  <Icon className="w-2.5 h-2.5" />
                  {art.name}
                </Badge>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
