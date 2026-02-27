import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { BuildJob } from "@/hooks/useBuilds";
import { usePipelines } from "@/hooks/usePipelines";
import { useConnectors, ConnectorRecord } from "@/hooks/useConnectors";
import { useEnvironments, EnvironmentRecord } from "@/hooks/useEnvironments";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Server,
  GitBranch,
  Monitor,
  FlaskConical,
  Rocket,
  Save,
  AlertCircle,
  Link,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_LABELS } from "@/constants/pipeline";
import { PIPELINE_NODE_ICONS } from "@/components/pipeline/icons/BrandIcons";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedStage {
  id: string;
  type: string;
  label: string;
  category: string;
  tool: string;
  status?: string;
}

interface EnvironmentNode {
  id: string;
  type: string;
  label: string;
  stages: ParsedStage[];
  status?: string;
}

interface StagesState {
  selectedConnectors: Record<string, string>;
  selectedEnvironments: Record<string, string>;
  connectorRepositoryUrls: Record<string, string>;
  selectedBranches: Record<string, string>;
  selectedApprovers: Record<string, string[]>;
  jiraNumbers: Record<string, string>;
  [key: string]: any;
}

interface PipelineStagesSubRowProps {
  build: BuildJob;
  onUpdateStagesState: (buildId: string, state: StagesState) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategoryFromType(type: string): string {
  if (type.startsWith("plan_")) return "plan";
  if (type.startsWith("code_")) return "code";
  if (type.startsWith("build_")) return "build";
  if (type.startsWith("test_")) return "test";
  if (type.startsWith("deploy_")) return "deploy";
  if (type.startsWith("release_")) return "release";
  if (type.startsWith("approval_")) return "approval";
  if (type.startsWith("env_")) return "environment";
  return "other";
}

function getToolFromType(type: string): string {
  return type.split("_").slice(1).join("_");
}

function parsePipelineStructure(nodes: any[], edges: any[]): EnvironmentNode[] {
  if (!nodes || !Array.isArray(nodes)) return [];

  const envNodes: any[] = [];
  const stageNodes: any[] = [];

  nodes.forEach((node) => {
    const nodeType = node.data?.nodeType || node.type || node.data?.type || "";
    const category = getCategoryFromType(nodeType);
    if (category === "environment") {
      envNodes.push({ ...node, _resolvedType: nodeType });
    } else if (category !== "other" && nodeType !== "note" && nodeType !== "comment") {
      stageNodes.push({ ...node, _resolvedType: nodeType });
    }
  });

  const edgeMap = new Map<string, string[]>();
  const reverseEdgeMap = new Map<string, string[]>();
  (edges || []).forEach((edge: any) => {
    if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, []);
    edgeMap.get(edge.source)!.push(edge.target);
    if (!reverseEdgeMap.has(edge.target)) reverseEdgeMap.set(edge.target, []);
    reverseEdgeMap.get(edge.target)!.push(edge.source);
  });

  const envNodeIds = new Set(envNodes.map((n) => n.id));

  function findOwnerEnv(stageId: string, visited = new Set<string>()): string | null {
    if (visited.has(stageId)) return null;
    visited.add(stageId);
    const sources = reverseEdgeMap.get(stageId) || [];
    for (const src of sources) {
      if (envNodeIds.has(src)) return src;
      const found = findOwnerEnv(src, visited);
      if (found) return found;
    }
    return null;
  }

  const envStagesMap = new Map<string, ParsedStage[]>();
  envNodes.forEach((n) => envStagesMap.set(n.id, []));

  const nodeParentMap = new Map<string, string>();
  nodes.forEach((node) => {
    if (node.parentId) nodeParentMap.set(node.id, node.parentId);
  });

  const ungroupedStages: ParsedStage[] = [];

  stageNodes.forEach((node) => {
    const nodeType = node._resolvedType || node.data?.nodeType || node.type || node.data?.type || "";
    const category = getCategoryFromType(nodeType);
    const stage: ParsedStage = {
      id: node.id,
      type: nodeType,
      label: (NODE_LABELS as any)[nodeType] || node.data?.label || nodeType,
      category,
      tool: getToolFromType(nodeType),
      status: node.data?.status as string,
    };

    // If only one environment exists, ALL stages belong to it — no General bucket
    if (envNodes.length === 1) {
      envStagesMap.get(envNodes[0].id)!.push(stage);
      return;
    }

    const parentId = nodeParentMap.get(node.id);
    if (parentId && envStagesMap.has(parentId)) {
      envStagesMap.get(parentId)!.push(stage);
    } else {
      const ownerEnv = findOwnerEnv(node.id);
      if (ownerEnv && envStagesMap.has(ownerEnv)) {
        envStagesMap.get(ownerEnv)!.push(stage);
      } else {
        ungroupedStages.push(stage);
      }
    }
  });

