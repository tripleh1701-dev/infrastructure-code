import { memo, useState, useEffect } from "react";
import { Node } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Settings,
  Trash2,
  Copy,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Zap,
  Bell,
  Mail,
  MessageSquare,
  RotateCcw,
  XCircle,
  SkipForward,
  Webhook,
} from "lucide-react";
import { CATEGORY_COLORS } from "@/constants/pipeline";

interface NodeConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: Node | null;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
}

const statusOptions = [
  { value: "pending", label: "Pending", icon: Clock, color: "#94a3b8" },
  { value: "running", label: "Running", icon: Loader2, color: "#f59e0b" },
  { value: "success", label: "Success", icon: CheckCircle, color: "#10b981" },
  { value: "failed", label: "Failed", icon: AlertCircle, color: "#ef4444" },
];

const eventActions = [
  { value: "none", label: "No Action", icon: SkipForward },
  { value: "notify_email", label: "Send Email Notification", icon: Mail },
  { value: "notify_slack", label: "Send Slack Message", icon: MessageSquare },
  { value: "notify_teams", label: "Send Teams Message", icon: Bell },
  { value: "webhook", label: "Trigger Webhook", icon: Webhook },
  { value: "retry", label: "Retry Step", icon: RotateCcw },
  { value: "stop_pipeline", label: "Stop Pipeline", icon: XCircle },
  { value: "continue", label: "Continue to Next", icon: SkipForward },
];

