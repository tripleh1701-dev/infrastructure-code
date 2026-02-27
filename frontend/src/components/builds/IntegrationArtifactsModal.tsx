import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Package,
  FileCode,
  ArrowRightLeft,
  ScrollText,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  GitMerge,
  FileText,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnvironments, type EnvironmentRecord, type EnvironmentConnectorRecord } from "@/hooks/useEnvironments";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useIntegrationArtifacts, type IntegrationPackage } from "@/hooks/useIntegrationArtifacts";
import { useSelectedArtifacts, type SelectedArtifact } from "@/hooks/useSelectedArtifacts";

interface IntegrationArtifactsModalProps {
  open: boolean;
  onClose: () => void;
  buildJobName?: string;
  buildJobId?: string;
  /** Called after artifacts are saved so the build YAML can be regenerated */
  onAfterSave?: () => void;
}

const ARTIFACT_TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  IntegrationDesigntimeArtifacts: { label: "IFlows", icon: FileCode, color: "bg-blue-100 text-blue-700" },
  ValueMappingDesigntimeArtifacts: { label: "Value Mappings", icon: ArrowRightLeft, color: "bg-amber-100 text-amber-700" },
  ScriptCollectionDesigntimeArtifacts: { label: "Script Collections", icon: ScrollText, color: "bg-emerald-100 text-emerald-700" },
  MessageMappingDesigntimeArtifacts: { label: "Message Mappings", icon: GitMerge, color: "bg-purple-100 text-purple-700" },
  MessageResourcesDesigntimeArtifacts: { label: "Message Resources", icon: FileText, color: "bg-rose-100 text-rose-700" },
};

