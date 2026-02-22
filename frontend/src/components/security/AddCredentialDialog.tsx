import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCredentials, useCheckCredentialNameExists } from "@/hooks/useCredentials";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Key,
  X,
  Save,
  ChevronRight,
  ChevronLeft,
  Check,
  Link2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
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
  Lock,
  Settings2,
  Sparkles,
  Box,
  Wrench,
} from "lucide-react";
import { useWorkstreams, type WorkstreamTool } from "@/hooks/useWorkstreams";
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

// Authentication types for different connectors
const CONNECTOR_AUTH_CONFIG: Record<string, {
  authTypes: { value: string; label: string }[];
  fields: Record<string, { label: string; type: "text" | "password" | "button"; placeholder?: string }[]>;
  requiresServiceKeyType?: boolean;
  serviceKeyTypes?: { value: string; label: string }[];
}> = {
  Jira: {
    authTypes: [
      { value: "username_api_key", label: "Username and API Key" },
      { value: "personal_access_token", label: "Personal Access Token" },
    ],
    fields: {
      username_api_key: [
        { label: "Username", type: "text", placeholder: "Enter your JIRA username" },
        { label: "API Key", type: "password", placeholder: "Enter your JIRA API key" },
      ],
      personal_access_token: [
        { label: "Personal Access Token", type: "password", placeholder: "Enter your Personal Access Token" },
      ],
    },
  },
  GitHub: {
    authTypes: [
      { value: "username_token", label: "Username and Token" },
      { value: "github_app", label: "GitHub App" },
      { value: "oauth", label: "OAuth" },
    ],
    fields: {
      username_token: [
        { label: "Username", type: "text", placeholder: "Enter your GitHub username" },
        { label: "Personal Access Token", type: "password", placeholder: "Enter your Personal Access Token" },
      ],
      github_app: [
        { label: "GitHub Installation ID", type: "text", placeholder: "Enter Installation ID" },
        { label: "GitHub Application ID", type: "text", placeholder: "Enter Application ID" },
        { label: "GitHub Private Key", type: "password", placeholder: "Enter Private Key" },
      ],
      oauth: [],
    },
  },
  GitLab: {
    authTypes: [
      { value: "personal_access_token", label: "Personal Access Token" },
      { value: "oauth", label: "OAuth" },
    ],
    fields: {
      personal_access_token: [
        { label: "Personal Access Token", type: "password", placeholder: "Enter your Personal Access Token" },
      ],
      oauth: [],
    },
  },
  "Azure Repos": {
    authTypes: [
      { value: "personal_access_token", label: "Personal Access Token" },
    ],
    fields: {
      personal_access_token: [
        { label: "Personal Access Token", type: "password", placeholder: "Enter your Azure DevOps PAT" },
      ],
    },
  },
  Bitbucket: {
    authTypes: [
      { value: "app_password", label: "App Password" },
      { value: "oauth", label: "OAuth" },
    ],
    fields: {
      app_password: [
        { label: "Username", type: "text", placeholder: "Enter your Bitbucket username" },
        { label: "App Password", type: "password", placeholder: "Enter your App Password" },
      ],
      oauth: [],
    },
  },
  Jenkins: {
    authTypes: [
      { value: "username_token", label: "Username and API Token" },
    ],
    fields: {
      username_token: [
        { label: "Username", type: "text", placeholder: "Enter your Jenkins username" },
        { label: "API Token", type: "password", placeholder: "Enter your API Token" },
      ],
    },
  },
  ServiceNow: {
    authTypes: [
      { value: "basic_auth", label: "Basic Authentication" },
      { value: "oauth2", label: "OAuth 2.0" },
    ],
    fields: {
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
  },
  Slack: {
    authTypes: [
      { value: "bot_token", label: "Bot Token" },
      { value: "oauth", label: "OAuth" },
    ],
    fields: {
      bot_token: [
        { label: "Bot Token", type: "password", placeholder: "xoxb-your-token" },
      ],
      oauth: [],
    },
  },
  "Microsoft Teams": {
    authTypes: [
      { value: "webhook", label: "Incoming Webhook" },
    ],
    fields: {
      webhook: [
        { label: "Webhook URL", type: "text", placeholder: "Enter your Teams webhook URL" },
      ],
    },
  },
  "Cloud Foundry": {
    authTypes: [
      { value: "oauth2", label: "OAuth2" },
    ],
    fields: {
      oauth2: [
        { label: "Client ID", type: "text", placeholder: "Enter your Client ID" },
        { label: "Client Secret", type: "password", placeholder: "Enter your Client Secret" },
        { label: "Token URL", type: "text", placeholder: "Enter the Token URL" },
      ],
    },
    // Special config for Cloud Foundry - requires service key type selection
    requiresServiceKeyType: true,
    serviceKeyTypes: [
      { value: "api", label: "API" },
      { value: "iflow", label: "IFlow" },
    ],
  },
};

// Default auth config for connectors not specifically configured
const DEFAULT_AUTH_CONFIG: {
  authTypes: { value: string; label: string }[];
  fields: Record<string, { label: string; type: "text" | "password" | "button"; placeholder?: string }[]>;
  requiresServiceKeyType?: boolean;
  serviceKeyTypes?: { value: string; label: string }[];
} = {
  authTypes: [
    { value: "api_key", label: "API Key" },
    { value: "basic_auth", label: "Basic Authentication" },
  ],
  fields: {
    api_key: [
      { label: "API Key", type: "password" as const, placeholder: "Enter your API key" },
    ],
    basic_auth: [
      { label: "Username", type: "text" as const, placeholder: "Enter username" },
      { label: "Password", type: "password" as const, placeholder: "Enter password" },
    ],
  },
  requiresServiceKeyType: false,
  serviceKeyTypes: undefined,
};

const formSchema = z.object({
  name: z.string().min(1, "Credential name is required").max(100),
  description: z.string().max(500).optional(),
  workstream_ids: z.array(z.string()).min(1, "At least one workstream is required"),
  product_id: z.string().min(1, "Product is required"),
  service_id: z.string().min(1, "Service is required"),
  category: z.string().optional(),
  connector: z.string().optional(),
  auth_type: z.string().optional(),
  auth_fields: z.record(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: FormValues) => void;
}

const STEPS = [
  { id: 1, title: "Details", icon: FileText, description: "Basic info" },
  { id: 2, title: "Connector", icon: Link2, description: "Tool & auth" },
];

export function AddCredentialDialog({
  open,
  onOpenChange,
  onSave,
}: AddCredentialDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { workstreams } = useWorkstreams(selectedAccount?.id, selectedEnterprise?.id);
  const { createCredential, initiateOAuth } = useCredentials(selectedAccount?.id, selectedEnterprise?.id);

  // Track credential name for duplicate checking
  const [credentialName, setCredentialName] = useState("");
  
  // Check for duplicate credential name within the same account + enterprise combination
  const { isDuplicate: isNameDuplicate, isChecking: isCheckingName } = useCheckCredentialNameExists(
    credentialName,
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  // Fetch licensed products and services for the selected account/enterprise
  const { data: licensedData = { products: [], services: [] }, isLoading: isLoadingLicensedData } = useQuery({
    queryKey: ["licensed-products-services-credentials", selectedAccount?.id, selectedEnterprise?.id],
    queryFn: async () => {
      if (!selectedAccount?.id || !selectedEnterprise?.id) {
        return { products: [], services: [] };
      }

      if (isExternalApi()) {
        // External: NestJS handles license-scoped product/service filtering
        const { data, error } = await httpClient.get<{
          products: { id: string; name: string }[];
          services: { id: string; name: string }[];
        }>("/api/licenses/licensed-entities", {
          params: {
            accountId: selectedAccount.id,
            enterpriseId: selectedEnterprise.id,
          },
        });

        if (error) throw new Error(error.message);
        return data || { products: [], services: [] };
      }

      // Supabase: fetch licenses and resolve products/services
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

      const [productsRes, servicesRes] = await Promise.all([
        supabase.from("products").select("id, name").in("id", productIds).order("name"),
        supabase.from("services").select("id, name").in("id", serviceIds).order("name"),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      return {
        products: (productsRes.data || []) as { id: string; name: string }[],
        services: (servicesRes.data || []) as { id: string; name: string }[],
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
  const [isLinkingOAuth, setIsLinkingOAuth] = useState(false);
  const [oauthLinked, setOauthLinked] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [authFieldValues, setAuthFieldValues] = useState<Record<string, string>>({});
  const [pendingCredentialId, setPendingCredentialId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [serviceKeyType, setServiceKeyType] = useState<string>("");

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
      auth_type: "",
      auth_fields: {},
    },
  });

  const selectedWorkstreamIds = form.watch("workstream_ids");
  const selectedAuthType = form.watch("auth_type");

  // Get available categories based on selected workstreams' tools (union of all)
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

  // Get available connectors based on selected category (union from all selected workstreams)
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

  // Get auth config for selected connector
  const authConfig = useMemo(() => {
    if (!selectedConnector) return null;
    return CONNECTOR_AUTH_CONFIG[selectedConnector] || DEFAULT_AUTH_CONFIG;
  }, [selectedConnector]);

  // Reset states when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setDirection(1);
      setShowCategorySelector(false);
      setSelectedCategory("");
      setSelectedConnector("");
      setIsLinkingOAuth(false);
      setOauthLinked(false);
      setVisiblePasswords({});
      setAuthFieldValues({});
      setPendingCredentialId(null);
      setIsCreating(false);
      setCredentialName("");
      setServiceKeyType("");
      form.reset();
    }
  }, [open, form]);

  // Update form when category/connector changes
  useEffect(() => {
    form.setValue("category", selectedCategory);
  }, [selectedCategory, form]);

  useEffect(() => {
    form.setValue("connector", selectedConnector);
    form.setValue("auth_type", "");
    setAuthFieldValues({});
    setServiceKeyType("");
  }, [selectedConnector, form]);

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedConnector("");
    form.setValue("auth_type", "");
  };

  const handleConnectorSelect = (connector: string) => {
    setSelectedConnector(connector);
    setShowCategorySelector(false);
  };

  const handleOAuthLink = useCallback(async () => {
    if (!selectedAccount?.id || !selectedEnterprise?.id) {
      toast.error("Please select an account and enterprise first");
      return;
    }

    const formData = form.getValues();
    if (!formData.name || !formData.workstream_ids || formData.workstream_ids.length === 0) {
      toast.error("Please fill in required fields first");
      return;
    }

    setIsLinkingOAuth(true);

    try {
      const credential = await createCredential.mutateAsync({
        name: formData.name,
        description: formData.description,
        account_id: selectedAccount.id,
        enterprise_id: selectedEnterprise.id,
        workstream_ids: formData.workstream_ids,
        product_id: formData.product_id || undefined,
        service_id: formData.service_id || undefined,
        category: selectedCategory,
        connector: selectedConnector,
        auth_type: "oauth",
      });

      setPendingCredentialId(credential.id);

      // OAuth redirect must go to edge function callback, which then redirects to frontend
      const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connector-oauth/callback`;
      
      const oauthResult = await initiateOAuth(
        credential.id,
        selectedConnector,
        callbackUrl
      );

      if (oauthResult?.authorizationUrl) {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const oauthWindow = window.open(
          oauthResult.authorizationUrl,
          `oauth_${selectedConnector}`,
          `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );

        if (oauthWindow) {
          const pollTimer = setInterval(async () => {
            if (oauthWindow.closed) {
              clearInterval(pollTimer);
              setIsLinkingOAuth(false);
              await new Promise(r => setTimeout(r, 1500));
              
              // Check if the credential status was actually updated to active
              let credentialStatus: string | null = null;
              if (isExternalApi()) {
                const { data } = await httpClient.get<{ status: string }>(`/credentials/${credential.id}/status`);
                credentialStatus = data?.status || null;
              } else {
                const { data: updatedCredential } = await supabase
                  .from("credentials")
                  .select("status")
                  .eq("id", credential.id)
                  .single();
                credentialStatus = updatedCredential?.status || null;
              }
              
              if (credentialStatus === "active") {
                setOauthLinked(true);
                toast.success(`Successfully linked to ${selectedConnector}!`);
              } else {
                toast.error(`OAuth flow was not completed. Please try again.`);
                // Delete the pending credential via the hook's service
                if (isExternalApi()) {
                  await httpClient.delete(`/credentials/${credential.id}`);
                } else {
                  await supabase.from("credentials").delete().eq("id", credential.id);
                }
                setPendingCredentialId(null);
              }
            }
          }, 500);
        } else {
          toast.error("Pop-up blocked. Please allow pop-ups for OAuth.");
          setIsLinkingOAuth(false);
        }
      } else {
        toast.error("Failed to initiate OAuth flow");
        setIsLinkingOAuth(false);
      }
    } catch (error) {
      console.error("OAuth error:", error);
      toast.error("Failed to start OAuth flow");
      setIsLinkingOAuth(false);
    }
  }, [selectedAccount, selectedEnterprise, form, selectedCategory, selectedConnector, createCredential, initiateOAuth]);

  const togglePasswordVisibility = (fieldLabel: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [fieldLabel]: !prev[fieldLabel],
    }));
  };

  const handleAuthFieldChange = (fieldLabel: string, value: string) => {
    setAuthFieldValues(prev => ({
      ...prev,
      [fieldLabel]: value,
    }));
  };

  const handleSubmit = async (data: FormValues) => {
    if (!selectedAccount?.id || !selectedEnterprise?.id) {
      toast.error("Please select an account and enterprise first");
      return;
    }

    if (selectedAuthType === "oauth" && pendingCredentialId) {
      onSave?.({
        ...data,
        category: selectedCategory,
        connector: selectedConnector,
        auth_fields: {},
      });
      toast.success("Credential created successfully!");
      onOpenChange(false);
      return;
    }

    setIsCreating(true);

    try {
      await createCredential.mutateAsync({
        name: data.name,
        description: data.description,
        account_id: selectedAccount.id,
        enterprise_id: selectedEnterprise.id,
        workstream_ids: data.workstream_ids,
        product_id: data.product_id || undefined,
        service_id: data.service_id || undefined,
        category: selectedCategory,
        connector: selectedConnector,
        auth_type: selectedAuthType || "api_key",
        credentials: serviceKeyType 
          ? { ...authFieldValues, service_key_type: serviceKeyType }
          : authFieldValues,
      });

      onSave?.({
        ...data,
        category: selectedCategory,
        connector: selectedConnector,
        auth_fields: authFieldValues,
      });
      
      toast.success("Credential created successfully!");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create credential:", error);
    } finally {
      setIsCreating(false);
    }
  };

  // Step validation - include all required fields for step 1 and name uniqueness
  const watchedName = form.watch("name");
  const watchedWorkstreamIds = form.watch("workstream_ids");
  const watchedProductId = form.watch("product_id");
  const watchedServiceId = form.watch("service_id");
  
  // Check if Cloud Foundry requires service key type
  const requiresServiceKeyType = authConfig?.requiresServiceKeyType || false;
  
  const stepValidation = useMemo(() => {
    // For step 2, check if all required auth fields are filled
    const authFieldsValid = () => {
      if (!selectedConnector || !selectedAuthType) return false;
      if (selectedAuthType === "oauth") return oauthLinked;
      
      // For Cloud Foundry OAuth2, require service key type + all 3 fields
      if (requiresServiceKeyType && !serviceKeyType) return false;
      
      const requiredFields = authConfig?.fields[selectedAuthType] || [];
      if (requiredFields.length === 0) return false;
      
      return requiredFields.every(field => authFieldValues[field.label]?.trim());
    };
    
    return {
      1: Boolean(
        watchedName?.trim() && 
        watchedWorkstreamIds && 
        watchedWorkstreamIds.length > 0 &&
        watchedProductId && 
        watchedServiceId &&
        !isNameDuplicate // Prevent moving forward if name is duplicate
      ),
      2: authFieldsValid(),
    };
  }, [watchedName, watchedWorkstreamIds, watchedProductId, watchedServiceId, isNameDuplicate, selectedConnector, selectedAuthType, oauthLinked, authFieldValues, requiresServiceKeyType, serviceKeyType, authConfig]);

  const isCurrentStepValid = stepValidation[currentStep as keyof typeof stepValidation];

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const nextStep = () => {
    if (currentStep < 2 && isCurrentStepValid) {
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

  const ConnectorIcon = selectedConnector ? getConnectorIcon(selectedConnector) : Link2;

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
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-primary/10 to-violet-500/5 p-6 border border-primary/10"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <motion.div 
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Key className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Credential Details</h3>
            <p className="text-sm text-muted-foreground">Define the basic information for this credential</p>
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

        {/* Products & Services */}
        <div className="grid grid-cols-2 gap-4">
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
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
          >
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-amber-600 dark:text-amber-400">
              No active licenses found for the selected account and enterprise
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Context Badge */}
      <motion.div
        className="flex items-center gap-2 p-4 rounded-xl bg-muted/30 border"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          This credential will be scoped to:
        </span>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
          {selectedAccount?.name || "Account"} / {selectedEnterprise?.name || "Enterprise"}
        </Badge>
      </motion.div>
    </div>
  );

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
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg shadow-violet-500/30"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Settings2 className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Connector & Authentication</h3>
            <p className="text-sm text-muted-foreground">Select the tool and configure credentials</p>
          </div>
        </div>
      </motion.div>

      {/* Connector Selection Button */}
      <motion.div
        className="space-y-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Label className="flex items-center gap-1.5">
          Connector <span className="text-destructive">*</span>
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                onClick={() => setShowCategorySelector(true)}
                className={cn(
                  "w-full flex items-center gap-4 p-5 rounded-2xl border-2 transition-all duration-300",
                  "hover:shadow-lg hover:border-primary/50",
                  selectedConnector 
                    ? "border-primary bg-primary/5" 
                    : "border-dashed border-muted-foreground/30 bg-muted/20"
                )}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <motion.div 
                  className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-md",
                    selectedConnector ? getConnectorColor(selectedConnector) : "bg-muted-foreground/50"
                  )}
                  animate={selectedConnector ? { rotate: [0, 5, -5, 0] } : {}}
                  transition={{ duration: 0.5 }}
                >
                  <ConnectorIcon className="w-7 h-7" />
                </motion.div>
                <div className="flex-1 text-left">
                  {selectedConnector ? (
                    <>
                      <p className="font-semibold text-foreground">{selectedConnector}</p>
                      <p className="text-sm text-muted-foreground">
                        Category: {selectedCategory}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-muted-foreground">Click to select connector</p>
                      <p className="text-sm text-muted-foreground/70">Choose category and tool</p>
                    </>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Click to configure connector</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </motion.div>

      {/* Category & Connector Selector */}
      <AnimatePresence>
        {showCategorySelector && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="border-2 border-primary/20 rounded-2xl bg-background p-5 space-y-5 shadow-lg"
          >
            {/* Category Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Select Category
              </Label>
              {availableCategories.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">
                    No tools configured for this workstream. Configure tools in Global Settings.
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map(cat => {
                    const config = TOOL_CATEGORIES[cat];
                    const Icon = config.icon;
                    const isSelected = selectedCategory === cat;
                    return (
                      <motion.button
                        key={cat}
                        type="button"
                        onClick={() => handleCategorySelect(cat)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-md"
                            : "border-muted hover:border-primary/40 hover:bg-muted/50"
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white shadow-sm",
                          config.gradient
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={cn(
                          "font-medium text-sm",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {cat}
                        </span>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                          >
                            <Check className="w-4 h-4 text-primary" />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Connector Selection */}
            {selectedCategory && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 pt-4 border-t"
              >
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-violet-500" />
                  Select Connector
                </Label>
                <div className="flex flex-wrap gap-2">
                  {availableConnectors.map(conn => {
                    const Icon = getConnectorIcon(conn);
                    const color = getConnectorColor(conn);
                    const isSelected = selectedConnector === conn;
                    return (
                      <motion.button
                        key={conn}
                        type="button"
                        onClick={() => handleConnectorSelect(conn)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-md"
                            : "border-muted hover:border-primary/40 hover:bg-muted/50"
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm",
                          color
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={cn(
                          "font-medium text-sm",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {conn}
                        </span>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                          >
                            <Check className="w-4 h-4 text-primary" />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            <div className="flex justify-end pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCategorySelector(false)}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Done
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Authentication Details Section */}
      {selectedConnector && authConfig && !showCategorySelector && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5 pt-5 border-t"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white">
              <Lock className="w-4 h-4" />
            </div>
            <Label className="text-base font-semibold">Authentication Details</Label>
          </div>

          {/* Service Key Details for Cloud Foundry */}
          {authConfig.requiresServiceKeyType && authConfig.serviceKeyTypes && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <Label className="flex items-center gap-1.5">
                Service Key Details <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={serviceKeyType}
                onValueChange={setServiceKeyType}
                className="flex gap-4"
              >
                {authConfig.serviceKeyTypes.map((type) => (
                  <div key={type.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={type.value} id={`service-key-${type.value}`} />
                    <Label 
                      htmlFor={`service-key-${type.value}`}
                      className="cursor-pointer font-normal"
                    >
                      {type.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </motion.div>
          )}

          {/* Authentication Type - Show only after service key type is selected for Cloud Foundry, or always for other connectors */}
          {(!authConfig.requiresServiceKeyType || serviceKeyType) && (
            <FormField
              control={form.control}
              name="auth_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    Authentication Type <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select authentication type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent position="popper">
                      {authConfig.authTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Dynamic Auth Fields */}
          {selectedAuthType && selectedAuthType !== "oauth" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {authConfig.fields[selectedAuthType]?.map((field, idx) => (
                <div key={idx} className="space-y-2">
                  <Label>{field.label}</Label>
                  <div className="relative">
                    <Input
                      type={field.type === "password" && !visiblePasswords[field.label] ? "password" : "text"}
                      placeholder={field.placeholder}
                      value={authFieldValues[field.label] || ""}
                      onChange={(e) => handleAuthFieldChange(field.label, e.target.value)}
                      className="bg-background pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                    {field.type === "password" && (
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(field.label)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {visiblePasswords[field.label] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* OAuth Button */}
          {selectedAuthType === "oauth" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {oauthLinked ? (
                <div className="flex items-center gap-4 p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                  <motion.div 
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-md"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <Check className="w-6 h-6" />
                  </motion.div>
                  <div>
                    <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                      Successfully linked to {selectedConnector}
                    </p>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                      OAuth connection established
                    </p>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOAuthLink}
                  disabled={isLinkingOAuth}
                  className="w-full h-14 gap-3 border-2 hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  {isLinkingOAuth ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Connecting to {selectedConnector}...
                    </>
                  ) : (
                    <>
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-white",
                        getConnectorColor(selectedConnector)
                      )}>
                        <ConnectorIcon className="w-5 h-5" />
                      </div>
                      Link to {selectedConnector}
                      <ExternalLink className="w-4 h-4 ml-auto" />
                    </>
                  )}
                </Button>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-2xl max-h-[90vh] p-0 overflow-hidden gap-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
        <VisuallyHidden>
          <DialogTitle>Add Credential</DialogTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-muted/30 via-background to-primary/5">
          <div className="flex items-center gap-3">
            <motion.div 
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg"
              whileHover={{ scale: 1.05 }}
            >
              <Key className="w-5 h-5" />
            </motion.div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Add Credential</h2>
              <p className="text-sm text-muted-foreground">Configure secure access to external tools</p>
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
                    className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!stepValidation[2] || isCreating}
                    className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create Credential
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