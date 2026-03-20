import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Globe,
  Loader2,
  FileText,
  Link2,
  ChevronRight,
  ChevronLeft,
  Check,
  Save,
  Lock,
  Wrench,
  Zap,
  Server,
  Cloud,
} from "lucide-react";
import { useEnvironments, type CreateEnvironmentInput, type EnvironmentConnectorRecord } from "@/hooks/useEnvironments";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useProductContext } from "@/contexts/ProductContext";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { testConnectivity } from "@/lib/testConnectivity";


const formSchema = z.object({
  name: z.string().min(1, "Environment Name is required").max(100),
  description: z.string().max(500).optional(),
  workstream_id: z.string().min(1, "Workstream is required"),
  product_id: z.string().optional(),
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

const STEPS = [
  { id: 1, title: "Details", icon: FileText, description: "Basic info" },
  { id: 2, title: "Connectors", icon: Link2, description: "Tool config" },
];

export function AddEnvironmentDialog({
  open,
  onOpenChange,
  existingEnvironments = [],
}: AddEnvironmentDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { selectedProduct } = useProductContext();
  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  const { createEnvironment } = useEnvironments(accountId, enterpriseId);
  const { workstreams } = useWorkstreams(accountId, enterpriseId);

  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Step 2 state
  const [selectedCategory, setSelectedCategory] = useState("Deploy");
  const [selectedConnectorTool, setSelectedConnectorTool] = useState("");
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [environmentType, setEnvironmentType] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiCredentialName, setApiCredentialName] = useState("");
  const [iflowUrl, setIflowUrl] = useState("");
  const [iflowCredentialName, setIflowCredentialName] = useState("");
  const [hostUrl, setHostUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);
  const [filteredCredentials, setFilteredCredentials] = useState<{ id: string; name: string }[]>([]);


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

  // Fetch workstream_tools when workstream + category changes
  const watchedWorkstreamId = form.watch("workstream_id");
  useEffect(() => {
    const fetchTools = async () => {
      if (!watchedWorkstreamId || !selectedCategory) {
        setAvailableTools([]);
        return;
      }
      if (isExternalApi()) {
        try {
          const res = await httpClient.get<any[]>(`/workstream-tools?workstreamId=${watchedWorkstreamId}&category=${selectedCategory}`);
          setAvailableTools((res.data || []).map((t: any) => t.tool_name || t.toolName));
        } catch {
          setAvailableTools([]);
        }
      } else {
        const { data } = await supabase
          .from("workstream_tools")
          .select("tool_name")
          .eq("workstream_id", watchedWorkstreamId)
          .eq("category", selectedCategory);
        setAvailableTools((data || []).map((t) => t.tool_name));
      }
    };
    fetchTools();
    setSelectedConnectorTool("");
  }, [watchedWorkstreamId, selectedCategory]);

  // Fetch filtered credentials by account, enterprise, product, workstream
  useEffect(() => {
    const fetchCreds = async () => {
      if (!accountId || !enterpriseId || !watchedWorkstreamId) {
        setFilteredCredentials([]);
        return;
      }
      if (isExternalApi()) {
        try {
          const res = await httpClient.get<any[]>(`/credentials?accountId=${accountId}&enterpriseId=${enterpriseId}&workstreamId=${watchedWorkstreamId}${selectedProduct?.id ? `&productId=${selectedProduct.id}` : ''}`);
          setFilteredCredentials((res.data || []).map((c: any) => ({ id: c.id, name: c.name })));
        } catch {
          setFilteredCredentials([]);
        }
      } else {
        let query = supabase
          .from("credentials")
          .select("id, name")
          .eq("account_id", accountId)
          .eq("enterprise_id", enterpriseId);
        if (selectedProduct?.id) {
          query = query.eq("product_id", selectedProduct.id);
        }
        const { data } = await query;
        // Further filter by workstream via credential_workstreams junction
        if (data && data.length > 0) {
          const { data: cwData } = await supabase
            .from("credential_workstreams")
            .select("credential_id")
            .eq("workstream_id", watchedWorkstreamId);
          const wsCredIds = new Set((cwData || []).map(cw => cw.credential_id));
          setFilteredCredentials(data.filter(c => wsCredIds.has(c.id)));
        } else {
          setFilteredCredentials([]);
        }
      }
    };
    fetchCreds();
  }, [accountId, enterpriseId, watchedWorkstreamId, selectedProduct?.id]);

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
      setCurrentStep(1);
      setDirection(1);
      setSelectedCategory("Deploy");
      setSelectedConnectorTool("");
      setEnvironmentType("");
      setApiUrl("");
      setApiCredentialName("");
      setIflowUrl("");
      setIflowCredentialName("");
      setHostUrl("");
      setTestResult(null);
    }
  }, [open, form]);

  const handleSubmit = async (data: FormValues) => {
    if (!accountId || !enterpriseId) return;

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

    // Build connectors array from step 2 state
    const builtConnectors: EnvironmentConnectorRecord[] = [];
    if (selectedConnectorTool) {
      const conn: EnvironmentConnectorRecord = {
        id: `conn-${Date.now()}`,
        category: selectedCategory,
        connector: selectedConnectorTool,
        connectorIconName: selectedConnectorTool,
        status: true,
      };
      if (isCloudFoundry) {
        conn.environmentType = environmentType;
        conn.apiUrl = apiUrl;
        conn.apiCredentialName = apiCredentialName;
        conn.iflowUrl = iflowUrl;
        conn.iflowCredentialName = iflowCredentialName;
        conn.hostUrl = hostUrl;
      }
      builtConnectors.push(conn);
    }

    try {
      await createEnvironment.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        account_id: accountId,
        enterprise_id: enterpriseId,
        workstream_id: data.workstream_id || undefined,
        product_id: selectedProduct?.id || data.product_id || undefined,
        service_id: data.service_id || undefined,
        connector_name: selectedConnectorTool || data.connector_name || undefined,
        connectivity_status: testResult === "success" ? "healthy" : (data.connectivity_status || "unknown"),
        connectors: builtConnectors,
      });
      toast.success(`Environment "${data.name}" created successfully`);
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  // Step validation
  const watchedName = form.watch("name");
  const watchedServiceId = form.watch("service_id");

  const stepValidation = useMemo(() => ({
    1: Boolean(watchedName?.trim() && watchedWorkstreamId && watchedServiceId),
    2: true, // Connectors are optional
  }), [watchedName, watchedWorkstreamId, watchedServiceId]);

  const isCurrentStepValid = stepValidation[currentStep as keyof typeof stepValidation];

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const nextStep = () => {
    if (currentStep < 2 && isCurrentStepValid) {
      window.setTimeout(() => {
        setDirection(1);
        setCurrentStep(prev => prev + 1);
      }, 0);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0, scale: 0.95 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 300 : -300, opacity: 0, scale: 0.95 }),
  };

  const renderStepIndicator = () => (
    <div className="bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 border-b px-6 py-4">
      <div className="flex items-center justify-center gap-1">
        {STEPS.map((step, index) => {
          const isActive = currentStep === step.id;
          const isStepValid = stepValidation[step.id as keyof typeof stepValidation];
          const isPast = currentStep > step.id;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center">
              <motion.button
                type="button"
                onClick={() => (isPast || isStepValid) && goToStep(step.id)}
                disabled={!isPast && !isActive && !isStepValid}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300",
                  isActive && "bg-primary/10 shadow-sm",
                  (isPast || isStepValid) && "cursor-pointer hover:bg-primary/5",
                  !isPast && !isActive && !isStepValid && "opacity-50 cursor-not-allowed"
                )}
                whileHover={(isPast || isStepValid) ? { scale: 1.02 } : {}}
                whileTap={(isPast || isStepValid) ? { scale: 0.98 } : {}}
              >
                <motion.div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 relative",
                    isActive && "bg-primary text-primary-foreground shadow-lg",
                    !isActive && isPast && isStepValid && "bg-emerald-500 text-white",
                    !isActive && !isPast && isStepValid && "bg-emerald-500/20 text-emerald-600 border-2 border-emerald-500/50",
                    !isActive && !isStepValid && "bg-muted border-2 border-muted-foreground/20"
                  )}
                  animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isStepValid && !isActive ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      <Check className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}

                  {!isActive && !isStepValid && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-background"
                    />
                  )}
                </motion.div>
                <div className="text-left">
                  <p className={cn(
                    "text-sm font-medium transition-colors",
                    isActive ? "text-primary" : isStepValid ? "text-emerald-600" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{step.description}</p>
                </div>

                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl border-2 border-primary/30"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </motion.button>

              {index < STEPS.length - 1 && (
                <div className="w-12 h-0.5 mx-2 relative">
                  <div className="absolute inset-0 bg-muted-foreground/20 rounded-full" />
                  <motion.div
                    className={cn(
                      "absolute inset-0 rounded-full origin-left",
                      isStepValid ? "bg-emerald-500" : isPast ? "bg-primary" : "bg-transparent"
                    )}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: isStepValid || isPast ? 1 : 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Header Card */}
      <motion.div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/5 via-blue-500/10 to-indigo-500/5 p-6 border border-blue-500/10"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <motion.div
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Globe className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Environment Details</h3>
            <p className="text-sm text-muted-foreground">Define the basic information for this environment</p>
          </div>
        </div>
      </motion.div>

      {/* Form Fields */}
      <motion.div
        className="space-y-5"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {/* Name */}
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-1.5">Environment Name <span className="text-destructive">*</span></FormLabel>
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
        )} />

        {/* Description */}
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Brief description of this environment"
                className="bg-background resize-none transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                rows={3}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {/* Workstream / Service */}
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="workstream_id" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">Workstream <span className="text-destructive">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className={cn("bg-background transition-all duration-200", field.value && "ring-1 ring-primary/20 border-primary/30")}>
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
          )} />

          <FormField control={form.control} name="service_id" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                Service <span className="text-destructive">*</span>
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className={cn("bg-background transition-all duration-200", field.value && "ring-1 ring-primary/20 border-primary/30")}>
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
          )} />
        </div>
      </motion.div>

      {/* Context Badge */}
      <motion.div
        className="flex items-center gap-2 p-4 rounded-xl bg-muted/30 border"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">This environment will be scoped to:</span>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
          {selectedAccount?.name || "Account"} / {selectedEnterprise?.name || "Enterprise"}
        </Badge>
      </motion.div>
    </div>
  );

  const handleTestConnectivity = async () => {
    if (!hostUrl) {
      toast.error("Host URL is required to test connectivity");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      let credentialId = "";
      const credName = iflowCredentialName || apiCredentialName;
      if (credName && !isExternalApi()) {
        const { data: creds } = await supabase
          .from("credentials")
          .select("id")
          .eq("name", credName)
          .eq("account_id", accountId!)
          .eq("enterprise_id", enterpriseId!)
          .limit(1);
        if (creds?.[0]) credentialId = creds[0].id;
      }
      if (!credentialId && !isExternalApi()) {
        toast.error(`Credential "${credName}" not found`);
        setTestResult("failed");
        return;
      }
      const result = await testConnectivity({
        connector: "cloud_foundry",
        url: hostUrl,
        credentialId,
        credentialName: credName,
      });
      if (result?.success) {
        toast.success(result.message || "Connection successful");
        setTestResult("success");
      } else {
        toast.error(result?.message || "Connection failed");
        setTestResult("failed");
      }
    } catch {
      toast.error("Connection test failed");
      setTestResult("failed");
    } finally {
      setIsTesting(false);
    }
  };

  const isCloudFoundry = selectedCategory === "Deploy" && selectedConnectorTool === "Cloud Foundry";

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Header Card */}
      <motion.div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/5 via-primary/10 to-primary/5 p-6 border border-primary/10"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <motion.div
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-primary/80 flex items-center justify-center text-white shadow-lg shadow-violet-500/30"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Link2 className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Connectors Configuration</h3>
            <p className="text-sm text-muted-foreground">Select category and connector for this environment</p>
          </div>
        </div>
      </motion.div>

      {/* Category + Connector Selection */}
      <motion.div
        className="space-y-5"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="grid grid-cols-2 gap-4">
          {/* Category - Fixed as Deploy */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">Category <span className="text-destructive">*</span></label>
            <Input value="Deploy" disabled className="bg-muted/50 font-medium" />
          </div>

          {/* Connector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">Connector <span className="text-destructive">*</span></label>
            <Select value={selectedConnectorTool} onValueChange={setSelectedConnectorTool} disabled={availableTools.length === 0}>
              <SelectTrigger className={cn("bg-background", !selectedConnectorTool && availableTools.length === 0 && "opacity-60")}>
                <SelectValue placeholder={availableTools.length === 0 ? "No tools configured" : "Select connector"} />
              </SelectTrigger>
              <SelectContent className="z-[200] bg-popover border shadow-lg">
                {availableTools.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableTools.length === 0 && watchedWorkstreamId && (
              <p className="text-[10px] text-amber-600">No tools found for this workstream under "{selectedCategory}" category in Global Settings.</p>
            )}
          </div>
        </div>

        {/* Cloud Foundry specific fields */}
        {isCloudFoundry && (
          <motion.div
            className="space-y-5 border-t pt-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" />
              Connectivity Details
            </h4>

            {/* Environment Type Tiles */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">Environment Type <span className="text-destructive">*</span></label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "Pre-Production", label: "Pre-Production", sub: "Non-Prod / Staging target" },
                  { value: "Production", label: "Production", sub: "Production target" },
                ].map((tile) => (
                  <motion.button
                    key={tile.value}
                    type="button"
                    onClick={() => setEnvironmentType(tile.value)}
                    className={cn(
                      "relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 text-center",
                      environmentType === tile.value
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-muted hover:border-primary/30 hover:bg-muted/50"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {environmentType === tile.value && (
                      <motion.div
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </motion.div>
                    )}
                    <Server className={cn("w-6 h-6 mb-1.5", environmentType === tile.value ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-sm font-medium", environmentType === tile.value ? "text-primary" : "text-foreground")}>{tile.label}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{tile.sub}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* API URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">API URL <span className="text-destructive">*</span></label>
              <Input
                placeholder="https://xxx.cfapps.us10-001.hana.ondemand.com"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="bg-background"
              />
            </div>

            {/* API Credential Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">API Credential Name <span className="text-destructive">*</span></label>
              <Select value={apiCredentialName} onValueChange={setApiCredentialName}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select credential" />
                </SelectTrigger>
                <SelectContent className="z-[200] bg-popover border shadow-lg">
                  {filteredCredentials.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredCredentials.length === 0 && (
                <p className="text-[10px] text-amber-600">No credentials found for the selected workstream scope.</p>
              )}
            </div>

            {/* IFlow URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">IFlow URL <span className="text-destructive">*</span></label>
              <Input
                placeholder="IFlow endpoint URL"
                value={iflowUrl}
                onChange={(e) => setIflowUrl(e.target.value)}
                className="bg-background"
              />
            </div>

            {/* IFlow Credential Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">IFlow Credential Name <span className="text-destructive">*</span></label>
              <Select value={iflowCredentialName} onValueChange={setIflowCredentialName}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select credential" />
                </SelectTrigger>
                <SelectContent className="z-[200] bg-popover border shadow-lg">
                  {filteredCredentials.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Host URL */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">Host URL <span className="text-destructive">*</span></label>
              <Input
                placeholder="https://xxx.it-cpitrial06.cfapps.us10-001.hana.ondemand.com"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                className="bg-background"
              />
            </div>

            {/* Test Button */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnectivity}
                disabled={isTesting || !hostUrl}
                className="gap-2"
              >
                {isTesting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Test Connectivity
              </Button>
              {testResult === "success" && (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700">
                  <Check className="w-3 h-3" /> Connected
                </Badge>
              )}
              {testResult === "failed" && (
                <Badge className="gap-1 bg-red-100 text-red-700">
                  Connection Failed
                </Badge>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] p-0 overflow-hidden gap-0 rounded-2xl border shadow-2xl bg-card"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Add Environment</DialogTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-muted/30 via-background to-blue-500/5">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg"
              whileHover={{ scale: 1.05 }}
            >
              <Globe className="w-5 h-5" />
            </motion.div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Add Environment</h2>
              <p className="text-sm text-muted-foreground">Configure a new deployment environment</p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Form Content */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="p-6 overflow-y-auto max-h-[55vh]">
              <AnimatePresence mode="wait" custom={direction}>
                {currentStep === 1 && (
                  <motion.div
                    key="step1"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    {renderStep1()}
                  </motion.div>
                )}
                {currentStep === 2 && (
                  <motion.div
                    key="step2"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    {renderStep2()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
              <div className="text-sm text-muted-foreground">
                Step {currentStep} of {STEPS.length}
              </div>
              <div className="flex gap-3">
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    className="gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                {currentStep < STEPS.length ? (
                  <Button
                    type="button"
                    onClick={nextStep}
                    disabled={!isCurrentStepValid}
                    className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-700 hover:to-indigo-600 text-white shadow-md"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={createEnvironment.isPending}
                    className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-700 hover:to-indigo-600 text-white shadow-md"
                  >
                    {createEnvironment.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create Environment
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
