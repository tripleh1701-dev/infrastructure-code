import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCredentials, useCheckCredentialNameExists, type Credential } from "@/hooks/useCredentials";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
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
import { Switch } from "@/components/ui/switch";
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
  FormDescription,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  Key,
  Save,
  Loader2,
  Lock,
  AlertCircle,
  Calendar,
  Bell,
  Settings2,
  Shield,
  Link2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pause,
  Box,
  Wrench,
  Layers,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { WorkstreamMultiSelect } from "@/components/access-control/WorkstreamMultiSelect";
import { format, addDays } from "date-fns";

// Auth type display mapping
const authTypeDisplayMap: Record<string, string> = {
  oauth: "OAuth2",
  oauth2: "OAuth2",
  api_key: "API Key",
  basic: "Basic",
  pat: "PAT",
  username_api_key: "Username & API Key",
  username_token: "Username & Token",
  personal_access_token: "Personal Access Token",
  github_app: "GitHub App",
  basic_auth: "Basic Auth",
  bot_token: "Bot Token",
  webhook: "Webhook",
  app_password: "App Password",
};

// Connector-specific auth field configurations (same as RotateCredentialDialog)
const CONNECTOR_AUTH_CONFIG: Record<string, Record<string, { label: string; type: "text" | "password"; placeholder: string }[]>> = {
  Jira: {
    username_api_key: [
      { label: "Username/Email", type: "text", placeholder: "Enter your Jira username or email" },
      { label: "API Key", type: "password", placeholder: "Enter your API key" },
    ],
    personal_access_token: [
      { label: "Personal Access Token", type: "password", placeholder: "Enter your PAT" },
    ],
  },
  GitHub: {
    username_token: [
      { label: "Username", type: "text", placeholder: "Enter your GitHub username" },
      { label: "Personal Access Token", type: "password", placeholder: "Enter your Personal Access Token" },
    ],
    github_app: [
      { label: "GitHub Installation ID", type: "text", placeholder: "Enter Installation ID" },
      { label: "GitHub Application ID", type: "text", placeholder: "Enter Application ID" },
      { label: "GitHub Private Key", type: "password", placeholder: "Enter Private Key" },
    ],
  },
  GitLab: {
    personal_access_token: [
      { label: "Personal Access Token", type: "password", placeholder: "Enter your Personal Access Token" },
    ],
  },
  "Azure Repos": {
    personal_access_token: [
      { label: "Personal Access Token", type: "password", placeholder: "Enter your Azure DevOps PAT" },
    ],
  },
  Bitbucket: {
    app_password: [
      { label: "Username", type: "text", placeholder: "Enter your Bitbucket username" },
      { label: "App Password", type: "password", placeholder: "Enter your App Password" },
    ],
  },
  Jenkins: {
    username_token: [
      { label: "Username", type: "text", placeholder: "Enter your Jenkins username" },
      { label: "API Token", type: "password", placeholder: "Enter your API Token" },
    ],
  },
  ServiceNow: {
    basic_auth: [
      { label: "Username", type: "text", placeholder: "Enter your ServiceNow username" },
      { label: "Password", type: "password", placeholder: "Enter your password" },
    ],
    oauth2: [
      { label: "Client ID", type: "text", placeholder: "Enter your Client ID" },
      { label: "Client Secret", type: "password", placeholder: "Enter your Client Secret" },
      { label: "Token URL", type: "text", placeholder: "https://your-instance.service-now.com/oauth_token.do" },
    ],
  },
  "Cloud Foundry": {
    oauth2: [
      { label: "Client ID", type: "text", placeholder: "Enter your Client ID" },
      { label: "Client Secret", type: "password", placeholder: "Enter your Client Secret" },
      { label: "Token URL", type: "text", placeholder: "Enter your Token URL" },
    ],
  },
  Slack: {
    bot_token: [
      { label: "Bot Token", type: "password", placeholder: "xoxb-your-token" },
    ],
  },
  "Microsoft Teams": {
    webhook: [
      { label: "Webhook URL", type: "text", placeholder: "Enter your Teams webhook URL" },
    ],
  },
};

