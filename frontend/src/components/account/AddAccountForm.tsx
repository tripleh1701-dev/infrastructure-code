import { useState, useMemo, useEffect, useCallback } from "react";
import { AddressFields } from "@/components/account/AddressFields";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Building2,
  Cloud,
  MapPin,
  User,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  FileKey2,
  Save,
  Loader2,
  Package,
  Wrench,
  Users,
  Calendar,
  Bell,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import {
  accountFormSchema,
  AccountFormData,
  getPasswordRequirementStatus,
} from "@/lib/validations/account";
import { supabase } from "@/integrations/supabase/client";
import { useGroups } from "@/hooks/useGroups";
import { useEnterprises } from "@/hooks/useEnterprises";
import { useLicenses, LicenseFormData } from "@/hooks/useLicenses";
import { toast } from "sonner";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useProvisioningStatus } from "@/hooks/useProvisioningStatus";
interface AddAccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const cloudTypes = [
  { value: "public", label: "Public Cloud", icon: "☁️" },
  { value: "private", label: "Private Cloud", icon: "🔒" },
  { value: "hybrid", label: "Hybrid Cloud", icon: "🔄" },
] as const;

const passwordRequirements = [
  { key: "length", label: "At least 12 characters" },
  { key: "uppercase", label: "One uppercase letter" },
  { key: "lowercase", label: "One lowercase letter" },
  { key: "number", label: "One number" },
  { key: "special", label: "One special character (!@#$%^&*)" },
] as const;

// License row interface for local state
interface PendingLicense {
  id: string;
  enterprise_name: string; // Store enterprise name instead of ID for grouping
  enterprise_id: string;
  product_id: string;
  service_id: string;
  start_date: string;
  end_date: string;
  number_of_users: number;
  contact_full_name: string;
  contact_email: string;
  contact_phone: string;
  contact_department: string;
  contact_designation: string;
  renewal_notify: boolean;
  notice_days: number;
}

const emptyLicense: PendingLicense = {
  id: crypto.randomUUID(),
  enterprise_name: "",
  enterprise_id: "",
  product_id: "",
  service_id: "",
  start_date: "",
  end_date: "",
  number_of_users: 1,
  contact_full_name: "",
  contact_email: "",
  contact_phone: "",
  contact_department: "",
  contact_designation: "",
  renewal_notify: true,
  notice_days: 30,
};

const STEPS = [
  { id: 1, title: "Account", icon: Building2, description: "Basic info" },
  { id: 2, title: "Address", icon: MapPin, description: "Location" },
  { id: 3, title: "Technical User", icon: User, description: "Contact" },
  { id: 4, title: "Licenses", icon: FileKey2, description: "Add licenses" },
];