export function IntegrationArtifactsModal({ open, onClose, buildJobName, buildJobId, onAfterSave }: IntegrationArtifactsModalProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const accountId = selectedAccount?.id || "";
  const enterpriseId = selectedEnterprise?.id || "";

  const { environments, isLoading: envsLoading } = useEnvironments(accountId, enterpriseId);
  const { packages, loading, error, fetchPackages, reset } = useIntegrationArtifacts();
  const {
    selectedArtifacts: savedArtifacts,
    saving,
    saveSelections,
    loading: loadingSaved,
  } = useSelectedArtifacts(buildJobId, onAfterSave);

  // Local selection state (synced from saved on load)
  const [localSelections, setLocalSelections] = useState<SelectedArtifact[]>([]);
  const [selectionsInitialized, setSelectionsInitialized] = useState(false);

  // Sync saved artifacts into local state once loaded
  useMemo(() => {
    if (!loadingSaved && savedArtifacts.length > 0 && !selectionsInitialized) {
      setLocalSelections(savedArtifacts);
      setSelectionsInitialized(true);
    }
  }, [loadingSaved, savedArtifacts, selectionsInitialized]);

  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(Object.keys(ARTIFACT_TYPE_META)));

  const selectedEnv = useMemo(
    () => environments.find((e) => e.id === selectedEnvId) || null,
    [environments, selectedEnvId],
  );

  const cfConnector = useMemo<EnvironmentConnectorRecord | null>(() => {
    if (!selectedEnv?.connectors) return null;
    return (
      selectedEnv.connectors.find(
        (c) =>
          c.category?.toLowerCase() === "deploy" &&
          (c.connector?.toLowerCase().includes("cloud foundry") ||
           c.connector?.toLowerCase().includes("cloudfoundry") ||
           c.connector?.toLowerCase().includes("sap cpi")),
      ) || null
    );
  }, [selectedEnv]);

  function handleFetch() {
    if (!selectedEnv || !cfConnector) return;
    fetchPackages(selectedEnv, cfConnector, accountId, enterpriseId);
  }

  function handleClose() {
    reset();
    setSelectedEnvId("");
    setSearchQuery("");
    setActiveFilters(new Set(Object.keys(ARTIFACT_TYPE_META)));
    setLocalSelections([]);
    setSelectionsInitialized(false);
    onClose();
  }

  function toggleFilter(key: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Selection helpers ──────────────────────────────────────────────────────
  const isArtifactSelected = useCallback(
    (packageId: string, artifactId: string, artifactType: string) =>
      localSelections.some(
        (a) => a.packageId === packageId && a.artifactId === artifactId && a.artifactType === artifactType,
      ),
    [localSelections],
  );

  const toggleArtifact = useCallback(
    (pkg: IntegrationPackage, artifact: any, artifactType: string) => {
      setLocalSelections((prev) => {
        const exists = prev.some(
          (a) => a.packageId === pkg.Id && a.artifactId === artifact.Id && a.artifactType === artifactType,
        );
        if (exists) {
          return prev.filter(
            (a) => !(a.packageId === pkg.Id && a.artifactId === artifact.Id && a.artifactType === artifactType),
          );
        }
        return [
          ...prev,
          {
            packageId: pkg.Id,
            packageName: pkg.Name,
            packageVersion: pkg.Version,
            artifactId: artifact.Id,
            artifactName: artifact.Name,
            artifactVersion: artifact.Version,
            artifactType,
          },
        ];
      });
    },
    [],
  );

  const togglePackage = useCallback(
    (pkg: IntegrationPackage) => {
      const allArtifacts: { id: string; type: string }[] = [];
      for (const key of Object.keys(ARTIFACT_TYPE_META)) {
        const items: any[] = (pkg as any)[key] || [];
        items.forEach((a) => allArtifacts.push({ id: a.Id, type: key }));
      }
      const allSelected = allArtifacts.every((a) =>
        localSelections.some((s) => s.packageId === pkg.Id && s.artifactId === a.id && s.artifactType === a.type),
      );

      setLocalSelections((prev) => {
        if (allSelected) {
          return prev.filter((s) => s.packageId !== pkg.Id);
        }
        const existing = prev.filter((s) => s.packageId !== pkg.Id);
        const newEntries: SelectedArtifact[] = [];
        for (const key of Object.keys(ARTIFACT_TYPE_META)) {
          const items: any[] = (pkg as any)[key] || [];
          items.forEach((a) =>
            newEntries.push({
              packageId: pkg.Id,
              packageName: pkg.Name,
              packageVersion: pkg.Version,
              artifactId: a.Id,
              artifactName: a.Name,
              artifactVersion: a.Version,
              artifactType: key,
            }),
          );
        }
        return [...existing, ...newEntries];
      });
    },
    [localSelections],
  );

  const isPackageFullySelected = useCallback(
    (pkg: IntegrationPackage) => {
      const allArtifacts: { id: string; type: string }[] = [];
      for (const key of Object.keys(ARTIFACT_TYPE_META)) {
        ((pkg as any)[key] || []).forEach((a: any) => allArtifacts.push({ id: a.Id, type: key }));
      }
      return (
        allArtifacts.length > 0 &&
        allArtifacts.every((a) =>
          localSelections.some((s) => s.packageId === pkg.Id && s.artifactId === a.id && s.artifactType === a.type),
        )
      );
    },
    [localSelections],
  );

  const isPackagePartiallySelected = useCallback(
    (pkg: IntegrationPackage) => {
      return (
        localSelections.some((s) => s.packageId === pkg.Id) && !isPackageFullySelected(pkg)
      );
    },
    [localSelections, isPackageFullySelected],
  );

  const selectionCount = localSelections.length;

  async function handleSave() {
    await saveSelections(localSelections);
  }

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filteredPackages = useMemo(() => {
    if (!packages.length) return [];
    const q = searchQuery.toLowerCase().trim();
    return packages
      .map((pkg) => {
        const filtered: any = { ...pkg };
        let hasMatch = false;
        for (const key of Object.keys(ARTIFACT_TYPE_META)) {
          const items: any[] = (pkg as any)[key] || [];
          if (!activeFilters.has(key)) {
            filtered[key] = [];
            continue;
          }
          const matched = q
            ? items.filter((a) => a.Name?.toLowerCase().includes(q) || a.Id?.toLowerCase().includes(q))
            : items;
          filtered[key] = matched;
          if (matched.length > 0) hasMatch = true;
        }
        const pkgNameMatch = !q || pkg.Name?.toLowerCase().includes(q) || pkg.Id?.toLowerCase().includes(q);
        if (pkgNameMatch && !hasMatch) {
          for (const key of Object.keys(ARTIFACT_TYPE_META)) {
            if (activeFilters.has(key)) filtered[key] = (pkg as any)[key] || [];
            hasMatch = ((pkg as any)[key] || []).length > 0 || hasMatch;
          }
        }
        return { pkg: filtered as IntegrationPackage, visible: hasMatch || pkgNameMatch };
      })
      .filter((p) => p.visible)
      .map((p) => p.pkg);
  }, [packages, searchQuery, activeFilters]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Integration Artifacts
            {buildJobName && (
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                {buildJobName}
              </Badge>
            )}
            {selectionCount > 0 && (
              <Badge variant="default" className="ml-auto text-xs">
                {selectionCount} selected
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Environment Selector */}
        <div className="flex items-end gap-3 py-2">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Environment</label>
            <Select
              value={selectedEnvId}
              onValueChange={(v) => {
                setSelectedEnvId(v);
                reset();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={envsLoading ? "Loading…" : "Select an environment"} />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                    {env.workstream && ` · ${env.workstream.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleFetch}
            disabled={!selectedEnvId || !cfConnector || loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Fetch Packages
          </Button>
        </div>

        {/* Status messages */}
        {selectedEnvId && !cfConnector && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            No Cloud Foundry / SAP CPI connector found in this environment.
          </div>
        )}

        {cfConnector && !loading && packages.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            Connector: <strong>{cfConnector.connector}</strong>
            {cfConnector.apiUrl && (
              <> · <span className="font-mono text-xs">{cfConnector.apiUrl}</span></>
            )}
          </p>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Search & filter bar */}
        {packages.length > 0 && !loading && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search packages or artifacts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
              {Object.entries(ARTIFACT_TYPE_META).map(([key, meta]) => {
                const Icon = meta.icon;
                const active = activeFilters.has(key);
                return (
                  <Badge
                    key={key}
                    variant={active ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer text-[11px] gap-1 select-none transition-colors",
                      active && meta.color,
                    )}
                    onClick={() => toggleFilter(key)}
                  >
                    <Icon className="w-3 h-3" />
                    {meta.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Packages list */}
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 gap-3"
              >
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Fetching packages from SAP CPI…</p>
              </motion.div>
            ) : filteredPackages.length > 0 ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2 pb-4"
              >
                <p className="text-sm text-muted-foreground mb-3">
                  {filteredPackages.length} of {packages.length} package(s)
                </p>
                <Accordion type="multiple" className="space-y-2">
                  {filteredPackages.map((pkg) => (
                    <PackageCard
                      key={pkg.Id}
                      pkg={pkg}
                      isArtifactSelected={isArtifactSelected}
                      toggleArtifact={toggleArtifact}
                      togglePackage={togglePackage}
                      isPackageFullySelected={isPackageFullySelected(pkg)}
                      isPackagePartiallySelected={isPackagePartiallySelected(pkg)}
                    />
                  ))}
                </Accordion>
              </motion.div>
            ) : packages.length > 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm"
              >
                No artifacts match your filters.
              </motion.div>
            ) : null}
          </AnimatePresence>
        </ScrollArea>

        {/* Save Selection footer */}
        {(packages.length > 0 || selectionCount > 0) && buildJobId && (
          <div className="flex items-center justify-between pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              {selectionCount} artifact{selectionCount !== 1 ? "s" : ""} selected
            </p>
            <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Selection
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Package Card with checkboxes ─────────────────────────────────────────────

interface PackageCardProps {
  pkg: IntegrationPackage;
  isArtifactSelected: (packageId: string, artifactId: string, artifactType: string) => boolean;
  toggleArtifact: (pkg: IntegrationPackage, artifact: any, artifactType: string) => void;
  togglePackage: (pkg: IntegrationPackage) => void;
  isPackageFullySelected: boolean;
  isPackagePartiallySelected: boolean;
}

function PackageCard({
  pkg,
  isArtifactSelected,
  toggleArtifact,
  togglePackage,
  isPackageFullySelected,
  isPackagePartiallySelected,
}: PackageCardProps) {
  const artifactTypes = Object.entries(ARTIFACT_TYPE_META);
  const totalArtifacts = artifactTypes.reduce(
    (sum, [key]) => sum + ((pkg as any)[key]?.length || 0),
    0,
  );

  const selectedCount = artifactTypes.reduce((sum, [key]) => {
    const items: any[] = (pkg as any)[key] || [];
    return sum + items.filter((a) => isArtifactSelected(pkg.Id, a.Id, key)).length;
  }, 0);

  return (
    <AccordionItem value={pkg.Id} className="border rounded-lg px-4">
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex items-center gap-3 text-left w-full">
          <Checkbox
            checked={isPackageFullySelected ? true : isPackagePartiallySelected ? "indeterminate" : false}
            onCheckedChange={() => togglePackage(pkg)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />
          <Package className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="font-medium">{pkg.Name}</span>
            <span className="text-xs text-muted-foreground ml-2">v{pkg.Version}</span>
          </div>
          <div className="ml-auto mr-2 flex items-center gap-1.5 shrink-0">
            {selectedCount > 0 && (
              <Badge variant="default" className="text-[10px]">
                {selectedCount} selected
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">
              {totalArtifacts} artifact{totalArtifacts !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        <ScrollArea className="max-h-[280px]">
          <div className="space-y-3">
            {artifactTypes.map(([key, meta]) => {
              const items = (pkg as any)[key] || [];
              if (items.length === 0) return null;
              const Icon = meta.icon;
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">{meta.label}</span>
                    <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", meta.color)}>
                      {items.length}
                    </Badge>
                  </div>
                  <div className="pl-6 space-y-1">
                    {items.map((artifact: any) => {
                      const selected = isArtifactSelected(pkg.Id, artifact.Id, key);
                      return (
                        <div
                          key={artifact.Id}
                          className={cn(
                            "flex items-center gap-2 text-xs py-1.5 px-2 rounded cursor-pointer transition-colors",
                            selected ? "bg-primary/10 border border-primary/20" : "bg-muted/50 hover:bg-muted",
                          )}
                          onClick={() => toggleArtifact(pkg, artifact, key)}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleArtifact(pkg, artifact, key)}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                          />
                          <span className="flex-1 min-w-0 truncate">{artifact.Name}</span>
                          <span className="text-muted-foreground shrink-0">v{artifact.Version}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </AccordionContent>
    </AccordionItem>
  );
}
