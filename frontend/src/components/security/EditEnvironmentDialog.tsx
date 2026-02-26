import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Save, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EnvironmentRecord, EnvironmentConnectorRecord } from "@/hooks/useEnvironments";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { testConnectivity } from "@/lib/testConnectivity";
import { EnvironmentConnectorsEditor, type CredentialOption } from "./EnvironmentConnectorsEditor";
import { useCredentials } from "@/hooks/useCredentials";

const formSchema = z.object({
  name: z.string().min(1, "Environment Name is required").max(100),
  description: z.string().max(500).optional(),
  workstream_id: z.string().min(1, "Workstream is required"),
  product_id: z.string().min(1, "Product is required"),
  service_id: z.string().min(1, "Service is required"),
  connector_name: z.string().optional(),
  connectivity_status: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditEnvironmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environment: EnvironmentRecord | null;
  onSave: (id: string, data: Record<string, any>) => Promise<void>;
}

export function EditEnvironmentDialog({
  open,
  onOpenChange,
  environment,
  onSave,
}: EditEnvironmentDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  const { workstreams } = useWorkstreams(accountId, enterpriseId);
  const { credentials: allCredentials } = useCredentials(accountId, enterpriseId);

  const credentialOptions: CredentialOption[] = (allCredentials || []).map((c: any) => ({
    id: c.id,
    name: c.name,
  }));

  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [connectors, setConnectors] = useState<EnvironmentConnectorRecord[]>([]);
  const [testingIndex, setTestingIndex] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, "success" | "failed">>({});

  const handleTestConnector = async (conn: EnvironmentConnectorRecord, idx: number) => {
    const isCF = conn.connector === "Cloud Foundry";
    const testUrl = isCF ? (conn.hostUrl || conn.apiUrl || "") : (conn.url || "");
    const credName = isCF ? (conn.iflowCredentialName || conn.apiCredentialName || "") : (conn.credentialName || "");

    if (!testUrl) {
      toast.error(`No URL configured for ${conn.connector}`);
      setTestResults(prev => ({ ...prev, [idx]: "failed" }));
      return;
    }

    setTestingIndex(idx);
    try {
      let credentialId = "";
      if (credName && !isExternalApi()) {
        const { data: creds } = await (supabase as any)
          .from("credentials")
          .select("id")
          .eq("name", credName)
          .eq("account_id", accountId!)
          .eq("enterprise_id", enterpriseId!)
          .limit(1);
        if (creds?.[0]) credentialId = creds[0].id;
      }

      if (!credentialId && !isExternalApi()) {
        toast.error(`Credential "${credName}" not found for ${conn.connector}`);
        setTestResults(prev => ({ ...prev, [idx]: "failed" }));
        return;
      }

      const connectorKey = (conn.connector || "").toLowerCase().replace(/\s+/g, "_");
      const result = await testConnectivity({
        connector: connectorKey,
        url: testUrl,
        credentialId,
        credentialName: credName,
      });

      if (result?.success) {
        toast.success(result.message || `${conn.connector} connected successfully`);
        setTestResults(prev => ({ ...prev, [idx]: "success" }));
      } else {
        toast.error(result?.message || `${conn.connector} connection failed`);
        setTestResults(prev => ({ ...prev, [idx]: "failed" }));
      }
    } catch {
      toast.error(`Connection test failed for ${conn.connector}`);
      setTestResults(prev => ({ ...prev, [idx]: "failed" }));
    } finally {
      setTestingIndex(null);
    }
  };

  useEffect(() => {
    const fetchMeta = async () => {
      if (isExternalApi()) {
        const [pRes, sRes] = await Promise.all([
          httpClient.get<any[]>("/products"),
          httpClient.get<any[]>("/services"),
        ]);
        setProducts((pRes.data || []).map((p: any) => ({ id: p.id, name: p.name })));
        setServices((sRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
      } else {
        const [pRes, sRes] = await Promise.all([
          supabase.from("products").select("id, name"),
          supabase.from("services").select("id, name"),
        ]);
        setProducts((pRes.data || []) as { id: string; name: string }[]);
        setServices((sRes.data || []) as { id: string; name: string }[]);
      }
    };
    fetchMeta();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      workstream_id: "",
      product_id: "",
      service_id: "",
      connector_name: "",
      connectivity_status: "unknown",
    },
  });

  useEffect(() => {
    if (environment && open) {
      form.reset({
        name: environment.name,
        description: environment.description || "",
        workstream_id: environment.workstream_id || "",
        product_id: environment.product_id || "",
        service_id: environment.service_id || "",
        connector_name: environment.connector_name || "",
        connectivity_status: environment.connectivity_status || "unknown",
      });
      setConnectors(environment.connectors || []);
    }
  }, [environment, open, form]);

  const handleSubmit = async (data: FormValues) => {
    if (!environment) return;
    setIsSaving(true);
    try {
      await onSave(environment.id, {
        name: data.name,
        description: data.description || undefined,
        workstream_id: data.workstream_id,
        product_id: data.product_id,
        service_id: data.service_id,
        connector_name: data.connector_name === "none" ? null : (data.connector_name || null),
        connectivity_status: data.connectivity_status,
        connectors,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update environment:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[680px] p-0 overflow-hidden rounded-2xl border shadow-2xl bg-card"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Edit Environment</DialogTitle>
        </VisuallyHidden>

        {/* Gradient Header */}
        <div className="relative bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 px-6 py-5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+')] opacity-60" />
          <div className="relative flex items-center gap-3">
            <motion.div
              className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
              initial={{ rotate: -10, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <Globe className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h2 className="text-lg font-bold text-white">Edit Environment</h2>
              <p className="text-white/70 text-xs">Update environment settings and connectors</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">Environment Name <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input {...field} placeholder="e.g. Production - US East" className="bg-background" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} placeholder="Brief description" className="bg-background resize-none h-20" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-3 gap-3">
              <FormField control={form.control} name="workstream_id" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5 text-xs">Workstream <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="bg-background"><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">{workstreams.map((ws) => (<SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="product_id" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5 text-xs">Product <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="bg-background"><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">{products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="service_id" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5 text-xs">Service <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="bg-background"><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">{services.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Connectors Editor */}
            <div className="border-t pt-4">
              <EnvironmentConnectorsEditor connectors={connectors} onChange={setConnectors} credentials={credentialOptions} onTestConnector={handleTestConnector} testingIndex={testingIndex} testResults={testResults} />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
              <Button type="submit" disabled={isSaving} className="rounded-xl gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white">
                {isSaving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>) : (<><Save className="w-4 h-4" /> Save Changes</>)}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