export function AddAccountForm({ open, onOpenChange, onSuccess }: AddAccountFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [existingAccountNames, setExistingAccountNames] = useState<string[]>([]);
  const [accountNameError, setAccountNameError] = useState("");
  const [pendingLicenses, setPendingLicenses] = useState<PendingLicense[]>([{ ...emptyLicense, id: crypto.randomUUID() }]);
  const [isSaving, setIsSaving] = useState(false);
  const { createAccount } = useAccounts();
  const { createLicense } = useLicenses();
  const { startProvisioning } = useProvisioningStatus();
  
  // Get current context for filtering
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  
  // Fetch groups filtered by current account/enterprise context
  const { data: groups = [] } = useGroups(selectedAccount?.id, selectedEnterprise?.id);
  const { enterprises } = useEnterprises();

  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      supabase
        .from("accounts")
        .select("name")
        .then(({ data }) => {
          setExistingAccountNames((data || []).map((a) => a.name.toLowerCase()));
        });
    }
  }, [open]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      accountName: "",
      masterAccountName: "",
      cloudType: undefined,
      addresses: [{ id: crypto.randomUUID(), line1: "", line2: "", city: "", state: "", country: "", postalCode: "" }],
      technicalUser: {
        firstName: "",
        middleName: "",
        lastName: "",
        email: "",
        status: "active",
        startDate: "",
        endDate: "",
        password: "",
        assignedGroup: "",
        assignedRole: "",
      },
    },
  });

  const addresses = watch("addresses");
  const accountName = watch("accountName");
  const password = watch("technicalUser.password") || "";
  const passwordStatus = useMemo(() => getPasswordRequirementStatus(password), [password]);
  
  // Track selected group to derive available roles
  const selectedGroupName = watch("technicalUser.assignedGroup");
  const selectedGroup = useMemo(() => 
    groups.find(g => g.name === selectedGroupName), 
    [groups, selectedGroupName]
  );
  
  // Get available roles from the selected group
  const availableRoles = useMemo(() => 
    selectedGroup?.roles || [], 
    [selectedGroup]
  );
  
  // Clear role when group changes (if current role is not in the new group's roles)
  const selectedRoleName = watch("technicalUser.assignedRole");
  useEffect(() => {
    if (selectedRoleName && availableRoles.length > 0) {
      const roleExists = availableRoles.some(r => r.roleName === selectedRoleName);
      if (!roleExists) {
        setValue("technicalUser.assignedRole", "");
      }
    } else if (!selectedGroupName) {
      // Clear role if no group is selected
      setValue("technicalUser.assignedRole", "");
    }
  }, [selectedGroupName, availableRoles, selectedRoleName, setValue]);

  const validateAccountName = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    if (trimmed.length > 100) return "Account name must be less than 100 characters";
    if (existingAccountNames.includes(trimmed.toLowerCase())) return "This account name already exists";
    return "";
  };

  useEffect(() => {
    if (accountName) {
      setAccountNameError(validateAccountName(accountName));
    } else {
      setAccountNameError("");
    }
  }, [accountName, existingAccountNames]);

  const addAddress = () => {
    const newAddress = { id: crypto.randomUUID(), line1: "", line2: "", city: "", state: "", country: "", postalCode: "" };
    setValue("addresses", [...addresses, newAddress]);
  };

  const removeAddress = (index: number) => {
    if (addresses.length > 1) {
      setValue("addresses", addresses.filter((_, i) => i !== index));
    }
  };

  const validateStep = async (step: number): Promise<boolean> => {
    switch (step) {
      case 1:
        const step1Valid = await trigger(["accountName", "masterAccountName", "cloudType"]);
        return step1Valid && !accountNameError;
      case 2:
        return await trigger("addresses");
      case 3:
        return await trigger("technicalUser");
      case 4:
        return true; // License step has no required validation
      default:
        return true;
    }
  };

  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (!isValid) return;

    if (currentStep === 3) {
      const formData = watch();
      const duplicateError = validateAccountName(formData.accountName);
      if (duplicateError) {
        setAccountNameError(duplicateError);
        return;
      }
    }

    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Create account + licenses together when finishing
  const handleFinish = async () => {
    // Validate at least one complete license
    const validLicenses = pendingLicenses.filter(isLicenseComplete);
    if (validLicenses.length === 0) {
      toast.error("Please add at least one complete license before saving.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = watch();
      
      // Create the account first
      const result = await createAccount.mutateAsync({
        name: formData.accountName,
        master_account_name: formData.masterAccountName,
        cloud_type: formData.cloudType,
        addresses: formData.addresses.map((addr) => ({
          line1: addr.line1,
          line2: addr.line2 || undefined,
          city: addr.city,
          state: addr.state,
          country: addr.country,
          postal_code: addr.postalCode,
        })),
        technical_user: {
          first_name: formData.technicalUser.firstName,
          middle_name: formData.technicalUser.middleName || undefined,
          last_name: formData.technicalUser.lastName,
          email: formData.technicalUser.email,
          status: formData.technicalUser.status,
          start_date: formData.technicalUser.startDate,
          end_date: formData.technicalUser.endDate || undefined,
          assigned_group: formData.technicalUser.assignedGroup,
          assigned_role: formData.technicalUser.assignedRole,
        },
      });

      if (!result?.id) {
        throw new Error("Failed to create account");
      }

      // Create all licenses for the new account
      for (const license of validLicenses) {
        await createLicense.mutateAsync({
          account_id: result.id,
          enterprise_id: license.enterprise_id,
          product_id: license.product_id,
          service_id: license.service_id,
          start_date: license.start_date,
          end_date: license.end_date,
          number_of_users: license.number_of_users,
          contact_full_name: license.contact_full_name,
          contact_email: license.contact_email,
          contact_phone: license.contact_phone || undefined,
          contact_department: license.contact_department || undefined,
          contact_designation: license.contact_designation || undefined,
          renewal_notify: license.renewal_notify,
          notice_days: license.notice_days,
        });
      }

      // Trigger infrastructure provisioning notification
      // Only for public/private cloud types (hybrid is removed)
      const cloudType = formData.cloudType as "public" | "private";
      startProvisioning(result.id, formData.accountName, cloudType);

      toast.success(`Account "${formData.accountName}" created with ${validLicenses.length} license(s). Infrastructure provisioning started.`);

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error("Failed to create account. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const onSubmit = async (data: AccountFormData) => {
    // Not used - we use handleFinish instead
  };

  const handleClose = () => {
    reset();
    setAccountNameError("");
    setCurrentStep(1);
    setPendingLicenses([{ ...emptyLicense, id: crypto.randomUUID() }]);
    onOpenChange(false);
  };

  // License helper functions
  const isLicenseComplete = (license: PendingLicense): boolean => {
    return Boolean(
      license.enterprise_id &&
      license.product_id &&
      license.service_id &&
      license.start_date &&
      license.end_date &&
      license.number_of_users >= 1 &&
      license.contact_full_name &&
      license.contact_email &&
      license.notice_days >= 1
    );
  };

  // Get unique enterprise names from all enterprises
  const uniqueEnterpriseNames = useMemo(() => {
    const names = [...new Set(enterprises.map((e) => e.name))];
    return names.sort((a, b) => a.localeCompare(b));
  }, [enterprises]);

  // Get all products for a given enterprise name (across all enterprise records with that name)
  const getProductsForEnterpriseName = (enterpriseName: string) => {
    const matchingEnterprises = enterprises.filter((e) => e.name === enterpriseName);
    const products: { id: string; name: string; enterpriseId: string }[] = [];
    
    matchingEnterprises.forEach((e) => {
      if (e.product) {
        products.push({
          id: e.product.id,
          name: e.product.name,
          enterpriseId: e.id,
        });
      }
    });
    
    return products;
  };

  // Get services for a specific enterprise record (based on enterprise_id, not name)
  const getEnterpriseServices = (enterpriseId: string) => {
    const enterprise = enterprises.find((e) => e.id === enterpriseId);
    return enterprise?.services || [];
  };

  const handleLicenseChange = (index: number, field: keyof PendingLicense, value: any) => {
    setPendingLicenses((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // When enterprise name is selected
  const handleEnterpriseNameChange = (index: number, enterpriseName: string) => {
    const products = getProductsForEnterpriseName(enterpriseName);
    setPendingLicenses((prev) => {
      const updated = [...prev];
      // If only one product, auto-select it
      if (products.length === 1) {
        const services = getEnterpriseServices(products[0].enterpriseId);
        updated[index] = {
          ...updated[index],
          enterprise_name: enterpriseName,
          enterprise_id: products[0].enterpriseId,
          product_id: products[0].id,
          service_id: services.length === 1 ? services[0].id : "",
        };
      } else {
        updated[index] = {
          ...updated[index],
          enterprise_name: enterpriseName,
          enterprise_id: "",
          product_id: "",
          service_id: "",
        };
      }
      return updated;
    });
  };

  // When product is selected (this also determines the enterprise_id)
  const handleProductChange = (index: number, productId: string, enterpriseName: string) => {
    const products = getProductsForEnterpriseName(enterpriseName);
    const selectedProduct = products.find((p) => p.id === productId);
    if (!selectedProduct) return;

    const services = getEnterpriseServices(selectedProduct.enterpriseId);
    setPendingLicenses((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        enterprise_id: selectedProduct.enterpriseId,
        product_id: productId,
        service_id: services.length === 1 ? services[0].id : "",
      };
      return updated;
    });
  };

  const addLicenseRow = () => {
    setPendingLicenses((prev) => [...prev, { ...emptyLicense, id: crypto.randomUUID() }]);
  };

  const removeLicenseRow = (index: number) => {
    if (pendingLicenses.length > 1) {
      setPendingLicenses((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const completeLicenseCount = pendingLicenses.filter(isLicenseComplete).length;

  // Step validation status
  const getStepValidationStatus = () => {
    const step1Valid = Boolean(accountName && !accountNameError && watch("masterAccountName") && watch("cloudType"));
    const step2Valid = addresses.every(addr => addr.line1 && addr.city && addr.state && addr.country && addr.postalCode);
    const step3Valid = Boolean(
      watch("technicalUser.firstName") && 
      watch("technicalUser.lastName") && 
      watch("technicalUser.email") && 
      watch("technicalUser.startDate") && 
      watch("technicalUser.assignedGroup") && 
      watch("technicalUser.assignedRole") &&
      Object.values(passwordStatus).every(Boolean)
    );
    // Step 4 is only valid if at least one complete license has been added
    const step4Valid = currentStep === 4 && completeLicenseCount > 0;
    
    return { 1: step1Valid, 2: step2Valid, 3: step3Valid, 4: step4Valid };
  };

  const stepValidation = getStepValidationStatus();
  const isCurrentStepValid = stepValidation[currentStep as keyof typeof stepValidation];
  const isAllValid = Object.values(stepValidation).every(Boolean);
  const [direction, setDirection] = useState(1);

  const goToStep = useCallback((step: number) => {
    const isPast = step < currentStep;
    const isStepValid = stepValidation[step as keyof typeof stepValidation];
    if (isPast || isStepValid) {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    }
  }, [currentStep, stepValidation]);

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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else onOpenChange(isOpen);
    }}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Create New Account</DialogTitle>
        </VisuallyHidden>
        {/* Header */}
        <div className="flex-shrink-0 bg-muted/50 border-b border-border px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl icon-gradient flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Create New Account</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Complete the wizard to set up a new account</p>
            </div>
          </div>
        </div>

        {/* Enhanced Step Progress Indicator - Train Header */}
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
                        !isActive && isPast && isStepValid && "bg-green-500 text-white",
                        !isActive && !isPast && isStepValid && "bg-green-500/20 text-green-600 border-2 border-green-500/50",
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
                      
                      {/* Validation indicator dot for incomplete steps */}
                      {!isActive && !isStepValid && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-background"
                        />
                      )}
                    </motion.div>
                    <div className="hidden sm:block text-left">
                      <p className={cn(
                        "text-xs font-medium transition-colors",
                        isActive ? "text-primary" : isStepValid ? "text-green-600" : "text-muted-foreground"
                      )}>
                        {step.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{step.description}</p>
                    </div>
                    
                    {/* Active indicator pulse */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-xl border-2 border-primary/30"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </motion.button>

                  {/* Connector line with validation state */}
                  {index < STEPS.length - 1 && (
                    <div className="w-8 h-0.5 mx-1 relative">
                      <div className="absolute inset-0 bg-muted-foreground/20 rounded-full" />
                      <motion.div
                        className={cn(
                          "absolute inset-0 rounded-full origin-left",
                          isStepValid ? "bg-green-500" : isPast ? "bg-primary" : "bg-transparent"
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
          
          {/* Validation Summary */}
          <motion.div 
            className="flex items-center justify-center gap-4 pt-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {Object.entries(stepValidation).map(([stepId, isValid]) => (
              <div 
                key={stepId}
                className={cn(
                  "flex items-center gap-1.5 text-xs transition-colors",
                  isValid ? "text-green-600" : "text-muted-foreground"
                )}
              >
                {isValid ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-current" />
                )}
                <span>{STEPS[Number(stepId) - 1].title}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <AnimatePresence mode="wait">
              {/* Step 1: Account Details */}
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">Account Information</h3>
                    <p className="text-sm text-muted-foreground">Enter the basic details for this account</p>
                  </div>

                  <div className="grid gap-fluid-md">
                    <div className="form-grid">
                      <div className="space-y-2">
                        <Label htmlFor="accountName" className="text-sm font-medium">
                          Account Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="accountName"
                          {...register("accountName")}
                          placeholder="Enter account name"
                          maxLength={100}
                          className={cn(
                            "h-11 input-glow",
                            (errors.accountName || accountNameError) && "border-destructive focus:border-destructive"
                          )}
                        />
                        {(errors.accountName || accountNameError) && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.accountName?.message || accountNameError}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="masterAccountName" className="text-sm font-medium">
                          Master Account Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="masterAccountName"
                          {...register("masterAccountName")}
                          placeholder="Enter master account name"
                          className={cn("h-11 input-glow", errors.masterAccountName && "border-destructive")}
                        />
                        {errors.masterAccountName && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.masterAccountName.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        Cloud Type <span className="text-destructive">*</span>
                      </Label>
                      <Controller
                        name="cloudType"
                        control={control}
                        render={({ field }) => (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-fluid-sm">
                            {cloudTypes.map((type) => (
                              <motion.button
                                key={type.value}
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => field.onChange(type.value)}
                                className={cn(
                                  "relative p-4 rounded-xl border-2 text-left transition-all duration-200",
                                  field.value === type.value
                                    ? "border-primary bg-primary/5 shadow-md"
                                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                                )}
                              >
                                {field.value === type.value && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                                  >
                                    <Check className="w-3 h-3 text-primary-foreground" />
                                  </motion.div>
                                )}
                                <div className="text-2xl mb-2">{type.icon}</div>
                                <p className="font-medium text-foreground">{type.label}</p>
                              </motion.button>
                            ))}
                          </div>
                        )}
                      />
                      {errors.cloudType && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {errors.cloudType.message}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Address Details */}
              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-foreground">Address Details</h3>
                      <p className="text-sm text-muted-foreground">Add one or more addresses for this account</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addAddress}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Address
                    </Button>
                  </div>

                  {errors.addresses && typeof errors.addresses === "object" && "message" in errors.addresses && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.addresses.message as string}
                    </p>
                  )}

                  <div className="space-y-4">
                    {addresses.map((address, index) => (
                      <motion.div
                        key={address.id || index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="relative p-5 rounded-xl border border-border bg-card"
                      >
                        {addresses.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeAddress(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}

                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-success" />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            Address {index + 1}
                          </span>
                        </div>

                        <AddressFields
                          index={index}
                          control={control}
                          register={register}
                          errors={errors}
                          setValue={setValue}
                          watch={watch}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Technical User */}
              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">Technical User Setup</h3>
                    <p className="text-sm text-muted-foreground">Configure the primary technical contact for this account</p>
                  </div>

                  <div className="grid gap-fluid-md">
                    {/* Personal Info */}
                    <div className="p-5 rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">Personal Information</span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-fluid-sm">
                        <div className="space-y-2">
                          <Label className="text-sm">First Name <span className="text-destructive">*</span></Label>
                          <Input
                            {...register("technicalUser.firstName")}
                            placeholder="First name"
                            className={cn("h-10 input-glow", errors.technicalUser?.firstName && "border-destructive")}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Middle Name</Label>
                          <Input
                            {...register("technicalUser.middleName")}
                            placeholder="Middle name"
                            className="h-10 input-glow"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Last Name <span className="text-destructive">*</span></Label>
                          <Input
                            {...register("technicalUser.lastName")}
                            placeholder="Last name"
                            className={cn("h-10 input-glow", errors.technicalUser?.lastName && "border-destructive")}
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-sm">Email Address <span className="text-destructive">*</span></Label>
                          <Input
                            type="email"
                            {...register("technicalUser.email")}
                            placeholder="email@example.com"
                            className={cn("h-10 input-glow", errors.technicalUser?.email && "border-destructive")}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Status</Label>
                          <Controller
                            name="technicalUser.status"
                            control={control}
                            render={({ field }) => (
                              <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background">
                                <span className="text-sm">
                                  {field.value === "active" ? "Active" : "Inactive"}
                                </span>
                                <Switch
                                  checked={field.value === "active"}
                                  onCheckedChange={(checked) => field.onChange(checked ? "active" : "inactive")}
                                />
                              </div>
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Dates & Access */}
                    <div className="form-grid">
                      <div className="p-5 rounded-xl border border-border bg-card">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                            <span className="text-sm">📅</span>
                          </div>
                          <span className="text-sm font-medium text-foreground">Validity Period</span>
                        </div>
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Start Date <span className="text-destructive">*</span></Label>
                            <Input
                              type="date"
                              {...register("technicalUser.startDate")}
                              className={cn("h-10 input-glow", errors.technicalUser?.startDate && "border-destructive")}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">End Date</Label>
                            <Input
                              type="date"
                              {...register("technicalUser.endDate")}
                              className="h-10 input-glow"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="p-5 rounded-xl border border-border bg-card">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                            <span className="text-sm">🔐</span>
                          </div>
                          <span className="text-sm font-medium text-foreground">Access Control</span>
                        </div>
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Assigned Group <span className="text-destructive">*</span></Label>
                            <Controller
                              name="technicalUser.assignedGroup"
                              control={control}
                              render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <SelectTrigger className={cn("h-10 input-glow", errors.technicalUser?.assignedGroup && "border-destructive")}>
                                    <SelectValue placeholder="Select group" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {groups.map((group) => (
                                      <SelectItem key={group.id} value={group.name}>{group.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Assigned Role <span className="text-destructive">*</span></Label>
                            <Controller
                              name="technicalUser.assignedRole"
                              control={control}
                              render={({ field }) => (
                                <Select 
                                  value={field.value} 
                                  onValueChange={field.onChange}
                                  disabled={!selectedGroupName || availableRoles.length === 0}
                                >
                                  <SelectTrigger className={cn("h-10 input-glow", errors.technicalUser?.assignedRole && "border-destructive")}>
                                    <SelectValue placeholder={!selectedGroupName ? "Select a group first" : availableRoles.length === 0 ? "No roles available" : "Select role"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableRoles.map((role) => (
                                      <SelectItem key={role.roleId} value={role.roleName}>{role.roleName}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Password */}
                    <div className="p-5 rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                          <span className="text-sm">🔑</span>
                        </div>
                        <span className="text-sm font-medium text-foreground">Security Credentials</span>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Password <span className="text-destructive">*</span></Label>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              {...register("technicalUser.password")}
                              placeholder="Enter a strong password"
                              className={cn("h-10 input-glow pr-10", errors.technicalUser?.password && "border-destructive")}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                        
                        <div className="p-4 rounded-lg bg-muted/50 border border-border">
                          <p className="text-xs font-medium text-muted-foreground mb-3">Password Requirements</p>
                          <div className="grid grid-cols-2 gap-2">
                            {passwordRequirements.map((req) => {
                              const isValid = passwordStatus[req.key as keyof typeof passwordStatus];
                              return (
                                <div key={req.key} className="flex items-center gap-2">
                                  <div className={cn(
                                    "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
                                    isValid ? "bg-success" : "bg-muted"
                                  )}>
                                    {isValid ? (
                                      <Check className="w-2.5 h-2.5 text-success-foreground" />
                                    ) : (
                                      <X className="w-2.5 h-2.5 text-muted-foreground" />
                                    )}
                                  </div>
                                  <span className={cn(
                                    "text-xs transition-colors",
                                    isValid ? "text-success" : "text-muted-foreground"
                                  )}>
                                    {req.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Licenses */}
              {currentStep === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">License Management</h3>
                    <p className="text-sm text-muted-foreground">
                      Add at least one license to complete account setup
                      <span className="text-destructive"> *</span>
                    </p>
                  </div>

                  {/* License requirement warning */}
                  {completeLicenseCount === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800"
                    >
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">
                        At least one complete license is required before saving the account.
                      </span>
                    </motion.div>
                  )}

                  {/* License form rows */}
                  <div className="space-y-4">
                    {pendingLicenses.map((license, index) => (
                      <motion.div
                        key={license.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "p-4 rounded-xl border bg-card",
                          isLicenseComplete(license) ? "border-green-300 bg-green-50/30" : "border-border"
                        )}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              isLicenseComplete(license) ? "bg-green-100" : "bg-primary/10"
                            )}>
                              <FileKey2 className={cn(
                                "w-4 h-4",
                                isLicenseComplete(license) ? "text-green-600" : "text-primary"
                              )} />
                            </div>
                            <span className="text-sm font-medium">License {index + 1}</span>
                            {isLicenseComplete(license) && (
                              <Check className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                          {pendingLicenses.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeLicenseRow(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Enterprise Name */}
                          <div className="space-y-2">
                            <Label className="text-sm">Enterprise <span className="text-destructive">*</span></Label>
                            <Select
                              value={license.enterprise_name}
                              onValueChange={(v) => handleEnterpriseNameChange(index, v)}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select enterprise" />
                              </SelectTrigger>
                              <SelectContent>
                                {uniqueEnterpriseNames.map((name) => (
                                  <SelectItem key={name} value={name}>
                                    <div className="flex items-center gap-2">
                                      <Building2 className="w-3.5 h-3.5" />
                                      {name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Product (selectable from matching enterprises) */}
                          <div className="space-y-2">
                            <Label className="text-sm">Product <span className="text-destructive">*</span></Label>
                            {(() => {
                              const products = getProductsForEnterpriseName(license.enterprise_name);
                              // If only one product or no enterprise selected, show as read-only
                              if (!license.enterprise_name || products.length <= 1) {
                                return (
                                  <div className="h-10 px-3 flex items-center rounded-md border bg-muted/50 text-sm">
                                    <Package className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                    {products.length === 1 ? products[0].name : "Select enterprise first"}
                                  </div>
                                );
                              }
                              // Multiple products - show dropdown
                              return (
                                <Select
                                  value={license.product_id}
                                  onValueChange={(v) => handleProductChange(index, v, license.enterprise_name)}
                                >
                                  <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        <div className="flex items-center gap-2">
                                          <Package className="w-3.5 h-3.5" />
                                          {p.name}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </div>

                          {/* Service */}
                          <div className="space-y-2">
                            <Label className="text-sm">Service <span className="text-destructive">*</span></Label>
                            <Select
                              value={license.service_id}
                              onValueChange={(v) => handleLicenseChange(index, "service_id", v)}
                              disabled={!license.enterprise_id}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Select service" />
                              </SelectTrigger>
                              <SelectContent>
                                {getEnterpriseServices(license.enterprise_id).map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <div className="flex items-center gap-2">
                                      <Wrench className="w-3.5 h-3.5" />
                                      {s.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Start Date */}
                          <div className="space-y-2">
                            <Label className="text-sm">Start Date <span className="text-destructive">*</span></Label>
                            <Input
                              type="date"
                              value={license.start_date}
                              onChange={(e) => handleLicenseChange(index, "start_date", e.target.value)}
                              className="h-10"
                            />
                          </div>

                          {/* End Date */}
                          <div className="space-y-2">
                            <Label className="text-sm">End Date <span className="text-destructive">*</span></Label>
                            <Input
                              type="date"
                              value={license.end_date}
                              onChange={(e) => handleLicenseChange(index, "end_date", e.target.value)}
                              className="h-10"
                            />
                          </div>

                          {/* Number of Users */}
                          <div className="space-y-2">
                            <Label className="text-sm">Users <span className="text-destructive">*</span></Label>
                            <Input
                              type="number"
                              min={1}
                              value={license.number_of_users}
                              onChange={(e) => handleLicenseChange(index, "number_of_users", parseInt(e.target.value) || 1)}
                              className="h-10"
                            />
                          </div>

                          {/* Contact Name */}
                          <div className="space-y-2">
                            <Label className="text-sm">Contact Name <span className="text-destructive">*</span></Label>
                            <Input
                              value={license.contact_full_name}
                              onChange={(e) => handleLicenseChange(index, "contact_full_name", e.target.value)}
                              placeholder="Full name"
                              className="h-10"
                            />
                          </div>

                          {/* Contact Email */}
                          <div className="space-y-2">
                            <Label className="text-sm">Contact Email <span className="text-destructive">*</span></Label>
                            <Input
                              type="email"
                              value={license.contact_email}
                              onChange={(e) => handleLicenseChange(index, "contact_email", e.target.value)}
                              placeholder="email@example.com"
                              className="h-10"
                            />
                          </div>

                          {/* Notice Days */}
                          <div className="space-y-2">
                            <Label className="text-sm">Notice Days</Label>
                            <Input
                              type="number"
                              min={1}
                              value={license.notice_days}
                              onChange={(e) => handleLicenseChange(index, "notice_days", parseInt(e.target.value) || 30)}
                              className="h-10"
                            />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLicenseRow}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Another License
                  </Button>

                  {/* Auto-Provisioning Confirmation Summary */}
                  {completeLicenseCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                      className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-5"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <ShieldCheck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Auto-Provisioned RBAC</h4>
                          <p className="text-xs text-muted-foreground">
                            The following will be automatically created for this account on save
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Technical Group */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border">
                          <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Users className="w-4 h-4 text-accent-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Group</p>
                            <p className="text-sm font-semibold text-foreground">Technical Group</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Default group for technical users
                            </p>
                          </div>
                        </div>

                        {/* Technical Role */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border">
                          <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Shield className="w-4 h-4 text-accent-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Role</p>
                            <p className="text-sm font-semibold text-foreground">Technical Role</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              View-only access across all menus
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Summary details */}
                      <div className="mt-3 pt-3 border-t border-primary/10">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Check className="w-3 h-3 text-primary" />
                            Technical Role linked to Technical Group
                          </span>
                          <span className="flex items-center gap-1">
                            <Check className="w-3 h-3 text-primary" />
                            Technical user assigned to group
                          </span>
                          <span className="flex items-center gap-1">
                            <Check className="w-3 h-3 text-primary" />
                            Scoped to account &amp; enterprise context
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Progress Bar & Footer */}
          <div className="border-t bg-muted/30 flex-shrink-0">
            {/* Progress Bar */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <motion.div
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      isAllValid 
                        ? "bg-green-500 text-white" 
                        : "bg-primary/20 text-primary"
                    )}
                    animate={isAllValid ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    {isAllValid ? <Check className="w-3.5 h-3.5" /> : `${Object.values(stepValidation).filter(Boolean).length}`}
                  </motion.div>
                  <span className="text-sm font-medium text-foreground">
                    {isAllValid ? "Ready to create!" : "Form Progress"}
                  </span>
                </div>
                <motion.span 
                  className={cn(
                    "text-sm font-semibold",
                    isAllValid ? "text-green-600" : "text-primary"
                  )}
                  key={Object.values(stepValidation).filter(Boolean).length}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {Math.round((Object.values(stepValidation).filter(Boolean).length / 4) * 100)}%
                </motion.span>
              </div>
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    isAllValid 
                      ? "bg-gradient-to-r from-green-500 to-green-400" 
                      : "bg-gradient-to-r from-primary to-primary/70"
                  )}
                  initial={{ width: "0%" }}
                  animate={{ 
                    width: `${(Object.values(stepValidation).filter(Boolean).length / 4) * 100}%` 
                  }}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                />
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                {STEPS.map((step) => (
                  <div 
                    key={step.id}
                    className={cn(
                      "text-[10px] transition-colors",
                      stepValidation[step.id as keyof typeof stepValidation] 
                        ? "text-green-600 font-medium" 
                        : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <motion.div 
              className="flex items-center justify-between px-6 pb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={handleClose}
                  className="gap-2"
                  disabled={isSubmitting}
                >
                  <X className="w-4 h-4" />
                  {currentStep === 4 ? "Close" : "Cancel"}
                </Button>
              </div>
              
              <div className="flex items-center gap-3">
                {currentStep > 1 && currentStep < 4 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handlePrev}
                      className="gap-2"
                      disabled={isSubmitting}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                  </motion.div>
                )}
                
                {currentStep < 4 ? (
                  <Button 
                    type="button" 
                    onClick={handleNext}
                    disabled={!isCurrentStepValid || isSubmitting}
                    className="gap-2 min-w-[120px]"
                  >
                    {isSubmitting && currentStep === 3 ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    type="button"
                    onClick={handleFinish}
                    disabled={completeLicenseCount === 0 || isSaving}
                    className={cn(
                      "gap-2 min-w-[160px]",
                      completeLicenseCount > 0 
                        ? "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/30"
                        : "opacity-50"
                    )}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      <>
                        <Building2 className="w-4 h-4" />
                        {completeLicenseCount === 0 ? "Add License to Save" : "Create Account"}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
