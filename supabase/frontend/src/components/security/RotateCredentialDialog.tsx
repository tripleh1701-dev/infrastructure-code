import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCredentials, type Credential } from "@/hooks/useCredentials";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  Key,
  RefreshCw,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Clock,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Link2,
  Calendar,
  Info,
} from "lucide-react";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { format, differenceInDays } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

// Connector-specific auth field configurations
const CONNECTOR_AUTH_CONFIG: Record<string, Record<string, { label: string; type: "text" | "password"; placeholder: string }[]>> = {
  Jira: {
    username_api_key: [
      { label: "Username/Email", type: "text", placeholder: "Enter your Jira username or email" },
      { label: "API Key", type: "password", placeholder: "Enter your new API key" },
    ],
    personal_access_token: [
      { label: "Personal Access Token", type: "password", placeholder: "Enter your new PAT" },
    ],
  },
  GitHub: {
    personal_access_token: [
      { label: "Personal Access Token", type: "password", placeholder: "Enter your GitHub Personal Access Token (ghp_...)" },
    ],
    username_token: [
      { label: "Username", type: "text", placeholder: "Enter your GitHub username" },
      { label: "Personal Access Token", type: "password", placeholder: "Enter your new Personal Access Token" },
    ],
    github_app: [
      { label: "GitHub Installation ID", type: "text", placeholder: "Enter Installation ID" },
      { label: "GitHub Application ID", type: "text", placeholder: "Enter Application ID" },
      { label: "GitHub Private Key", type: "password", placeholder: "Enter new Private Key" },
    ],
  },
  GitLab: {
    personal_access_token: [
      { label: "Personal Access Token", type: "password", placeholder: "Enter your new Personal Access Token" },
    ],
  },
  "Azure Repos": {
    personal_access_token: [
      { label: "Personal Access Token", type: "password", placeholder: "Enter your new Azure DevOps PAT" },
    ],
  },
  Bitbucket: {
    app_password: [
      { label: "Username", type: "text", placeholder: "Enter your Bitbucket username" },
      { label: "App Password", type: "password", placeholder: "Enter your new App Password" },
    ],
  },
  Jenkins: {
    username_token: [
      { label: "Username", type: "text", placeholder: "Enter your Jenkins username" },
      { label: "API Token", type: "password", placeholder: "Enter your new API Token" },
    ],
  },
  ServiceNow: {
    basic_auth: [
      { label: "Username", type: "text", placeholder: "Enter your ServiceNow username" },
      { label: "Password", type: "password", placeholder: "Enter your new password" },
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
      { label: "Token URL", type: "text", placeholder: "e.g. https://<subdomain>.authentication.us10.hana.ondemand.com/oauth/token" },
    ],
    basic: [
      { label: "Username", type: "text", placeholder: "Enter your username" },
      { label: "API Key", type: "password", placeholder: "Enter your API key" },
    ],
  },
  Slack: {
    bot_token: [
      { label: "Bot Token", type: "password", placeholder: "xoxb-your-new-token" },
    ],
  },
  "Microsoft Teams": {
    webhook: [
      { label: "Webhook URL", type: "text", placeholder: "Enter your new Teams webhook URL" },
    ],
  },
};

// Default auth fields for connectors not specifically configured
const DEFAULT_AUTH_FIELDS: Record<string, { label: string; type: "text" | "password"; placeholder: string }[]> = {
  api_key: [
    { label: "API Key", type: "password", placeholder: "Enter your new API key" },
  ],
  basic_auth: [
    { label: "Username", type: "text", placeholder: "Enter username" },
    { label: "Password", type: "password", placeholder: "Enter new password" },
  ],
  oauth2: [
    { label: "Client ID", type: "text", placeholder: "Enter your Client ID" },
    { label: "Client Secret", type: "password", placeholder: "Enter your Client Secret" },
    { label: "Token URL", type: "text", placeholder: "Enter your Token URL" },
  ],
  personal_access_token: [
    { label: "Personal Access Token", type: "password", placeholder: "Enter your new PAT" },
  ],
  username_token: [
    { label: "Username", type: "text", placeholder: "Enter username" },
    { label: "Token", type: "password", placeholder: "Enter your new token" },
  ],
  bot_token: [
    { label: "Bot Token", type: "password", placeholder: "Enter your new bot token" },
  ],
};