// Default auth fields for connectors not specifically configured
const DEFAULT_AUTH_FIELDS: Record<string, { label: string; type: "text" | "password"; placeholder: string }[]> = {
  api_key: [
    { label: "API Key", type: "password", placeholder: "Enter your API key" },
  ],
  basic_auth: [
    { label: "Username", type: "text", placeholder: "Enter username" },
    { label: "Password", type: "password", placeholder: "Enter password" },
  ],
  oauth2: [
    { label: "Client ID", type: "text", placeholder: "Enter your Client ID" },
    { label: "Client Secret", type: "password", placeholder: "Enter your Client Secret" },
    { label: "Token URL", type: "text", placeholder: "Enter your Token URL" },
  ],
  personal_access_token: [
    { label: "Personal Access Token", type: "password", placeholder: "Enter your PAT" },
  ],
  username_token: [
    { label: "Username", type: "text", placeholder: "Enter username" },
    { label: "Token", type: "password", placeholder: "Enter your token" },
  ],
  bot_token: [
    { label: "Bot Token", type: "password", placeholder: "Enter your bot token" },
  ],
};

const statusConfig = {
  active: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500", label: "Active" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-500", label: "Pending" },
  expired: { icon: XCircle, color: "text-red-600", bg: "bg-red-500", label: "Expired" },
  revoked: { icon: Pause, color: "text-slate-600", bg: "bg-slate-500", label: "Revoked" },
};