function NodeConfigPanelComponent({
  open,
  onOpenChange,
  node,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
}: NodeConfigPanelProps) {
  const [localLabel, setLocalLabel] = useState(node?.data?.label as string || "");
  const [localDescription, setLocalDescription] = useState(node?.data?.description as string || "");

  // Sync local state when node changes
  useEffect(() => {
    if (node) {
      setLocalLabel(node.data?.label as string || "");
      setLocalDescription(node.data?.description as string || "");
    }
  }, [node?.id, node?.data?.label, node?.data?.description]);

  if (!node) return null;

  const category = node.data?.category as string;
  const color = CATEGORY_COLORS[category] || "#64748b";
  const status = node.data?.status as string | undefined;

  const handleLabelChange = (value: string) => {
    setLocalLabel(value);
    onUpdateNode(node.id, { ...node.data, label: value });
  };

  const handleDescriptionChange = (value: string) => {
    setLocalDescription(value);
    onUpdateNode(node.id, { ...node.data, description: value });
  };

  const handleStatusChange = (value: string) => {
    onUpdateNode(node.id, { ...node.data, status: value === "none" ? undefined : value });
  };

  const handleEventActionChange = (event: string, action: string) => {
    const currentEvents = (node.data?.eventActions as Record<string, string>) || {};
    onUpdateNode(node.id, {
      ...node.data,
      eventActions: {
        ...currentEvents,
        [event]: action === "none" ? undefined : action,
      },
    });
  };

  const getEventAction = (event: string): string => {
    const eventActions = (node.data?.eventActions as Record<string, string>) || {};
    return eventActions[event] || "none";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}20` }}
            >
              <Settings className="w-4 h-4" style={{ color }} />
            </div>
            Connector Settings
          </SheetTitle>
          <SheetDescription>
            Configure connector properties, event actions, and execution behavior
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Node Info Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="capitalize"
                  style={{ borderColor: color, color }}
                >
                  {category}
                </Badge>
                <span className="text-sm text-[#64748b]">
                  ID: {node.id.slice(0, 8)}...
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onDuplicateNode(node.id)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => {
                    onDeleteNode(node.id);
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>

          <Accordion type="multiple" defaultValue={["basic", "events", "execution"]} className="space-y-2">
            {/* Basic Properties */}
            <AccordionItem value="basic" className="border rounded-lg px-4">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Basic Properties</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="node-label">Label</Label>
                  <Input
                    id="node-label"
                    value={localLabel}
                    onChange={(e) => handleLabelChange(e.target.value)}
                    placeholder="Enter connector label"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="node-description">Description</Label>
                  <Textarea
                    id="node-description"
                    value={localDescription}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    placeholder="Add a description..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="node-status">Current Status</Label>
                  <Select
                    value={status || "none"}
                    onValueChange={handleStatusChange}
                  >
                    <SelectTrigger id="node-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Status</SelectItem>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: opt.color }}
                            />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Event Actions */}
            <AccordionItem value="events" className="border rounded-lg px-4">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Event Actions</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Configure actions to trigger based on connector execution outcomes
                </p>

                {/* On Success */}
                <div className="space-y-2 p-3 rounded-lg bg-green-50/50 border border-green-200/50">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <Label className="text-green-700 font-medium">On Success</Label>
                  </div>
                  <Select
                    value={getEventAction("onSuccess")}
                    onValueChange={(value) => handleEventActionChange("onSuccess", value)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventActions.filter(a => a.value !== "retry" && a.value !== "stop_pipeline").map((action) => (
                        <SelectItem key={action.value} value={action.value}>
                          <div className="flex items-center gap-2">
                            <action.icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {action.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* On Warning */}
                <div className="space-y-2 p-3 rounded-lg bg-amber-50/50 border border-amber-200/50">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <Label className="text-amber-700 font-medium">On Warning</Label>
                  </div>
                  <Select
                    value={getEventAction("onWarning")}
                    onValueChange={(value) => handleEventActionChange("onWarning", value)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventActions.map((action) => (
                        <SelectItem key={action.value} value={action.value}>
                          <div className="flex items-center gap-2">
                            <action.icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {action.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* On Failure */}
                <div className="space-y-2 p-3 rounded-lg bg-red-50/50 border border-red-200/50">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <Label className="text-red-700 font-medium">On Failure</Label>
                  </div>
                  <Select
                    value={getEventAction("onFailure")}
                    onValueChange={(value) => handleEventActionChange("onFailure", value)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventActions.map((action) => (
                        <SelectItem key={action.value} value={action.value}>
                          <div className="flex items-center gap-2">
                            <action.icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {action.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Webhook URL - Show if any action is webhook */}
                {(getEventAction("onSuccess") === "webhook" ||
                  getEventAction("onWarning") === "webhook" ||
                  getEventAction("onFailure") === "webhook") && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="webhook-url">Webhook URL</Label>
                    <Input
                      id="webhook-url"
                      type="url"
                      placeholder="https://your-webhook-endpoint.com/..."
                      value={(node.data?.webhookUrl as string) || ""}
                      onChange={(e) =>
                        onUpdateNode(node.id, { ...node.data, webhookUrl: e.target.value })
                      }
                    />
                  </div>
                )}

                {/* Notification Email - Show if any action is email */}
                {(getEventAction("onSuccess") === "notify_email" ||
                  getEventAction("onWarning") === "notify_email" ||
                  getEventAction("onFailure") === "notify_email") && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="notification-email">Notification Email</Label>
                    <Input
                      id="notification-email"
                      type="email"
                      placeholder="team@company.com"
                      value={(node.data?.notificationEmail as string) || ""}
                      onChange={(e) =>
                        onUpdateNode(node.id, { ...node.data, notificationEmail: e.target.value })
                      }
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Execution Settings */}
            <AccordionItem value="execution" className="border rounded-lg px-4">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Execution Settings</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Continue on Error</Label>
                    <p className="text-xs text-[#64748b]">
                      Allow pipeline to continue if this step fails
                    </p>
                  </div>
                  <Switch
                    checked={node.data?.continueOnError as boolean || false}
                    onCheckedChange={(checked) =>
                      onUpdateNode(node.id, { ...node.data, continueOnError: checked })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Parallel Execution</Label>
                    <p className="text-xs text-[#64748b]">
                      Run this step in parallel with siblings
                    </p>
                  </div>
                  <Switch
                    checked={node.data?.parallel as boolean || false}
                    onCheckedChange={(checked) =>
                      onUpdateNode(node.id, { ...node.data, parallel: checked })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Skip Condition</Label>
                    <p className="text-xs text-[#64748b]">
                      Skip this step based on conditions
                    </p>
                  </div>
                  <Switch
                    checked={node.data?.skipEnabled as boolean || false}
                    onCheckedChange={(checked) =>
                      onUpdateNode(node.id, { ...node.data, skipEnabled: checked })
                    }
                  />
                </div>

                {node.data?.skipEnabled && (
                  <div className="space-y-2 pl-4 border-l-2 border-muted">
                    <Label htmlFor="skip-condition">Skip When</Label>
                    <Select
                      value={(node.data?.skipCondition as string) || "never"}
                      onValueChange={(value) =>
                        onUpdateNode(node.id, { ...node.data, skipCondition: value })
                      }
                    >
                      <SelectTrigger id="skip-condition">
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="previous_failed">Previous Step Failed</SelectItem>
                        <SelectItem value="previous_success">Previous Step Succeeded</SelectItem>
                        <SelectItem value="env_not_prod">Not Production Environment</SelectItem>
                        <SelectItem value="env_prod_only">Production Only</SelectItem>
                        <SelectItem value="manual_skip">Manual Skip Flag</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (sec)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min={0}
                      value={node.data?.timeout as number || 300}
                      onChange={(e) =>
                        onUpdateNode(node.id, { ...node.data, timeout: parseInt(e.target.value) || 300 })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retries">Max Retries</Label>
                    <Input
                      id="retries"
                      type="number"
                      min={0}
                      max={10}
                      value={node.data?.retries as number || 0}
                      onChange={(e) =>
                        onUpdateNode(node.id, { ...node.data, retries: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                {(node.data?.retries as number) > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="retry-delay">Retry Delay (sec)</Label>
                    <Input
                      id="retry-delay"
                      type="number"
                      min={0}
                      value={node.data?.retryDelay as number || 10}
                      onChange={(e) =>
                        onUpdateNode(node.id, { ...node.data, retryDelay: parseInt(e.target.value) || 10 })
                      }
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Advanced Settings */}
            <AccordionItem value="advanced" className="border rounded-lg px-4">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Advanced</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="custom-env">Environment Variables</Label>
                  <Textarea
                    id="custom-env"
                    placeholder="KEY=value&#10;ANOTHER_KEY=value"
                    value={(node.data?.envVariables as string) || ""}
                    onChange={(e) =>
                      onUpdateNode(node.id, { ...node.data, envVariables: e.target.value })
                    }
                    rows={3}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    One variable per line in KEY=value format
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="working-dir">Working Directory</Label>
                  <Input
                    id="working-dir"
                    placeholder="/app/workspace"
                    value={(node.data?.workingDir as string) || ""}
                    onChange={(e) =>
                      onUpdateNode(node.id, { ...node.data, workingDir: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                  <div>
                    <span className="font-medium">X:</span> {Math.round(node.position.x)}
                  </div>
                  <div>
                    <span className="font-medium">Y:</span> {Math.round(node.position.y)}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => onDuplicateNode(node.id)}
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={() => {
                onDeleteNode(node.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const NodeConfigPanel = memo(NodeConfigPanelComponent);