const formSchema = z.object({
  auth_fields: z.record(z.string().min(1, "This field is required")),
  confirm_rotation: z.boolean().refine((val) => val === true, {
    message: "You must confirm the rotation",
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface RotateCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: Credential | null;
  onSuccess?: () => void;
}

// Animation variants with proper typing
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 25 },
  },
} as const;

export function RotateCredentialDialog({
  open,
  onOpenChange,
  credential,
  onSuccess,
}: RotateCredentialDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { rotateCredential, initiateOAuth } = useCredentials(selectedAccount?.id, selectedEnterprise?.id);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Get auth fields for the current credential
  const authFields = useMemo(() => {
    if (!credential) return [];
    
    const connectorConfig = CONNECTOR_AUTH_CONFIG[credential.connector];
    if (connectorConfig && connectorConfig[credential.auth_type]) {
      return connectorConfig[credential.auth_type];
    }
    
    return DEFAULT_AUTH_FIELDS[credential.auth_type] || DEFAULT_AUTH_FIELDS.api_key;
  }, [credential]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      auth_fields: {},
      confirm_rotation: false,
    },
  });

  // Get expiration urgency
  const expirationInfo = useMemo(() => {
    if (!credential?.expires_at) return null;
    const daysUntilExpiry = differenceInDays(new Date(credential.expires_at), new Date());
    if (daysUntilExpiry < 0) return { label: "Expired", variant: "destructive" as const, urgent: true };
    if (daysUntilExpiry <= 7) return { label: `${daysUntilExpiry}d left`, variant: "destructive" as const, urgent: true };
    if (daysUntilExpiry <= 30) return { label: `${daysUntilExpiry}d left`, variant: "warning" as const, urgent: false };
    return { label: `${daysUntilExpiry}d left`, variant: "secondary" as const, urgent: false };
  }, [credential?.expires_at]);

  // Reset form when credential changes
  useEffect(() => {
    if (credential && open) {
      const defaultFields: Record<string, string> = {};
      authFields.forEach((field) => {
        const key = field.label.toLowerCase().replace(/\s+/g, "_");
        defaultFields[key] = "";
      });
      form.reset({
        auth_fields: defaultFields,
        confirm_rotation: false,
      });
      setConfirmChecked(false);
      setShowPasswords({});
      setFocusedField(null);
    }
  }, [credential, open, authFields, form]);

  const handleSubmit = async (data: FormValues) => {
    if (!credential) return;

    setIsSubmitting(true);

    try {
      // Convert auth_fields to the format expected by the credentials table
      const credentialsData: Record<string, string> = {};
      Object.entries(data.auth_fields).forEach(([key, value]) => {
        credentialsData[key] = value;
      });

      await rotateCredential.mutateAsync({
        id: credential.id,
        credentials: credentialsData,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to rotate credential:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthRotation = async () => {
    if (!credential) return;

    setIsSubmitting(true);
    try {
      // OAuth redirect must go to edge function callback, which then redirects to frontend
      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connector-oauth/callback`;
      const result = await initiateOAuth(credential.id, credential.connector, redirectUri);
      
      if (result?.authorizationUrl) {
        // Open OAuth in popup window (GitHub blocks iframe loading)
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const oauthWindow = window.open(
          result.authorizationUrl,
          `oauth_rotate_${credential.connector}`,
          `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );

        if (oauthWindow) {
          const pollTimer = setInterval(async () => {
            if (oauthWindow.closed) {
              clearInterval(pollTimer);
              setIsSubmitting(false);
              await new Promise(r => setTimeout(r, 1500));
              
              // Check if the credential status was updated
              const { data: updatedCredential } = await supabase
                .from("credentials")
                .select("status, updated_at")
                .eq("id", credential.id)
                .single();
              
              if (updatedCredential?.status === "active") {
                toast.success(`Successfully re-authenticated with ${credential.connector}!`);
                onSuccess?.();
                onOpenChange(false);
              } else {
                toast.error(`OAuth re-authentication was not completed. Please try again.`);
              }
            }
          }, 500);
        } else {
          toast.error("Pop-up blocked. Please allow pop-ups for OAuth.");
          setIsSubmitting(false);
        }
      } else {
        toast.error("Failed to initiate OAuth flow");
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Failed to initiate OAuth rotation:", error);
      toast.error("Failed to start OAuth flow");
      setIsSubmitting(false);
    }
  };

  const togglePasswordVisibility = (fieldKey: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey],
    }));
  };

  if (!credential) return null;

  const displayAuthType = authTypeDisplayMap[credential.auth_type] || credential.auth_type;
  const isOAuth = credential.auth_type === "oauth";

  // Check if form is valid for submission
  const formValues = form.watch("auth_fields");
  const allFieldsFilled = authFields.every((field) => {
    const key = field.label.toLowerCase().replace(/\s+/g, "_");
    return formValues[key]?.trim().length > 0;
  });
  const canSubmit = confirmChecked && allFieldsFilled && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-gradient-to-b from-background to-muted/30">
        {/* Header with Gradient */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent" />
          <motion.div
            className="absolute -top-20 -right-20 w-40 h-40 bg-amber-400/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          
          <DialogHeader className="relative p-6 pb-4">
            <div className="flex items-center gap-3">
              <motion.div
                className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-500/25"
                whileHover={{ scale: 1.05, rotate: 180 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <RefreshCw className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <DialogTitle className="text-xl font-semibold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  Rotate Credential
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-0.5">
                  Update authentication for this connection
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Credential Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-border/80 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden"
          >
            {/* Credential Name Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-muted/50 to-muted/30 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="p-1.5 bg-muted rounded-lg"
                  >
                    <Key className="w-4 h-4 text-muted-foreground" />
                  </motion.div>
                  <span className="font-semibold text-foreground">{credential.name}</span>
                </div>
                <Badge
                  variant={credential.status === "active" ? "default" : "secondary"}
                  className={cn(
                    "text-xs font-medium",
                    credential.status === "active" && "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
                    credential.status === "pending" && "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
                    credential.status === "expired" && "bg-destructive/10 text-destructive border-destructive/20",
                    credential.status === "revoked" && "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {credential.status.charAt(0).toUpperCase() + credential.status.slice(1)}
                </Badge>
              </div>
            </div>

            {/* Credential Details */}
            <div className="p-4 space-y-3">
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5" />
                  Connector
                </span>
                <Badge variant="outline" className="bg-muted/50 font-medium">
                  {credential.connector}
                </Badge>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  Auth Type
                </span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-medium">
                  {displayAuthType}
                </Badge>
              </motion.div>

              {credential.updated_at && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 }}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Last Rotated
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {format(new Date(credential.updated_at), "MMM d, yyyy")}
                  </span>
                </motion.div>
              )}

              {credential.expires_at && expirationInfo && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Expires
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(credential.expires_at), "MMM d, yyyy")}
                    </span>
                    <motion.div
                      animate={expirationInfo.urgent ? { scale: [1, 1.05, 1] } : undefined}
                      transition={expirationInfo.urgent ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : undefined}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-medium",
                          expirationInfo.variant === "destructive" && "bg-destructive/10 text-destructive border-destructive/20",
                          expirationInfo.variant === "warning" && "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
                          expirationInfo.variant === "secondary" && "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {expirationInfo.label}
                      </Badge>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            {isOAuth ? (
              // OAuth rotation flow
              <motion.div
                key="oauth"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 shadow-sm"
                >
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  </motion.div>
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">OAuth Re-authentication Required</p>
                    <p className="mt-1.5 text-muted-foreground leading-relaxed">
                      To rotate OAuth credentials, you'll need to re-authenticate with{" "}
                      <span className="font-medium text-foreground">{credential.connector}</span>. 
                      This will revoke the current access and establish a new connection.
                    </p>
                  </div>
                </motion.div>

                <DialogFooter className="pt-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                    className="hover:bg-muted transition-colors"
                  >
                    Cancel
                  </Button>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      onClick={handleOAuthRotation}
                      disabled={isSubmitting}
                      className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/25 text-white"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Redirecting...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Re-authenticate
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </DialogFooter>
              </motion.div>
            ) : (
              // Standard credential rotation form
              <motion.div
                key="standard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
                    {/* Warning Banner */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/60 dark:border-amber-800/40 shadow-sm"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      </motion.div>
                      <div className="text-sm">
                        <p className="font-semibold text-amber-800 dark:text-amber-200">Important</p>
                        <p className="mt-1 text-amber-700 dark:text-amber-300 leading-relaxed">
                          Make sure you have generated new credentials from{" "}
                          <span className="font-medium">{credential.connector}</span> before proceeding.
                          The old credentials will be permanently replaced.
                        </p>
                      </div>
                    </motion.div>

                    {/* Dynamic Auth Fields */}
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="space-y-4"
                    >
                      <motion.div variants={itemVariants} className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        <h4 className="text-sm font-semibold text-foreground">New Credentials</h4>
                      </motion.div>
                      
                      {authFields.map((field, index) => {
                        const fieldKey = field.label.toLowerCase().replace(/\s+/g, "_");
                        const isPassword = field.type === "password";
                        const showPassword = showPasswords[fieldKey];
                        const isFocused = focusedField === fieldKey;

                        return (
                          <motion.div
                            key={fieldKey}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + index * 0.08 }}
                          >
                            <FormField
                              control={form.control}
                              name={`auth_fields.${fieldKey}`}
                              render={({ field: formField }) => (
                                <FormItem>
                                  <FormLabel className="text-foreground font-medium flex items-center gap-1">
                                    {field.label}
                                    <span className="text-destructive">*</span>
                                  </FormLabel>
                                  <FormControl>
                                    <motion.div
                                      className="relative"
                                      animate={{
                                        scale: isFocused ? 1.01 : 1,
                                      }}
                                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    >
                                      <Input
                                        {...formField}
                                        type={isPassword && !showPassword ? "password" : "text"}
                                        placeholder={field.placeholder}
                                        className={cn(
                                          "bg-background pr-10 transition-all duration-200",
                                          "border-input hover:border-muted-foreground/50",
                                          isFocused && "ring-2 ring-amber-500/20 border-amber-400"
                                        )}
                                        onFocus={() => setFocusedField(fieldKey)}
                                        onBlur={() => setFocusedField(null)}
                                      />
                                      {isPassword && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent text-muted-foreground hover:text-foreground"
                                                onClick={() => togglePasswordVisibility(fieldKey)}
                                              >
                                                <motion.div
                                                  initial={false}
                                                  animate={{ scale: [1, 0.8, 1] }}
                                                  transition={{ duration: 0.2 }}
                                                  key={showPassword ? "show" : "hide"}
                                                >
                                                  {showPassword ? (
                                                    <EyeOff className="w-4 h-4" />
                                                  ) : (
                                                    <Eye className="w-4 h-4" />
                                                  )}
                                                </motion.div>
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              {showPassword ? "Hide" : "Show"}
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </motion.div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </motion.div>
                        );
                      })}
                    </motion.div>

                    {/* Confirmation Checkbox */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-xl border transition-all duration-200",
                        confirmChecked
                          ? "bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                          : "bg-muted/50 border-border hover:border-muted-foreground/30"
                      )}
                    >
                      <motion.div
                        whileTap={{ scale: 0.9 }}
                        className="mt-0.5"
                      >
                        <input
                          type="checkbox"
                          id="confirm-rotation"
                          checked={confirmChecked}
                          onChange={(e) => {
                            setConfirmChecked(e.target.checked);
                            form.setValue("confirm_rotation", e.target.checked);
                          }}
                          className={cn(
                            "h-5 w-5 rounded border-2 cursor-pointer transition-colors",
                            confirmChecked
                              ? "border-emerald-500 text-emerald-600 bg-emerald-500 accent-emerald-500"
                              : "border-input text-amber-600 accent-amber-600"
                          )}
                        />
                      </motion.div>
                      <label htmlFor="confirm-rotation" className="text-sm text-muted-foreground cursor-pointer select-none">
                        <span className="font-semibold text-foreground">I confirm</span> that I have generated new credentials and understand
                        that the existing credentials will be permanently replaced.
                      </label>
                      {confirmChecked && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 500 }}
                        >
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        </motion.div>
                      )}
                    </motion.div>

                    <DialogFooter className="pt-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                        className="hover:bg-muted transition-colors"
                      >
                        Cancel
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <motion.div
                              whileHover={canSubmit ? { scale: 1.02 } : undefined}
                              whileTap={canSubmit ? { scale: 0.98 } : undefined}
                            >
                              <Button
                                type="submit"
                                disabled={!canSubmit}
                                className={cn(
                                  "gap-2 transition-all duration-300",
                                  canSubmit
                                    ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/25 text-white"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Rotating...
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-4 h-4" />
                                    Rotate Credentials
                                  </>
                                )}
                              </Button>
                            </motion.div>
                          </TooltipTrigger>
                          {!canSubmit && (
                            <TooltipContent>
                              {!allFieldsFilled
                                ? "Fill in all credential fields"
                                : "Confirm the rotation to proceed"}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </DialogFooter>
                  </form>
                </Form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