  const categoryOrder = ["plan", "code", "build", "test", "approval", "deploy", "release"];
  const sortStages = (stages: ParsedStage[]) =>
    stages.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

  const DEPLOYMENT_ORDER = ["env_dev", "env_qa", "env_staging", "env_uat", "env_prod"];

  const result: EnvironmentNode[] = envNodes
    .sort((a, b) => {
      const aType = a._resolvedType || a.data?.nodeType || "";
      const bType = b._resolvedType || b.data?.nodeType || "";
      return (DEPLOYMENT_ORDER.indexOf(aType) >= 0 ? DEPLOYMENT_ORDER.indexOf(aType) : 999) -
             (DEPLOYMENT_ORDER.indexOf(bType) >= 0 ? DEPLOYMENT_ORDER.indexOf(bType) : 999);
    })
    .map((node) => {
      const nodeType = node._resolvedType || node.data?.nodeType || node.type || node.data?.type || "";
      return {
        id: node.id,
        type: nodeType,
        label: (NODE_LABELS as any)[nodeType] || node.data?.label || nodeType,
        stages: sortStages(envStagesMap.get(node.id) || []),
        status: node.data?.status as string,
      };
    });

  if (ungroupedStages.length > 0) {
    result.unshift({
      id: "__general",
      type: "general",
      label: "General",
      stages: sortStages(ungroupedStages),
    });
  }

  return result;
}

// ─── Env Tab Icons ──────────────────────────────────────────────────────────

const ENV_TAB_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  env_dev: { icon: Monitor, color: "#16a34a" },
  env_qa: { icon: FlaskConical, color: "#2563eb" },
  env_staging: { icon: Server, color: "#ca8a04" },
  env_uat: { icon: Server, color: "#7c3aed" },
  env_prod: { icon: Rocket, color: "#dc2626" },
  general: { icon: Server, color: "#4f46e5" },
};

// ─── Stage Config Row ───────────────────────────────────────────────────────

interface AccountUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_technical_user: boolean;
}

interface StageConfigRowProps {
  stage: ParsedStage;
  envId: string;
  stagesState: StagesState;
  connectors: ConnectorRecord[];
  connectorsLoading: boolean;
  accountUsers: AccountUser[];
  accountUsersLoading: boolean;
  environments: EnvironmentRecord[];
  environmentsLoading: boolean;
  onConnectorChange: (key: string, val: string) => void;
  onEnvironmentChange: (key: string, val: string) => void;
  onRepoUrlChange: (key: string, val: string) => void;
  onBranchChange: (key: string, val: string) => void;
  onApproverChange: (key: string, emails: string[]) => void;
  onJiraNumberChange: (key: string, val: string) => void;
}

