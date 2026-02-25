import { useState, useMemo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnvironments, type EnvironmentRecord, type EnvironmentConnectorRecord } from "@/hooks/useEnvironments";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useIntegrationArtifacts, type IntegrationPackage } from "@/hooks/useIntegrationArtifacts";

interface IntegrationArtifactsModalProps {
  open: boolean;
  onClose: () => void;
  buildJobName?: string;
}

const ARTIFACT_TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  IntegrationDesigntimeArtifacts: { label: "IFlows", icon: FileCode, color: "bg-blue-100 text-blue-700" },
  ValueMappingDesigntimeArtifacts: { label: "Value Mappings", icon: ArrowRightLeft, color: "bg-amber-100 text-amber-700" },
  ScriptCollectionDesigntimeArtifacts: { label: "Script Collections", icon: ScrollText, color: "bg-emerald-100 text-emerald-700" },
  MessageMappingDesigntimeArtifacts: { label: "Message Mappings", icon: GitMerge, color: "bg-purple-100 text-purple-700" },
  MessageResourcesDesigntimeArtifacts: { label: "Message Resources", icon: FileText, color: "bg-rose-100 text-rose-700" },
};

export function IntegrationArtifactsModal({ open, onClose, buildJobName }: IntegrationArtifactsModalProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const accountId = selectedAccount?.id || "";
  const enterpriseId = selectedEnterprise?.id || "";

  const { environments, isLoading: envsLoading } = useEnvironments(accountId, enterpriseId);
  const { packages, loading, error, fetchPackages, reset } = useIntegrationArtifacts();

  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(Object.keys(ARTIFACT_TYPE_META)));

  // Find selected environment and its Cloud Foundry connector
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

  // Filter packages by search query and active artifact type filters
  const filteredPackages = useMemo(() => {
    if (!packages.length) return [];
    const q = searchQuery.toLowerCase().trim();
    return packages
      .map((pkg) => {
        // Filter artifact lists by active filters and search
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
        // Also match on package name
        const pkgNameMatch = !q || pkg.Name?.toLowerCase().includes(q) || pkg.Id?.toLowerCase().includes(q);
        if (pkgNameMatch && !hasMatch) {
          // If package name matches but no artifacts matched search, restore filtered artifacts
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

        {/* Search & filter bar – only show when we have packages */}
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
                    <PackageCard key={pkg.Id} pkg={pkg} />
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
      </DialogContent>
    </Dialog>
  );
}

function PackageCard({ pkg }: { pkg: IntegrationPackage }) {
  const artifactTypes = Object.entries(ARTIFACT_TYPE_META);
  const totalArtifacts = artifactTypes.reduce(
    (sum, [key]) => sum + ((pkg as any)[key]?.length || 0),
    0,
  );

  return (
    <AccordionItem value={pkg.Id} className="border rounded-lg px-4">
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex items-center gap-3 text-left">
          <Package className="w-4 h-4 text-primary shrink-0" />
          <div>
            <span className="font-medium">{pkg.Name}</span>
            <span className="text-xs text-muted-foreground ml-2">v{pkg.Version}</span>
          </div>
          <Badge variant="secondary" className="text-[10px] ml-auto mr-2">
            {totalArtifacts} artifact{totalArtifacts !== 1 ? "s" : ""}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3">
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
                  {items.map((artifact: any) => (
                    <div
                      key={artifact.Id}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50"
                    >
                      <span>{artifact.Name}</span>
                      <span className="text-muted-foreground">v{artifact.Version}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
