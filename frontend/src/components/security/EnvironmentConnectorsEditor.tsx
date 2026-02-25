import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Server, Zap, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EnvironmentConnectorRecord } from "@/hooks/useEnvironments";

function generateId() {
  return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Tool Config ───
const TOOLS_BY_CATEGORY: Record<string, string[]> = {
  plan: ["Jira", "Azure DevOps", "Trello", "Asana"],
  code: ["GitHub", "GitLab", "Azure Repos", "Bitbucket", "SonarQube"],
  build: ["Jenkins", "GitHub Actions", "CircleCI", "AWS CodeBuild", "Google Cloud Build"],
  test: ["Cypress", "Selenium", "Jest", "Tricentis Tosca"],
  release: ["Argo CD", "ServiceNow"],
  deploy: ["Kubernetes", "Helm", "Terraform", "Ansible", "Docker", "AWS CodePipeline", "Cloud Foundry"],
};

const CATEGORIES = Object.keys(TOOLS_BY_CATEGORY);

const AUTH_TYPES = ["OAuth2", "Basic", "Username and API Key"];
const ENV_TYPES = ["Pre-Production", "Production"];

function isCloudFoundry(connector?: string) {
  return connector === "Cloud Foundry";
}

export interface CredentialOption {
  id: string;
  name: string;
}

interface Props {
  connectors: EnvironmentConnectorRecord[];
  onChange: (connectors: EnvironmentConnectorRecord[]) => void;
  credentials?: CredentialOption[];
  onTestConnector?: (connector: EnvironmentConnectorRecord, index: number) => Promise<void>;
  testingIndex?: number | null;
  testResults?: Record<number, "success" | "failed">;
}

export function EnvironmentConnectorsEditor({
  connectors,
  onChange,
  credentials = [],
  onTestConnector,
  testingIndex,
  testResults = {},
}: Props) {
  const addConnector = () => {
    onChange([
      ...connectors,
      {
        id: generateId(),
        category: "",
        connector: "",
        authenticationType: "",
        status: true,
      },
    ]);
  };

  const removeConnector = (idx: number) => {
    onChange(connectors.filter((_, i) => i !== idx));
  };

  const update = (idx: number, patch: Partial<EnvironmentConnectorRecord>) => {
    const next = connectors.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Connectors</Label>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 text-xs rounded-lg" onClick={addConnector}>
          <Plus className="w-3.5 h-3.5" /> Add Connector
        </Button>
      </div>

      {connectors.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No connectors configured. Click "Add Connector" to add one.</p>
      )}

      <Accordion type="multiple" className="space-y-2">
        {connectors.map((conn, idx) => (
          <AccordionItem key={conn.id || idx} value={`conn-${idx}`} className="border rounded-lg px-3 bg-muted/30">
            <AccordionTrigger className="py-2 text-sm hover:no-underline">
              <div className="flex items-center gap-2 text-left">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">
                  {conn.connector || conn.category || `Connector ${idx + 1}`}
                </span>
                {conn.category && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {conn.category}
                  </span>
                )}
                {testResults[idx] === "success" && (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 text-[10px] h-5">
                    <CheckCircle className="w-3 h-3" /> Connected
                  </Badge>
                )}
                {testResults[idx] === "failed" && (
                  <Badge className="gap-1 bg-red-100 text-red-700 text-[10px] h-5">
                    <XCircle className="w-3 h-3" /> Failed
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3 space-y-3">
              {/* Category + Tool */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category *</Label>
                  <Select
                    value={conn.category || ""}
                    onValueChange={(v) => update(idx, { category: v, connector: "" })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tool *</Label>
                  <Select
                    value={conn.connector || ""}
                    onValueChange={(v) => update(idx, { connector: v, connectorIconName: v })}
                    disabled={!conn.category}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Select tool" /></SelectTrigger>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">
                      {(TOOLS_BY_CATEGORY[conn.category || ""] || []).map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Cloud Foundry / SAP_CPI specific */}
              {isCloudFoundry(conn.connector) && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Environment Type <span className="text-destructive">*</span></Label>
                      <Select
                        value={conn.environmentType || ""}
                        onValueChange={(v) => update(idx, { environmentType: v })}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent className="z-[200] bg-popover border shadow-lg">
                          {ENV_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Host URL <span className="text-destructive">*</span></Label>
                      <Input
                        className="h-8 text-xs bg-background"
                        placeholder="https://xxx.it-cpitrial06.cfapps.us10-001.hana.ondemand.com"
                        value={conn.hostUrl || ""}
                        onChange={(e) => update(idx, { hostUrl: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">API URL <span className="text-destructive">*</span></Label>
                      <Input
                        className="h-8 text-xs bg-background"
                        placeholder="https://xxx.it-cpitrial06.cfapps.us10-001.hana.ondemand.com"
                        value={conn.apiUrl || ""}
                        onChange={(e) => update(idx, { apiUrl: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">API Credential Name <span className="text-destructive">*</span></Label>
                      <Select
                        value={conn.apiCredentialName || ""}
                        onValueChange={(v) => update(idx, { apiCredentialName: v })}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Select credential" /></SelectTrigger>
                        <SelectContent className="z-[200] bg-popover border shadow-lg">
                          {credentials.map((c) => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">IFlow URL <span className="text-destructive">*</span></Label>
                      <Input
                        className="h-8 text-xs bg-background"
                        placeholder="IFlow endpoint URL"
                        value={conn.iflowUrl || ""}
                        onChange={(e) => update(idx, { iflowUrl: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">IFlow Credential Name <span className="text-destructive">*</span></Label>
                      <Select
                        value={conn.iflowCredentialName || ""}
                        onValueChange={(v) => update(idx, { iflowCredentialName: v })}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="Select credential" /></SelectTrigger>
                        <SelectContent className="z-[200] bg-popover border shadow-lg">
                          {credentials.map((c) => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Authentication credentials (OAuth2 or Basic) are configured in Manage Credentials. API Credential should use Service Key Details: API. IFlow Credential should use Service Key Details: IFlow.
                  </p>
                </>
              )}

              {/* GitHub-specific */}
              {(conn.connector === "GitHub") && (
                <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                  <div className="space-y-1">
                    <Label className="text-xs">URL</Label>
                    <Input className="h-8 text-xs bg-background" placeholder="https://github.com/..." value={conn.url || ""} onChange={(e) => update(idx, { url: e.target.value })} />
                  </div>
                </div>
              )}

              {/* Generic URL for non-CF, non-GitHub tools */}
              {!isCloudFoundry(conn.connector) && conn.connector !== "GitHub" && conn.connector && (
                <div className="space-y-1">
                  <Label className="text-xs">URL</Label>
                  <Input className="h-8 text-xs bg-background" placeholder="Tool endpoint URL" value={conn.url || ""} onChange={(e) => update(idx, { url: e.target.value })} />
                </div>
              )}

              {/* Description + Status + Test */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input className="h-8 text-xs bg-background" value={conn.description || ""} onChange={(e) => update(idx, { description: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Active</Label>
                  <Switch checked={conn.status !== false} onCheckedChange={(v) => update(idx, { status: v })} />
                </div>
                {onTestConnector && conn.connector && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    disabled={testingIndex === idx}
                    onClick={() => onTestConnector(conn, idx)}
                  >
                    {testingIndex === idx ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Test
                  </Button>
                )}
              </div>

              {/* Remove */}
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs gap-1" onClick={() => removeConnector(idx)}>
                <Trash2 className="w-3.5 h-3.5" /> Remove Connector
              </Button>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