function StageConfigRow({
  stage, envId, stagesState, connectors, connectorsLoading,
  accountUsers, accountUsersLoading, environments, environmentsLoading,
  onConnectorChange, onEnvironmentChange, onRepoUrlChange, onBranchChange, onApproverChange, onJiraNumberChange,
}: StageConfigRowProps) {
  const stageKey = `${envId}__${stage.id}`;
  const isDeploy = stage.category === "deploy";
  const isCode = stage.category === "code";
  const isApproval = stage.category === "approval";
  const isJira = stage.type === "plan_jira";
  const NodeIcon = PIPELINE_NODE_ICONS[stage.type];
  const JIRA_REGEX = /^[A-Z][A-Z0-9]+-\d+$/;

  const availableConnectors = connectors.filter(
    (c) => c.category?.toLowerCase() === stage.category
  );

  const selectedConnectorId = stagesState.selectedConnectors[stageKey] || "";
  const selectedEnv = stagesState.selectedEnvironments[stageKey] || "";
  const repoUrl = stagesState.connectorRepositoryUrls[stageKey] || "";
  const branch = stagesState.selectedBranches[stageKey] || "";
  const selectedApproverEmails = stagesState.selectedApprovers?.[stageKey] || [];
  const jiraNumber = stagesState.jiraNumbers?.[stageKey] || "";
  const jiraValid = jiraNumber === "" || JIRA_REGEX.test(jiraNumber);
  const isConfigured = !!(selectedConnectorId || selectedEnv || (isApproval && selectedApproverEmails.length > 0) || (isJira && jiraNumber && jiraValid));

  return (
    <div className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
      {/* Icon + Label */}
      <div className="flex items-center gap-2.5 min-w-[160px]">
        <div className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center bg-background">
          {NodeIcon ? <NodeIcon className="w-4 h-4" /> : <Server className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div>
          <p className="text-xs font-medium text-foreground">{stage.label}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Badge variant="outline" className="text-[9px] capitalize px-1 h-3.5">{stage.category}</Badge>
            {isConfigured && (
              <Badge variant="outline" className="text-[9px] px-1 h-3.5 border-primary/40 text-primary">
                <Link className="w-2 h-2 mr-0.5" /> Linked
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Config Fields */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {isApproval ? (
          <div className="space-y-1 col-span-2">
            <Label className="text-[10px] text-muted-foreground">Approvers (Users & Technical Users)</Label>
            <Select
              value="__multi"
              onValueChange={(userId) => {
                if (userId === "__multi") return;
                const user = accountUsers.find((u) => u.id === userId);
                if (!user) return;
                const isAlready = selectedApproverEmails.includes(user.email);
                const next = isAlready
                  ? selectedApproverEmails.filter((e) => e !== user.email)
                  : [...selectedApproverEmails, user.email];
                onApproverChange(stageKey, next);
              }}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder={
                  accountUsersLoading ? "Loading users..." :
                  accountUsers.length === 0 ? "No users available" :
                  selectedApproverEmails.length === 0 ? "Select approvers..." :
                  `${selectedApproverEmails.length} approver(s) selected`
                } />
              </SelectTrigger>
              <SelectContent className="bg-popover z-[100]">
                {accountUsersLoading ? (
                  <SelectItem value="__loading" disabled>Loading...</SelectItem>
                ) : accountUsers.length === 0 ? (
                  <SelectItem value="__empty" disabled>No users found</SelectItem>
                ) : (
                  accountUsers.map((user) => {
                    const isSelected = selectedApproverEmails.includes(user.email);
                    return (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <span className={isSelected ? "font-semibold" : ""}>{user.first_name} {user.last_name}</span>
                          <span className="text-[10px] text-muted-foreground">({user.email})</span>
                          {user.is_technical_user && (
                            <Badge variant="outline" className="text-[8px] px-0.5 h-3">Tech</Badge>
                          )}
                          {isSelected && <span className="text-primary text-[10px]">✓</span>}
                        </div>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
            {selectedApproverEmails.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedApproverEmails.map((email) => {
                  const user = accountUsers.find((u) => u.email === email);
                  return (
                    <span key={email} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-[9px] text-primary">
                      {user ? `${user.first_name} ${user.last_name}` : email}
                      <button
                        type="button"
                        className="hover:text-destructive ml-0.5"
                        onClick={() => onApproverChange(stageKey, selectedApproverEmails.filter((e) => e !== email))}
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}
            {selectedApproverEmails.length === 0 && (
              <p className="text-[9px] text-amber-500">No approvers selected — this stage will be skipped during execution</p>
            )}
          </div>
        ) : isDeploy ? (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Environment</Label>
            <Select value={selectedEnv} onValueChange={(v) => onEnvironmentChange(stageKey, v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder={
                  environmentsLoading ? "Loading..." :
                  environments.length === 0 ? "No environments" :
                  "Select environment..."
                } />
              </SelectTrigger>
              <SelectContent className="bg-popover z-[100]">
                {environments.length === 0 ? (
                  <SelectItem value="__none" disabled>No environments configured</SelectItem>
                ) : (
                  environments.map((env) => (
                    <SelectItem key={env.id} value={env.name}>
                      <div className="flex items-center gap-2">
                        <span>{env.name}</span>
                        {env.connectivity_status === "connected" && (
                          <span className="text-[9px] text-primary">● Connected</span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Connector</Label>
            <Select value={selectedConnectorId} onValueChange={(v) => onConnectorChange(stageKey, v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue
                  placeholder={
                    connectorsLoading ? "Loading..." :
                    availableConnectors.length === 0 ? "No connectors" :
                    "Select connector..."
                  }
                />
              </SelectTrigger>
              <SelectContent className="bg-popover z-[100]">
                {availableConnectors.length === 0 ? (
                  <SelectItem value="__none" disabled>No {stage.category} connectors</SelectItem>
                ) : (
                  availableConnectors.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      <div className="flex items-center gap-2">
                        <span>{conn.name}</span>
                        <span className="text-[10px] text-muted-foreground">({conn.connector_tool})</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {isCode && selectedConnectorId && (
          <>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Repository URL</Label>
              <Input
                className="h-7 text-xs"
                placeholder="https://github.com/org/repo"
                value={repoUrl}
                onChange={(e) => onRepoUrlChange(stageKey, e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Branch</Label>
              <Input
                className="h-7 text-xs"
                placeholder="main"
                value={branch}
                onChange={(e) => onBranchChange(stageKey, e.target.value)}
              />
            </div>
          </>
        )}

        {isJira && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">JIRA Number</Label>
            <Input
              className={cn("h-7 text-xs", !jiraValid && "border-destructive focus-visible:ring-destructive")}
              placeholder="e.g. PROJ-123"
              value={jiraNumber}
              onChange={(e) => onJiraNumberChange(stageKey, e.target.value.toUpperCase())}
            />
            {!jiraValid && (
              <p className="text-[9px] text-destructive">Invalid format. Use PROJ-123 (e.g. DEV-42, PIPE-100)</p>
            )}
            {jiraNumber && jiraValid && (
              <p className="text-[9px] text-primary">✓ Valid JIRA number</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function PipelineStagesSubRow({ build, onUpdateStagesState }: PipelineStagesSubRowProps) {
  const { pipelines } = usePipelines();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { connectors, isLoading: connectorsLoading } = useConnectors(
    selectedAccount?.id,
    selectedEnterprise?.id
  );
  const { environments, isLoading: environmentsLoading } = useEnvironments(
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  // Fetch account users for approval stage dropdowns
  const { data: accountUsers = [], isLoading: accountUsersLoading } = useQuery({
    queryKey: ["account_users_for_approval", selectedAccount?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_technical_users")
        .select("id, email, first_name, last_name, is_technical_user")
        .eq("account_id", selectedAccount!.id)
        .eq("status", "active");
      if (error) throw error;
      return (data || []) as AccountUser[];
    },
    enabled: !!selectedAccount?.id,
  });

  const [stagesState, setStagesState] = useState<StagesState>(() => {
    const existing = build.pipeline_stages_state as any;
    return existing && typeof existing === "object"
      ? {
          selectedConnectors: existing.selectedConnectors || {},
          selectedEnvironments: existing.selectedEnvironments || {},
          connectorRepositoryUrls: existing.connectorRepositoryUrls || {},
          selectedBranches: existing.selectedBranches || {},
          selectedApprovers: existing.selectedApprovers || {},
          jiraNumbers: existing.jiraNumbers || {},
        }
      : {
          selectedConnectors: {},
          selectedEnvironments: {},
          connectorRepositoryUrls: {},
          selectedBranches: {},
          selectedApprovers: {},
          jiraNumbers: {},
        };
  });

  const [isDirty, setIsDirty] = useState(false);

  const matchedPipeline = useMemo(() => {
    if (!build.pipeline) return null;
    return pipelines.find((p) => p.name.toLowerCase() === build.pipeline!.toLowerCase()) || null;
  }, [pipelines, build.pipeline]);

  const environmentNodes = useMemo(() => {
    if (!matchedPipeline) return [];
    const nodes = Array.isArray(matchedPipeline.nodes) ? matchedPipeline.nodes : [];
    const edges = Array.isArray(matchedPipeline.edges) ? matchedPipeline.edges : [];
    return parsePipelineStructure(nodes as any[], edges as any[]);
  }, [matchedPipeline]);

  const handleConnectorChange = (stageKey: string, connectorId: string) => {
    setStagesState((prev) => ({
      ...prev,
      selectedConnectors: { ...prev.selectedConnectors, [stageKey]: connectorId },
    }));
    setIsDirty(true);
  };

  const handleEnvironmentChange = (stageKey: string, envName: string) => {
    setStagesState((prev) => ({
      ...prev,
      selectedEnvironments: { ...prev.selectedEnvironments, [stageKey]: envName },
    }));
    setIsDirty(true);
  };

  const handleRepoUrlChange = (stageKey: string, url: string) => {
    setStagesState((prev) => ({
      ...prev,
      connectorRepositoryUrls: { ...prev.connectorRepositoryUrls, [stageKey]: url },
    }));
    setIsDirty(true);
  };

  const handleBranchChange = (stageKey: string, branch: string) => {
    setStagesState((prev) => ({
      ...prev,
      selectedBranches: { ...prev.selectedBranches, [stageKey]: branch },
    }));
    setIsDirty(true);
  };

  const handleApproverChange = (stageKey: string, emails: string[]) => {
    setStagesState((prev) => ({
      ...prev,
      selectedApprovers: { ...prev.selectedApprovers, [stageKey]: emails },
    }));
    setIsDirty(true);
  };

  const handleJiraNumberChange = (stageKey: string, value: string) => {
    setStagesState((prev) => ({
      ...prev,
      jiraNumbers: { ...prev.jiraNumbers, [stageKey]: value },
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onUpdateStagesState(build.id, stagesState);
    setIsDirty(false);
    toast.success("Pipeline stages configuration saved");
  };

  // ── Error states ──
  if (!build.pipeline) {
    return (
      <div className="px-8 py-6 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
        <p className="text-sm text-muted-foreground">No pipeline assigned to this build job.</p>
        <p className="text-xs text-muted-foreground mt-1">Edit the job to select a pipeline first.</p>
      </div>
    );
  }

  if (!matchedPipeline) {
    return (
      <div className="px-8 py-6 text-center">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-60" />
        <p className="text-sm text-muted-foreground">
          Pipeline "<span className="font-medium text-foreground">{build.pipeline}</span>" not found.
        </p>
      </div>
    );
  }

  if (environmentNodes.length === 0) {
    return (
      <div className="px-8 py-6 text-center">
        <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
        <p className="text-sm text-muted-foreground">
          No environment nodes found in pipeline "{matchedPipeline.name}".
        </p>
      </div>
    );
  }

  const defaultTab = environmentNodes[0]?.id || "";

  // ── Main Render (Tabbed View) ──
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-transparent"
    >
      {/* Tabbed Environment View */}
      <div className="p-4 pt-3">
        <Tabs defaultValue={defaultTab}>
          <div className="flex items-center justify-between mb-3">
            <TabsList className="bg-muted/40 p-1 rounded-lg h-auto">
              {environmentNodes.map((env) => {
                const cfg = ENV_TAB_CONFIG[env.type] || ENV_TAB_CONFIG.general;
                const Icon = cfg.icon;
                const configuredCount = env.stages.filter((s) => {
                  const key = `${env.id}__${s.id}`;
                  return !!(stagesState.selectedConnectors[key] || stagesState.selectedEnvironments[key]);
                }).length;

                return (
                  <TabsTrigger
                    key={env.id}
                    value={env.id}
                    className="gap-1.5 text-[11px] data-[state=active]:bg-card data-[state=active]:shadow-sm px-3 py-1.5 rounded-md"
                  >
                    <Icon className="w-3 h-3" style={{ color: cfg.color }} />
                    {env.label}
                    <span className="text-[9px] text-muted-foreground ml-0.5">
                      {configuredCount}/{env.stages.length}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {isDirty && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                <Button size="sm" className="gap-1.5 text-xs h-7" onClick={handleSave}>
                  <Save className="w-3 h-3" />
                  Save
                </Button>
              </motion.div>
            )}
          </div>

          {environmentNodes.map((env) => (
            <TabsContent key={env.id} value={env.id} className="mt-0">
              {env.stages.length === 0 ? (
                <div className="text-center py-6 rounded-lg border border-dashed border-border/40">
                  <p className="text-xs text-muted-foreground">No workflow steps in this environment.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {env.stages.map((stage, idx) => (
                    <motion.div
                      key={stage.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                    >
                      <StageConfigRow
                        stage={stage}
                        envId={env.id}
                        stagesState={stagesState}
                        connectors={connectors}
                        connectorsLoading={connectorsLoading}
                        accountUsers={accountUsers}
                        accountUsersLoading={accountUsersLoading}
                        environments={environments}
                        environmentsLoading={environmentsLoading}
                        onConnectorChange={handleConnectorChange}
                        onEnvironmentChange={handleEnvironmentChange}
                        onRepoUrlChange={handleRepoUrlChange}
                        onBranchChange={handleBranchChange}
                        onApproverChange={handleApproverChange}
                        onJiraNumberChange={handleJiraNumberChange}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </motion.div>
  );
}
