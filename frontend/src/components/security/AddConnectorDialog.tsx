import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  X,
  Save,
  ChevronRight,
  ChevronLeft,
  Check,
  Link2,
  AlertCircle,
  Loader2,
  FileText,
  Code,
  Hammer,
  TestTube,
  Rocket,
  UserCheck,
  Tag,
  MoreHorizontal,
  TicketCheck,
  Github,
  GitBranch,
  Cloud,
  Blocks,
  Cog,
  Cpu,
  FlaskConical,
  SearchCode,
  CloudCog,
  Workflow,
  Hand,
  MessageSquare,
  Users,
  Headset,
  BarChart3,
  Activity,
  ListChecks,
  Trello,
  CircleDot,
  Settings2,
  Box,
  Wrench,
  Plug,
  Zap,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useCredentials, type Credential } from "@/hooks/useCredentials";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { WorkstreamMultiSelect } from "@/components/access-control/WorkstreamMultiSelect";
import type { LucideIcon } from "lucide-react";

// Tool categories with icons (matching WorkstreamToolsConfig)
const TOOL_CATEGORIES: Record<string, {
  icon: LucideIcon;
  gradient: string;
  bgColor: string;
  tools: { name: string; color: string; icon: LucideIcon }[];
}> = {
  Plan: {
    icon: FileText,
    gradient: "from-blue-500 to-blue-600",
    bgColor: "bg-blue-50",
    tools: [
      { name: "Jira", color: "bg-blue-600", icon: TicketCheck },
      { name: "Trello", color: "bg-sky-500", icon: Trello },
      { name: "Asana", color: "bg-orange-500", icon: ListChecks },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Code: {
    icon: Code,
    gradient: "from-violet-500 to-violet-600",
    bgColor: "bg-violet-50",
    tools: [
      { name: "GitHub", color: "bg-slate-800", icon: Github },
      { name: "GitLab", color: "bg-orange-600", icon: GitBranch },
      { name: "Azure Repos", color: "bg-blue-500", icon: Cloud },
      { name: "Bitbucket", color: "bg-blue-700", icon: Blocks },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Build: {
    icon: Hammer,
    gradient: "from-amber-500 to-amber-600",
    bgColor: "bg-amber-50",
    tools: [
      { name: "GitHub", color: "bg-slate-800", icon: Github },
      { name: "AWS CodeBuild", color: "bg-orange-500", icon: CloudCog },
      { name: "Jenkins", color: "bg-red-600", icon: Cog },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Test: {
    icon: TestTube,
    gradient: "from-emerald-500 to-emerald-600",
    bgColor: "bg-emerald-50",
    tools: [
      { name: "Tricentis Tosca", color: "bg-blue-600", icon: Cpu },
      { name: "Selenium", color: "bg-green-600", icon: FlaskConical },
      { name: "SonarQube", color: "bg-cyan-600", icon: SearchCode },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Deploy: {
    icon: Rocket,
    gradient: "from-rose-500 to-rose-600",
    bgColor: "bg-rose-50",
    tools: [
      { name: "Cloud Foundry", color: "bg-blue-500", icon: Cloud },
      { name: "AWS CodePipeline", color: "bg-orange-500", icon: Workflow },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Approval: {
    icon: UserCheck,
    gradient: "from-indigo-500 to-indigo-600",
    bgColor: "bg-indigo-50",
    tools: [
      { name: "Manual", color: "bg-slate-600", icon: Hand },
      { name: "Slack", color: "bg-purple-600", icon: MessageSquare },
      { name: "Microsoft Teams", color: "bg-blue-600", icon: Users },
    ],
  },
  Release: {
    icon: Tag,
    gradient: "from-pink-500 to-pink-600",
    bgColor: "bg-pink-50",
    tools: [
      { name: "ServiceNow", color: "bg-green-600", icon: Headset },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Others: {
    icon: MoreHorizontal,
    gradient: "from-slate-500 to-slate-600",
    bgColor: "bg-slate-50",
    tools: [
      { name: "Grafana", color: "bg-orange-500", icon: BarChart3 },
      { name: "Prometheus", color: "bg-red-500", icon: Activity },
    ],
  },
};

// Connectivity details configuration per connector
const CONNECTOR_CONNECTIVITY_CONFIG: Record<string, {
  fields: { label: string; key: string; type: "text" | "url"; placeholder: string; required: boolean }[];
}> = {
  Jira: {
    fields: [
      { label: "URL", key: "url", type: "url", placeholder: "https://your-domain.atlassian.net", required: true },
    ],
  },
  GitHub: {
    fields: [
      { label: "URL", key: "url", type: "url", placeholder: "https://api.github.com or https://github.your-company.com/api/v3", required: true },
    ],
  },
  GitLab: {
    fields: [
      { label: "URL", key: "url", type: "url", placeholder: "https://gitlab.com or https://gitlab.your-company.com", required: true },
    ],
  },
  ServiceNow: {
    fields: [
      { label: "URL", key: "url", type: "url", placeholder: "https://your-instance.service-now.com", required: true },
    ],
  },
  Jenkins: {
    fields: [
      { label: "URL", key: "url", type: "url", placeholder: "https://jenkins.your-company.com", required: true },
    ],
  },
  "Cloud Foundry": {
    fields: [
      { label: "URL", key: "url", type: "url", placeholder: "https://api.cf.your-company.com", required: true },
    ],
  },
};

const formSchema = z.object({
  name: z.string().min(1, "Connector name is required").max(100),
  description: z.string().max(500).optional(),
  workstream_ids: z.array(z.string()).min(1, "At least one workstream is required"),
  product_id: z.string().min(1, "Product is required"),
  service_id: z.string().min(1, "Service is required"),
  category: z.string().optional(),
  connector: z.string().optional(),
  url: z.string().optional(),
  credential_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddConnectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: FormValues) => void;
}

const STEPS = [
  { id: 1, title: "Details", icon: FileText, description: "Basic info" },
  { id: 2, title: "Connector", icon: Link2, description: "Select tool" },
  { id: 3, title: "Connectivity", icon: Plug, description: "Configure" },
];

export function AddConnectorDialog({
  open,
  onOpenChange,
  onSave,
}: AddConnectorDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { workstreams } = useWorkstreams(selectedAccount?.id, selectedEnterprise?.id);
  const { credentials } = useCredentials(selectedAccount?.id, selectedEnterprise?.id);

  // Fetch licensed products and services for the selected account/enterprise
  const { data: licensedData = { products: [], services: [] }, isLoading: isLoadingLicensedData } = useQuery({
    queryKey: ["licensed-products-services-connectors", selectedAccount?.id, selectedEnterprise?.id],
    queryFn: async () => {
      if (!selectedAccount?.id || !selectedEnterprise?.id) {
        return { products: [], services: [] };
      }

      if (isExternalApi()) {
        const { data, error } = await httpClient.get<{ products: { id: string; name: string }[]; services: { id: string; name: string }[] }>(
          "/api/licenses/licensed-entities",
          {
            params: {
              accountId: selectedAccount.id,
              enterpriseId: selectedEnterprise.id,
            },
          }
        );
        if (error) throw new Error(error.message);
        return data || { products: [], services: [] };
      }

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
    enabled: Boolean(selectedAccount?.id && selectedEnterprise?.id),
  });

  const products = licensedData.products;
  const services = licensedData.services;

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedConnector, setSelectedConnector] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);
  const [connectivityUrl, setConnectivityUrl] = useState("");
  const [selectedCredentialId, setSelectedCredentialId] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      workstream_ids: [],
      product_id: "",
      service_id: "",
      category: "",
      connector: "",
      url: "",
      credential_id: "",
    },
  });

  const selectedWorkstreamIds = form.watch("workstream_ids");

  // Get available categories based on selected workstreams' tools
  const availableCategories = useMemo(() => {
    if (!selectedWorkstreamIds || selectedWorkstreamIds.length === 0) return [];
    
    const allCategories = new Set<string>();
    selectedWorkstreamIds.forEach(wsId => {
      const workstream = workstreams.find(w => w.id === wsId);
      if (workstream?.tools) {
        workstream.tools.forEach(t => allCategories.add(t.category));
      }
    });
    
    return Array.from(allCategories).filter(cat => TOOL_CATEGORIES[cat]);
  }, [selectedWorkstreamIds, workstreams]);

  // Get available connectors based on selected category
  const availableConnectors = useMemo(() => {
    if (!selectedWorkstreamIds || selectedWorkstreamIds.length === 0 || !selectedCategory) return [];
    
    const allConnectors = new Set<string>();
    selectedWorkstreamIds.forEach(wsId => {
      const workstream = workstreams.find(w => w.id === wsId);
      if (workstream?.tools) {
        workstream.tools
          .filter(t => t.category === selectedCategory)
          .forEach(t => allConnectors.add(t.tool_name));
      }
    });
    
    return Array.from(allConnectors);
  }, [selectedWorkstreamIds, selectedCategory, workstreams]);

  // Get filtered credentials based on selected workstreams AND connector tool
  const filteredCredentials = useMemo(() => {
    if (!selectedWorkstreamIds || selectedWorkstreamIds.length === 0) return [];
    
    return credentials.filter(cred => 
      cred.status === "active" &&
      cred.workstreams?.some(ws => selectedWorkstreamIds.includes(ws.id)) &&
      (!selectedConnector || cred.connector.toLowerCase() === selectedConnector.toLowerCase())
    );
  }, [credentials, selectedWorkstreamIds, selectedConnector]);

  // Get connector icon
  const getConnectorIcon = (connector: string): LucideIcon => {
    for (const category of Object.values(TOOL_CATEGORIES)) {
      const tool = category.tools.find(t => t.name === connector);
      if (tool) return tool.icon;
    }
    return CircleDot;
  };

  // Get connector color
  const getConnectorColor = (connector: string): string => {
    for (const category of Object.values(TOOL_CATEGORIES)) {
      const tool = category.tools.find(t => t.name === connector);
      if (tool) return tool.color;
    }
    return "bg-slate-500";
  };

  // Check if connector requires connectivity details
  const hasConnectivityConfig = selectedConnector && CONNECTOR_CONNECTIVITY_CONFIG[selectedConnector];
  const connectivityConfig = hasConnectivityConfig ? CONNECTOR_CONNECTIVITY_CONFIG[selectedConnector] : null;

  // Reset states when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setDirection(1);
      setShowCategorySelector(false);
      setSelectedCategory("");
      setSelectedConnector("");
      setIsCreating(false);
      setIsTesting(false);
      setTestResult(null);
      setConnectivityUrl("");
      setSelectedCredentialId("");
      form.reset();
    }
  }, [open, form]);

  // Update form when category/connector changes
  useEffect(() => {
    form.setValue("category", selectedCategory);
  }, [selectedCategory, form]);

  useEffect(() => {
    form.setValue("connector", selectedConnector);
    setConnectivityUrl("");
    setSelectedCredentialId("");
    setTestResult(null);
  }, [selectedConnector, form]);

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedConnector("");
  };

  const handleConnectorSelect = (connector: string) => {
    setSelectedConnector(connector);
    setShowCategorySelector(false);
  };

  const handleTestConnectivity = async () => {
    if (!connectivityUrl || !selectedCredentialId) {
      toast.error("Please provide URL and select a credential");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let result: { success: boolean; message?: string };

      if (isExternalApi()) {
        const { data, error } = await httpClient.post<typeof result>("/api/connectors/test", {
          connector: selectedConnector,
          url: connectivityUrl,
          credentialId: selectedCredentialId,
        });
        if (error) throw new Error(error.message);
        result = data!;
      } else {
        const { data, error } = await supabase.functions.invoke("test-connector-connectivity", {
          body: {
            connector: selectedConnector,
            url: connectivityUrl,
            credentialId: selectedCredentialId,
          },
        });
        if (error) throw error;
        result = data;
      }

      if (result?.success) {
        setTestResult("success");
        toast.success("Connection successful!");
      } else {
        setTestResult("failed");
        toast.error(result?.message || "Connection failed");
      }
    } catch (error) {
      console.error("Connectivity test failed:", error);
      setTestResult("failed");
      toast.error("Failed to test connectivity");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (data: FormValues) => {
    if (!selectedAccount?.id || !selectedEnterprise?.id) {
      toast.error("Please select an account and enterprise first");
      return;
    }

    setIsCreating(true);

    try {
      // Here you would create the connector record in your database
      // For now, we'll just call the onSave callback
      onSave?.({
        ...data,
        category: selectedCategory,
        connector: selectedConnector,
        url: connectivityUrl,
        credential_id: selectedCredentialId,
      });
      
      toast.success("Connector created successfully!");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create connector:", error);
      toast.error("Failed to create connector");
    } finally {
      setIsCreating(false);
    }
  };

  // Step validation
  const watchedName = form.watch("name");
  const watchedWorkstreamIds = form.watch("workstream_ids");
  const watchedProductId = form.watch("product_id");
  const watchedServiceId = form.watch("service_id");

  const stepValidation = useMemo(() => {
    const step1Valid = Boolean(
      watchedName?.trim() && 
      watchedWorkstreamIds && 
      watchedWorkstreamIds.length > 0 &&
      watchedProductId && 
      watchedServiceId
    );

    const step2Valid = Boolean(selectedCategory && selectedConnector);

    const step3Valid = hasConnectivityConfig 
      ? Boolean(connectivityUrl && selectedCredentialId)
      : true;

    return {
      1: step1Valid,
      2: step2Valid,
      3: step3Valid,
    };
  }, [watchedName, watchedWorkstreamIds, watchedProductId, watchedServiceId, selectedCategory, selectedConnector, hasConnectivityConfig, connectivityUrl, selectedCredentialId]);

  const isCurrentStepValid = stepValidation[currentStep as keyof typeof stepValidation];

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const nextStep = () => {
    if (currentStep < STEPS.length && isCurrentStepValid) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
  };

  const ConnectorIcon = selectedConnector ? getConnectorIcon(selectedConnector) : Plug;

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
                  "relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300",
                  isActive && "bg-primary/10 shadow-sm",
                  (isPast || isStepValid) && "cursor-pointer hover:bg-primary/5",
                  !isPast && !isActive && !isStepValid && "opacity-50 cursor-not-allowed"
                )}
                whileHover={(isPast || isStepValid) ? { scale: 1.02 } : {}}
                whileTap={(isPast || isStepValid) ? { scale: 0.98 } : {}}
              >
                <motion.div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 relative",
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
                </motion.div>
                <div className="text-left hidden sm:block">
                  <p className={cn(
                    "text-sm font-medium transition-colors",
                    isActive ? "text-primary" : isStepValid ? "text-emerald-600" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </p>
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
                <div className="w-8 h-0.5 mx-1 relative">
                  <div className="absolute inset-0 bg-muted-foreground/20 rounded-full" />
                  <motion.div
                    className="absolute inset-0 bg-emerald-500 rounded-full origin-left"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: currentStep > step.id ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
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
    <motion.div
      key="step1"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="space-y-5 px-6 py-4"
    >
      {/* No licensed products/services warning */}
      {!isLoadingLicensedData && products.length === 0 && services.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">No Active Licenses</p>
            <p className="text-xs text-amber-700 mt-1">
              No active licenses found for this Account and Enterprise. Please add licenses first.
            </p>
          </div>
        </motion.div>
      )}

      {/* Connector Name */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium flex items-center gap-2">
              <Plug className="w-4 h-4 text-primary" />
              Connector Name <span className="text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="Enter a unique connector name"
                className="bg-background/50"
              />
            </FormControl>
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
            <FormLabel className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              Description
            </FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Enter a description for this connector"
                className="bg-background/50 min-h-[80px] resize-none"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Workstreams Multi-Select */}
      <FormField
        control={form.control}
        name="workstream_ids"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium flex items-center gap-2">
              <Wrench className="w-4 h-4 text-violet-500" />
              Workstreams <span className="text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <WorkstreamMultiSelect
                accountId={selectedAccount?.id}
                enterpriseId={selectedEnterprise?.id}
                selectedIds={field.value}
                onSelectionChange={field.onChange}
                autoSelectDefault={false}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Product & Service */}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="product_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium flex items-center gap-2">
                <Box className="w-4 h-4 text-blue-500" />
                Product <span className="text-destructive">*</span>
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
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
              <FormLabel className="text-sm font-medium flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-emerald-500" />
                Service <span className="text-destructive">*</span>
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div
      key="step2"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="space-y-5 px-6 py-4"
    >
      {/* Connector Icon Button */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Click the icon to select a category and connector
        </p>
        <motion.button
          type="button"
          onClick={() => setShowCategorySelector(true)}
          className={cn(
            "w-24 h-24 rounded-2xl flex items-center justify-center transition-all",
            "border-2 border-dashed hover:border-primary/50 hover:bg-primary/5",
            selectedConnector 
              ? `${getConnectorColor(selectedConnector)} border-none text-white shadow-lg` 
              : "border-slate-300 bg-slate-50"
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ConnectorIcon className="w-10 h-10" />
        </motion.button>
        {selectedConnector && (
          <div className="text-center">
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {selectedCategory} / {selectedConnector}
            </Badge>
          </div>
        )}
      </div>

      {/* Category & Connector Selector Overlay */}
      <AnimatePresence>
        {showCategorySelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/95 z-10 flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold">
                {selectedCategory ? `Select Connector in ${selectedCategory}` : "Select Category"}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowCategorySelector(false);
                  if (!selectedConnector) {
                    setSelectedCategory("");
                  }
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {!selectedCategory ? (
                // Category Selection
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {availableCategories.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p>No categories available.</p>
                      <p className="text-sm mt-1">Configure tools in Global Settings first.</p>
                    </div>
                  ) : (
                    availableCategories.map((category) => {
                      const config = TOOL_CATEGORIES[category];
                      const Icon = config.icon;
                      return (
                        <motion.button
                          key={category}
                          type="button"
                          onClick={() => handleCategorySelect(category)}
                          className={cn(
                            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                            "hover:border-primary/50 hover:bg-primary/5",
                            config.bgColor, "border-transparent"
                          )}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center text-white bg-gradient-to-br",
                            config.gradient
                          )}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <span className="font-medium text-sm">{category}</span>
                        </motion.button>
                      );
                    })
                  )}
                </div>
              ) : (
                // Connector Selection
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCategory("")}
                    className="gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back to Categories
                  </Button>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {availableConnectors.length === 0 ? (
                      <div className="col-span-full text-center py-8 text-muted-foreground">
                        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>No connectors available in this category.</p>
                      </div>
                    ) : (
                      availableConnectors.map((connector) => {
                        const toolConfig = TOOL_CATEGORIES[selectedCategory]?.tools.find(
                          t => t.name === connector
                        );
                        const Icon = toolConfig?.icon || CircleDot;
                        const color = toolConfig?.color || "bg-slate-500";
                        
                        return (
                          <motion.button
                            key={connector}
                            type="button"
                            onClick={() => handleConnectorSelect(connector)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                              "hover:border-primary/50 hover:bg-primary/5",
                              selectedConnector === connector 
                                ? "border-primary bg-primary/10" 
                                : "border-slate-200 bg-white"
                            )}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <div className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md",
                              color
                            )}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <span className="font-medium text-sm">{connector}</span>
                            {selectedConnector === connector && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                              >
                                <Check className="w-3 h-3 text-white" />
                              </motion.div>
                            )}
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const renderStep3 = () => (
    <motion.div
      key="step3"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="space-y-5 px-6 py-4"
    >
      {hasConnectivityConfig ? (
        <>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <Plug className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800">Connectivity Details</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Configure the connection settings for {selectedConnector}
              </p>
            </div>
          </div>

          {/* URL Field */}
          {connectivityConfig?.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                {field.label} {field.required && <span className="text-destructive">*</span>}
              </Label>
              <Input
                type={field.type}
                placeholder={field.placeholder}
                value={connectivityUrl}
                onChange={(e) => setConnectivityUrl(e.target.value)}
                className="bg-background/50"
              />
            </div>
          ))}

          {/* Credential Name Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              Credential Name <span className="text-destructive">*</span>
            </Label>
            <Select value={selectedCredentialId} onValueChange={setSelectedCredentialId}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select a credential" />
              </SelectTrigger>
              <SelectContent>
                {filteredCredentials.length === 0 ? (
                  <div className="p-3 text-center text-muted-foreground text-sm">
                    No credentials available for selected workstreams
                  </div>
                ) : (
                  filteredCredentials.map((cred) => (
                    <SelectItem key={cred.id} value={cred.id}>
                      <div className="flex items-center gap-2">
                        <span>{cred.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {cred.connector}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Test Connectivity Button */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnectivity}
              disabled={!connectivityUrl || !selectedCredentialId || isTesting}
              className="gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Test Connection
                </>
              )}
            </Button>

            {testResult && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
                  testResult === "success" 
                    ? "bg-emerald-100 text-emerald-700" 
                    : "bg-red-100 text-red-700"
                )}
              >
                {testResult === "success" ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Connected
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Failed
                  </>
                )}
              </motion.div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
          <h3 className="text-lg font-semibold text-slate-800">Ready to Create</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            No additional configuration needed for {selectedConnector}. 
            Click "Create Connector" to finish.
          </p>
        </div>
      )}
    </motion.div>
  );

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden gap-0" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
          <VisuallyHidden>
            <DialogTitle>Add Connector</DialogTitle>
          </VisuallyHidden>

          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-blue-50/30">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg"
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <Plug className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Add Connector</h2>
              <p className="text-xs text-muted-foreground">Configure a new integration</p>
            </div>
          </div>

          {/* Step Indicator */}
          {renderStepIndicator()}

          {/* Form Content */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="relative">
              <div className="overflow-hidden min-h-[350px] relative">
                <AnimatePresence mode="wait" custom={direction}>
                  {currentStep === 1 && renderStep1()}
                  {currentStep === 2 && renderStep2()}
                  {currentStep === 3 && renderStep3()}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50/50">
                <Button
                  type="button"
                  variant="outline"
                  onClick={currentStep === 1 ? () => onOpenChange(false) : prevStep}
                  className="gap-2"
                >
                  {currentStep === 1 ? (
                    <>
                      <X className="w-4 h-4" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </>
                  )}
                </Button>

                {currentStep < STEPS.length ? (
                  <Button
                    type="button"
                    onClick={nextStep}
                    disabled={!isCurrentStepValid}
                    className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={isCreating || !stepValidation[3]}
                    className="gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create Connector
                      </>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// Add missing Key import
import { Key } from "lucide-react";
