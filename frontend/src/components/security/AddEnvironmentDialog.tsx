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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { X, Save, Globe, Loader2, Plus } from "lucide-react";
import { useEnvironments, type CreateEnvironmentInput } from "@/hooks/useEnvironments";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

const CONNECTOR_OPTIONS = [
  "GitHub", "Jira", "Cloud Foundry", "ServiceNow", "Jenkins", "GitLab", "Bitbucket", "Azure DevOps",
];

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

interface AddEnvironmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEnvironments?: { name: string; workstream_id: string | null; product_id: string | null; service_id: string | null }[];
}

export function AddEnvironmentDialog({
  open,
  onOpenChange,
  existingEnvironments = [],
}: AddEnvironmentDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  const { createEnvironment } = useEnvironments(accountId, enterpriseId);
  const { workstreams } = useWorkstreams(accountId, enterpriseId);

  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchMeta = async () => {
      if (isExternalApi()) {
        const [pRes, sRes] = await Promise.all([
          httpClient.get<any[]>("/api/products"),
          httpClient.get<any[]>("/api/services"),
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

  // Reset form on open
  useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        description: "",
        workstream_id: "",
        product_id: "",
        service_id: "",
        connector_name: "",
        connectivity_status: "unknown",
      });
    }
  }, [open, form]);

  const handleSubmit = async (data: FormValues) => {
    if (!accountId || !enterpriseId) return;

    // Duplicate check
    const isDuplicate = existingEnvironments.some(
      e =>
        e.name === data.name &&
        e.workstream_id === data.workstream_id &&
        e.product_id === data.product_id &&
        e.service_id === data.service_id,
    );
    if (isDuplicate) {
      toast.error("An environment with the same Name, Workstream, Product, and Service already exists.");
      return;
    }

    try {
      await createEnvironment.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        account_id: accountId,
        enterprise_id: enterpriseId,
        workstream_id: data.workstream_id || undefined,
        product_id: data.product_id || undefined,
        service_id: data.service_id || undefined,
        connector_name: data.connector_name || undefined,
        connectivity_status: data.connectivity_status || "unknown",
      });
      toast.success(`Environment "${data.name}" created successfully`);
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[580px] p-0 overflow-hidden rounded-2xl border shadow-2xl bg-card"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Add Environment</DialogTitle>
        </VisuallyHidden>

        {/* Gradient Header */}
        <div className="relative bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 px-6 py-5">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+')] opacity-60" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                initial={{ rotate: -10, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <Globe className="w-6 h-6 text-white" />
              </motion.div>
              <div>
                <h2 className="text-lg font-bold text-white">Add Environment</h2>
                <p className="text-white/70 text-xs">Configure a new deployment environment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    Environment Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. Production - US East"
                      className="bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">A unique name for this environment</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Brief description of this environment"
                      className="bg-background resize-none h-20"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Workstream */}
            <FormField
              control={form.control}
              name="workstream_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    Workstream <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select workstream" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">
                      {workstreams.map((ws) => (
                        <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Product */}
            <FormField
              control={form.control}
              name="product_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    Product <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Service */}
            <FormField
              control={form.control}
              name="service_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    Service <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Connector */}
            <FormField
              control={form.control}
              name="connector_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Connector</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select connector (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[200] bg-popover border shadow-lg">
                      <SelectItem value="none">None</SelectItem>
                      {CONNECTOR_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">Optionally link a connector tool</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createEnvironment.isPending}
                className="rounded-xl gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
              >
                {createEnvironment.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Environment
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
