import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Zap,
  Save,
  Link2,
  Settings2,
  Plug,
  CheckCircle2,
  XCircle,
  Globe,
  FileText,
  Tag,
  Activity,
} from "lucide-react";
import type { ConnectorRecord } from "@/hooks/useConnectors";

const editSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  status: z.enum(["connected", "disconnected"]),
});

type EditFormValues = z.infer<typeof editSchema>;

const statusConfig = {
  connected: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500", label: "Connected" },
  disconnected: { icon: XCircle, color: "text-red-600", bg: "bg-red-500", label: "Disconnected" },
};

const healthConfig = {
  healthy: { color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Healthy" },
  warning: { color: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Warning" },
  error: { color: "text-red-600", bg: "bg-red-500/10", border: "border-red-500/20", label: "Error" },
};

interface EditConnectorDialogProps {
  connector: ConnectorRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: Partial<EditFormValues>) => Promise<void>;
  onHealthUpdated?: () => void;
}

export function EditConnectorDialog({
  connector,
  open,
  onOpenChange,
  onSave,
  onHealthUpdated,
}: EditConnectorDialogProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "",
      description: "",
      url: "",
      status: "connected",
    },
  });

  useEffect(() => {
    if (connector && open) {
      form.reset({
        name: connector.name,
        description: connector.description || "",
        url: connector.url || "",
        status: connector.status,
      });
      setTestResult(null);
    }
  }, [connector, open, form]);

  const isSubmitting = form.formState.isSubmitting;

  const handleSubmit = async (values: EditFormValues) => {
    if (!connector) return;
    await onSave(connector.id, {
      name: values.name,
      description: values.description || undefined,
      url: values.url || undefined,
      status: values.status,
    });
    onOpenChange(false);
  };

  const handleTestConnection = async () => {
    if (!connector) return;
    const url = form.getValues("url") || connector.url;
    if (!url || !connector.credential_id) {
      toast.error("Connector is missing URL or credential configuration");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-connector-connectivity", {
        body: {
          connector: connector.connector_tool,
          url,
          credentialId: connector.credential_id,
        },
      });
      if (error) throw error;
      const newHealth = data?.success ? "healthy" : "error";
      await (supabase.from("connectors" as any).update({ health: newHealth }).eq("id", connector.id) as any);
      onHealthUpdated?.();
      if (data?.success) {
        setTestResult("success");
        toast.success(data.message || "Connection successful");
      } else {
        setTestResult("failed");
        toast.error(data?.message || "Connection failed");
      }
    } catch (err) {
      console.error("Connectivity test failed:", err);
      await (supabase.from("connectors" as any).update({ health: "error" }).eq("id", connector.id) as any);
      onHealthUpdated?.();
      setTestResult("failed");
      toast.error("Failed to test connectivity");
    } finally {
      setIsTesting(false);
    }
  };

  if (!connector) return null;

  const currentHealth = healthConfig[connector.health as keyof typeof healthConfig] || healthConfig.healthy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden gap-0">
        <VisuallyHidden>
          <DialogTitle>Edit Connector</DialogTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-muted/30 via-background to-primary/5">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg"
              whileHover={{ scale: 1.05 }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <Plug className="w-5 h-5" />
            </motion.div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-foreground">Edit Connector</h2>
              <p className="text-sm text-muted-foreground">Update connector settings and connectivity</p>
            </div>
            <Badge className={cn("gap-1.5", currentHealth.bg, currentHealth.border, currentHealth.color, "border")}>
              <Activity className="w-3 h-3" />
              {currentHealth.label}
            </Badge>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col">
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">

              {/* Read-only Connector Info Card */}
              <motion.div
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-muted/50 via-muted/30 to-muted/50 p-5 border"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-foreground">Connector Details</span>
                  <Badge variant="secondary" className="ml-auto bg-muted">
                    Read-only
                  </Badge>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50">
                    <span className="text-sm font-medium text-muted-foreground">Tool</span>
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      {connector.connector_tool}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50">
                    <span className="text-sm font-medium text-muted-foreground">Type</span>
                    <span className="text-sm font-medium text-foreground capitalize">{connector.connector_type}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50">
                    <span className="text-sm font-medium text-muted-foreground">Category</span>
                    <Badge variant="outline" className="gap-1.5">
                      <Tag className="w-3 h-3" />
                      {connector.category}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50">
                    <span className="text-sm font-medium text-muted-foreground">Syncs</span>
                    <span className="text-sm font-medium text-foreground">{connector.sync_count}</span>
                  </div>
                </div>
              </motion.div>

              {/* Editable Fields Section */}
              <motion.div
                className="space-y-5"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white">
                    <Settings2 className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-foreground">Editable Settings</span>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        Connector Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter connector name"
                          className="bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Enter description (optional)"
                          className="bg-background resize-none transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        URL
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://..."
                          className="bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </FormControl>
                      <FormDescription>
                        The endpoint URL for this connector
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper">
                          {Object.entries(statusConfig).map(([value, config]) => {
                            const StatusIcon = config.icon;
                            return (
                              <SelectItem key={value} value={value}>
                                <div className="flex items-center gap-2">
                                  <div className={cn("w-2 h-2 rounded-full", config.bg)} />
                                  <StatusIcon className={cn("w-4 h-4", config.color)} />
                                  {config.label}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Change the connection status
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </motion.div>

              {/* Connectivity Test Section */}
              <motion.div
                className="space-y-4 pt-5 border-t"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white">
                    <Zap className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-foreground">Connectivity</span>
                </div>

                <motion.div
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                    testResult === "success" && "bg-emerald-500/5 border-emerald-500/20",
                    testResult === "failed" && "bg-red-500/5 border-red-500/20",
                    !testResult && "bg-muted/30 hover:bg-muted/50"
                  )}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm",
                      testResult === "success" && "bg-gradient-to-br from-emerald-500 to-emerald-600",
                      testResult === "failed" && "bg-gradient-to-br from-red-500 to-red-600",
                      !testResult && "bg-gradient-to-br from-slate-400 to-slate-500"
                    )}>
                      {isTesting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : testResult === "success" ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : testResult === "failed" ? (
                        <XCircle className="w-5 h-5" />
                      ) : (
                        <Zap className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {isTesting ? "Testing connection..." : testResult === "success" ? "Connection successful" : testResult === "failed" ? "Connection failed" : "Test connectivity"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isTesting ? "Please wait while we verify" : "Verify the connector can reach its endpoint"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="gap-2"
                  >
                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {isTesting ? "Testing..." : "Test"}
                  </Button>
                </motion.div>
              </motion.div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/20">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