const formSchema = z.object({
  name: z.string().min(1, "Credential name is required").max(100, "Name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
  workstream_ids: z.array(z.string()).min(1, "At least one workstream is required"),
  product_id: z.string().min(1, "Product is required"),
  service_id: z.string().min(1, "Service is required"),
  status: z.enum(["active", "pending", "expired", "revoked"]),
  expires_at: z.string().optional(),
  expiry_notice_days: z.number().min(1).max(365).optional(),
  expiry_notify: z.boolean().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: Credential | null;
  onSave?: () => void;
}

export function EditCredentialDialog({
  open,
  onOpenChange,
  credential,
  onSave,
}: EditCredentialDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { updateCredential } = useCredentials(selectedAccount?.id, selectedEnterprise?.id);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [credentialFieldValues, setCredentialFieldValues] = useState<Record<string, string>>({});
  const [credentialFieldsDirty, setCredentialFieldsDirty] = useState(false);
  
  // Track credential name for duplicate checking
  const [credentialName, setCredentialName] = useState("");

  // Get auth fields for the current credential
  const authFields = useMemo(() => {
    if (!credential) return [];
    const connectorConfig = CONNECTOR_AUTH_CONFIG[credential.connector];
    if (connectorConfig && connectorConfig[credential.auth_type]) {
      return connectorConfig[credential.auth_type];
    }
    return DEFAULT_AUTH_FIELDS[credential.auth_type] || DEFAULT_AUTH_FIELDS.api_key;
  }, [credential]);

  const { isDuplicate: isNameDuplicate, isChecking: isCheckingName } = useCheckCredentialNameExists(
    credentialName,
    selectedAccount?.id,
    selectedEnterprise?.id,
    credential?.id // Exclude current credential in edit mode
  );

  // Fetch licensed products and services for the selected account/enterprise
  const { data: licensedData = { products: [], services: [] }, isLoading: isLoadingLicensedData } = useQuery({
    queryKey: ["licensed-products-services-edit-credentials", selectedAccount?.id, selectedEnterprise?.id],
    queryFn: async () => {
      if (!selectedAccount?.id || !selectedEnterprise?.id) {
        return { products: [], services: [] };
      }

      if (isExternalApi()) {
        const { data, error } = await httpClient.get<{
          products: { id: string; name: string }[];
          services: { id: string; name: string }[];
        }>("/api/licenses/licensed-entities", {
          params: { accountId: selectedAccount.id, enterpriseId: selectedEnterprise.id },
        });
        if (error) throw new Error(error.message);
        return data || { products: [], services: [] };
      }

      // Fetch licenses for the selected account and enterprise (only active licenses)
      const { data: licenses, error: licensesError } = await supabase
        .from("account_licenses")
        .select("product_id, service_id")
        .eq("account_id", selectedAccount.id)
        .eq("enterprise_id", selectedEnterprise.id)
        .gte("end_date", new Date().toISOString().split("T")[0]);

      if (licensesError) throw licensesError;

      if (!licenses || licenses.length === 0) {
        return { products: [], services: [] };
      }

      const productIds = [...new Set(licenses.map((l) => l.product_id))];
      const serviceIds = [...new Set(licenses.map((l) => l.service_id))];

      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds)
        .order("name");

      if (productsError) throw productsError;

      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("id, name")
        .in("id", serviceIds)
        .order("name");

      if (servicesError) throw servicesError;

      return {
        products: (products || []) as { id: string; name: string }[],
        services: (services || []) as { id: string; name: string }[],
      };
    },
    enabled: Boolean(selectedAccount?.id && selectedEnterprise?.id && open),
  });

  const products = licensedData.products;
  const services = licensedData.services;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      workstream_ids: [],
      product_id: "",
      service_id: "",
      status: "active",
      expires_at: "",
      expiry_notice_days: 30,
      expiry_notify: true,
    },
  });

  // Reset form when credential changes
  useEffect(() => {
    if (credential && open) {
      // Get workstream IDs from credential_workstreams or fall back to single workstream_id
      const workstreamIds = credential.workstreams?.map(ws => ws.id) || 
        (credential.workstream_id ? [credential.workstream_id] : []);
      
      form.reset({
        name: credential.name,
        description: credential.description || "",
        workstream_ids: workstreamIds,
        product_id: credential.product_id || "",
        service_id: credential.service_id || "",
        status: credential.status,
        expires_at: credential.expires_at ? format(new Date(credential.expires_at), "yyyy-MM-dd") : "",
        expiry_notice_days: credential.expiry_notice_days || 30,
        expiry_notify: credential.expiry_notify ?? true,
      });
      setCredentialName(credential.name);
      
      // Initialize credential field values from existing credentials
      const existingCreds = credential.credentials as Record<string, unknown> || {};
      const fieldKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const initialValues: Record<string, string> = {};
      authFields.forEach((f) => {
        const key = fieldKey(f.label);
        initialValues[key] = (existingCreds[key] as string) || "";
      });
      setCredentialFieldValues(initialValues);
      setCredentialFieldsDirty(false);
      setShowPasswords({});
    }
  }, [credential, open, form, authFields]);

  const handleSubmit = async (data: FormValues) => {
    if (!credential || isNameDuplicate) return;

    setIsSubmitting(true);

    try {
      const updatePayload: Parameters<typeof updateCredential.mutateAsync>[0] = {
        id: credential.id,
        name: data.name,
        description: data.description || null,
        workstream_ids: data.workstream_ids,
        product_id: data.product_id || null,
        service_id: data.service_id || null,
        status: data.status,
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
        expiry_notice_days: data.expiry_notice_days,
        expiry_notify: data.expiry_notify,
      };

      // Include credentials if any field was modified
      if (credentialFieldsDirty) {
        (updatePayload as Record<string, unknown>).credentials = credentialFieldValues;
      }

      await updateCredential.mutateAsync(updatePayload);

      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update credential:", error);
    } finally {
      setIsSubmitting(false);
    }
  };


  if (!credential) return null;

  const displayAuthType = authTypeDisplayMap[credential.auth_type] || credential.auth_type;
  const currentStatus = statusConfig[credential.status as keyof typeof statusConfig] || statusConfig.active;
  const CurrentStatusIcon = currentStatus.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden gap-0">
        <VisuallyHidden>
          <DialogTitle>Edit Credential</DialogTitle>
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
              <Key className="w-5 h-5" />
            </motion.div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Edit Credential</h2>
              <p className="text-sm text-muted-foreground">Update credential settings and expiration</p>
            </div>
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
                    <span className="text-sm font-medium text-muted-foreground">Connector</span>
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      {credential.connector}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50">
                    <span className="text-sm font-medium text-muted-foreground">Category</span>
                    <span className="text-sm font-medium text-foreground">{credential.category}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/50">
                    <span className="text-sm font-medium text-muted-foreground">Auth Type</span>
                    <Badge variant="outline" className="gap-1.5">
                      <Lock className="w-3 h-3" />
                      {displayAuthType}
                    </Badge>
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
                        Credential Name <span className="text-destructive">*</span>
                        {isCheckingName && (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter credential name"
                          className={cn(
                            "bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary",
                            isNameDuplicate && "border-destructive focus:ring-destructive/20 focus:border-destructive"
                          )}
                          onChange={(e) => {
                            field.onChange(e);
                            setCredentialName(e.target.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                      {isNameDuplicate && !isCheckingName && (
                        <p className="text-sm text-destructive flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          A credential with this name already exists for this account and enterprise
                        </p>
                      )}
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
                  name="workstream_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                        Workstreams <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <WorkstreamMultiSelect
                          accountId={selectedAccount?.id}
                          enterpriseId={selectedEnterprise?.id}
                          selectedIds={field.value || []}
                          onSelectionChange={field.onChange}
                          autoSelectDefault={false}
                        />
                      </FormControl>
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
                        Change the status of this credential
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Products & Services */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <FormField
                      control={form.control}
                      name="product_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <Box className="w-3.5 h-3.5 text-muted-foreground" />
                            Product <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            disabled={isLoadingLicensedData || products.length === 0}
                          >
                            <FormControl>
                              <SelectTrigger className={cn(
                                "bg-background transition-all duration-200",
                                field.value && "ring-1 ring-primary/20 border-primary/30"
                              )}>
                                {isLoadingLicensedData ? (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Loading...</span>
                                  </div>
                                ) : (
                                  <SelectValue placeholder={products.length === 0 ? "No licensed products" : "Select product"} />
                                )}
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent position="popper">
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  <div className="flex items-center gap-2">
                                    <Box className="w-3.5 h-3.5 text-primary" />
                                    {p.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="service_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                            Service <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            disabled={isLoadingLicensedData || services.length === 0}
                          >
                            <FormControl>
                              <SelectTrigger className={cn(
                                "bg-background transition-all duration-200",
                                field.value && "ring-1 ring-primary/20 border-primary/30"
                              )}>
                                {isLoadingLicensedData ? (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Loading...</span>
                                  </div>
                                ) : (
                                  <SelectValue placeholder={services.length === 0 ? "No licensed services" : "Select service"} />
                                )}
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent position="popper">
                              {services.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  <div className="flex items-center gap-2">
                                    <Wrench className="w-3.5 h-3.5 text-emerald-500" />
                                    {s.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>
                  
                {!isLoadingLicensedData && products.length === 0 && services.length === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-3">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-amber-600 dark:text-amber-400">
                      No active licenses found for the selected account and enterprise
                    </span>
                  </div>
                )}
              </motion.div>

              {/* Credential Fields Section */}
              {credential.auth_type !== "oauth" && authFields.length > 0 && (
                <motion.div
                  className="space-y-4 pt-5 border-t"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">Credentials</span>
                      <p className="text-xs text-muted-foreground">Update the authentication values for this credential</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {authFields.map((authField) => {
                      const fieldKey = authField.label.toLowerCase().replace(/[^a-z0-9]/g, "_");
                      const isPassword = authField.type === "password";
                      const showPassword = showPasswords[fieldKey] || false;

                      return (
                        <div key={fieldKey} className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            {isPassword && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                            {authField.label}
                          </label>
                          <div className="relative">
                            <Input
                              type={isPassword && !showPassword ? "password" : "text"}
                              placeholder={authField.placeholder}
                              value={credentialFieldValues[fieldKey] || ""}
                              onChange={(e) => {
                                setCredentialFieldValues(prev => ({
                                  ...prev,
                                  [fieldKey]: e.target.value,
                                }));
                                setCredentialFieldsDirty(true);
                              }}
                              className={cn(
                                "bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary",
                                isPassword && "pr-10"
                              )}
                            />
                            {isPassword && (
                              <button
                                type="button"
                                onClick={() => setShowPasswords(prev => ({ ...prev, [fieldKey]: !showPassword }))}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Expiration Settings Section */}
              <motion.div 
                className="space-y-4 pt-5 border-t"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-foreground">Expiration Settings</span>
                </div>

                <FormField
                  control={form.control}
                  name="expires_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiration Date</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
                          className="bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </FormControl>
                      <FormDescription>
                        When this credential will expire (leave blank for no expiration)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <motion.div 
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border transition-all hover:bg-muted/50"
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Expiry Notifications</p>
                      <p className="text-xs text-muted-foreground">Send email reminders before expiration</p>
                    </div>
                  </div>
                  <FormField
                    control={form.control}
                    name="expiry_notify"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </motion.div>

                {form.watch("expiry_notify") && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <FormField
                      control={form.control}
                      name="expiry_notice_days"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notice Period (days)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                              className="bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                          </FormControl>
                          <FormDescription>
                            Days before expiration to start sending notifications
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                )}
              </motion.div>

              {/* OAuth warning */}
              {credential.auth_type === "oauth" && (
                <motion.div 
                  className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">OAuth Credential</p>
                    <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                      To update OAuth tokens, you'll need to re-authenticate with the provider.
                    </p>
                  </div>
                </motion.div>
              )}
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
                disabled={isSubmitting || (!form.formState.isDirty && !credentialFieldsDirty) || isNameDuplicate}
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