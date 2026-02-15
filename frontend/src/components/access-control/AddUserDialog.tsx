import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Sparkles, 
  Mail, 
  Calendar, 
  Shield,
  Users,
  Eye,
  EyeOff,
  Check,
  X,
  Building2,
  Wrench,
  Layers,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Circle,
  Zap,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { useCreateAccessControlUser, useCheckUserEmailExists } from "@/hooks/useAccessControlUsers";
import { useUpdateUserWorkstreams } from "@/hooks/useUserWorkstreams";
import { useUpdateUserGroups } from "@/hooks/useUserGroups";

import { useGroups, Group } from "@/hooks/useGroups";
import { getPasswordRequirementStatus } from "@/lib/validations/account";
import { GroupMultiSelect } from "./GroupMultiSelect";
import { cn } from "@/lib/utils";
import { WorkstreamMultiSelect } from "./WorkstreamMultiSelect";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";
import { useLicenseCapacity } from "@/hooks/useLicenseCapacity";
import { LicenseCapacityBanner } from "./LicenseCapacityBanner";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  { id: 1, title: "Identity", icon: User, description: "Basic info" },
  { id: 2, title: "Access", icon: Calendar, description: "Period & account" },
  { id: 3, title: "Security", icon: Shield, description: "Credentials" },
  { id: 4, title: "Assignment", icon: Users, description: "Group & workstream" },
];

export function AddUserDialog({ open, onOpenChange }: AddUserDialogProps) {
  const createUser = useCreateAccessControlUser();
  const updateUserWorkstreams = useUpdateUserWorkstreams();
  const updateUserGroups = useUpdateUserGroups();
  
  const { data: groups = [] } = useGroups();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  // License capacity check
  const { data: licenseCapacity, isLoading: isLoadingCapacity } = useLicenseCapacity(selectedAccount?.id);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    status: "active" as "active" | "inactive",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    password: "",
    accountId: "",
    isTechnicalUser: false,
  });
  
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedWorkstreams, setSelectedWorkstreams] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [direction, setDirection] = useState(1);
  
  const passwordStatus = getPasswordRequirementStatus(formData.password);
  const passwordValid = Object.values(passwordStatus).every(Boolean);

  const effectiveAccountId = formData.accountId || selectedAccount?.id || "";
  const effectiveEnterpriseId = selectedEnterprise?.id || "";

  // Check for duplicate email within the same account + enterprise combination
  const { isDuplicate: isEmailDuplicate, isChecking: isCheckingEmail } = useCheckUserEmailExists(
    formData.email,
    effectiveAccountId || null,
    effectiveEnterpriseId || null
  );

  const handleWorkstreamChange = useCallback((ids: string[]) => {
    setSelectedWorkstreams(ids);
  }, []);

  // Get selected groups objects
  const selectedGroups = useMemo(() => 
    groups.filter(g => selectedGroupIds.includes(g.id)),
    [groups, selectedGroupIds]
  );

  // Step validation - removed assignedRole requirement since roles come from group
  const stepValidation = useMemo(() => ({
    1: Boolean(formData.firstName && formData.lastName && formData.email && !isEmailDuplicate),
    2: Boolean(formData.startDate),
    3: passwordValid,
    4: Boolean(selectedGroupIds.length > 0 && selectedWorkstreams.length > 0),
  }), [formData, passwordValid, selectedWorkstreams, selectedGroupIds, isEmailDuplicate]);

  const isCurrentStepValid = stepValidation[currentStep as keyof typeof stepValidation];
  const isAllValid = Object.values(stepValidation).every(Boolean);
  const isAtCapacity = licenseCapacity?.isAtCapacity ?? false;
  const hasNoLicenses = licenseCapacity ? !licenseCapacity.hasLicenses : false;
  const isSubmitBlocked = isAtCapacity || hasNoLicenses;

  const handleSubmit = async () => {
    if (!isAllValid || isSubmitBlocked) return;
    
    try {
      // Create the auth user via edge function (Supabase) or NestJS endpoint (external)
      if (formData.password) {
        if (isExternalApi()) {
          const { data: authResult, error: authError } = await httpClient.post<{ success: boolean; error?: string; userId?: string }>(
            "/api/users/provision",
            {
              email: formData.email,
              password: formData.password,
              firstName: formData.firstName,
              lastName: formData.lastName,
              middleName: formData.middleName || undefined,
            }
          );

          if (authError) {
            console.error("Error creating auth user:", authError);
            toast.error(`Failed to create authentication: ${authError.message}`);
            return;
          }

          if (!authResult?.success) {
            toast.error(authResult?.error || "Failed to create authentication user");
            return;
          }

          console.log("Auth user provisioned via NestJS:", authResult);
        } else {
          const { data: authResult, error: authError } = await supabase.functions.invoke(
            "create-technical-user",
            {
              body: {
                email: formData.email,
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName,
                middleName: formData.middleName || undefined,
              },
            }
          );

          if (authError) {
            console.error("Error creating auth user:", authError);
            toast.error(`Failed to create authentication: ${authError.message}`);
            return;
          }

          if (!authResult?.success) {
            toast.error(authResult?.error || "Failed to create authentication user");
            return;
          }

          console.log("Auth user created/updated:", authResult);
        }
      }

      // Get the first group's name for backward compatibility with assigned_group column
      const primaryGroup = selectedGroups[0];
      const primaryGroupName = primaryGroup?.name || "";
      const primaryRoleName = primaryGroup?.roles?.[0]?.roleName || "Member";

      const result = await createUser.mutateAsync({
        firstName: formData.firstName,
        middleName: formData.middleName || undefined,
        lastName: formData.lastName,
        email: formData.email,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        assignedGroup: primaryGroupName,
        assignedRole: primaryRoleName,
        accountId: effectiveAccountId || undefined,
        enterpriseId: effectiveEnterpriseId || undefined,
        isTechnicalUser: formData.isTechnicalUser,
      });
      
      if (result && selectedWorkstreams.length > 0) {
        await updateUserWorkstreams.mutateAsync({
          userId: result.id,
          workstreamIds: selectedWorkstreams,
        });
      }

      // Save user group assignments to user_groups junction table
      if (result && selectedGroupIds.length > 0) {
        await updateUserGroups.mutateAsync({
          userId: result.id,
          groupIds: selectedGroupIds,
        });
      }
      
      handleClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setFormData({
      firstName: "",
      middleName: "",
      lastName: "",
      email: "",
      status: "active",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      password: "",
      accountId: "",
      isTechnicalUser: false,
    });
  setSelectedGroupIds([]);
    setSelectedWorkstreams([]);
    setShowPassword(false);
    setCurrentStep(1);
    setDirection(1);
    onOpenChange(false);
  };

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const nextStep = () => {
    if (currentStep < 4 && isCurrentStepValid) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
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
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Identity Header Card */}
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
            <UserPlus className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">User Identity</h3>
            <p className="text-sm text-muted-foreground">Enter the basic information for the new user</p>
          </div>
        </div>
      </motion.div>

      {/* Name Fields */}
      <motion.div 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-fluid-sm"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {[
          { id: "firstName", label: "First Name", value: formData.firstName, required: true, placeholder: "John" },
          { id: "middleName", label: "Middle Name", value: formData.middleName, required: false, placeholder: "William" },
          { id: "lastName", label: "Last Name", value: formData.lastName, required: true, placeholder: "Doe" },
        ].map((field, index) => (
          <motion.div
            key={field.id}
            className="space-y-2"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + index * 0.1 }}
          >
            <Label htmlFor={field.id} className="flex items-center gap-1.5">
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <motion.div whileFocus={{ scale: 1.02 }}>
              <Input
                id={field.id}
                value={field.value}
                onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                placeholder={field.placeholder}
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </motion.div>
          </motion.div>
        ))}
      </motion.div>

      {/* Email Field */}
      <motion.div
        className="space-y-2"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Label htmlFor="email" className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          Email Address <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            placeholder="john.doe@company.com"
            className={cn(
              "pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary",
              isEmailDuplicate && "border-destructive focus:border-destructive focus:ring-destructive/20"
            )}
          />
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        {isEmailDuplicate && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            A user with this email already exists for this account and enterprise
          </p>
        )}
        {isCheckingEmail && formData.email.trim() && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Checking availability...
          </p>
        )}
      </motion.div>

      {/* Status & Technical User Row */}
      <motion.div
        className="flex items-center gap-6 p-4 rounded-xl bg-muted/30 border"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: "active" | "inactive") => 
              setFormData(prev => ({ ...prev, status: value }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Active
                </div>
              </SelectItem>
              <SelectItem value="inactive">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                  Inactive
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="h-12 w-px bg-border" />

        <motion.label
          htmlFor="isTechnicalUser"
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200",
            formData.isTechnicalUser 
              ? "bg-primary/10 border-2 border-primary/30" 
              : "bg-muted/50 border-2 border-transparent hover:bg-muted"
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Checkbox
            id="isTechnicalUser"
            checked={formData.isTechnicalUser}
            onCheckedChange={(checked) => 
              setFormData(prev => ({ ...prev, isTechnicalUser: checked === true }))
            }
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              formData.isTechnicalUser ? "bg-primary/20" : "bg-muted"
            )}>
              <Wrench className={cn(
                "w-4 h-4 transition-colors",
                formData.isTechnicalUser ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className="text-sm font-medium">Technical User</p>
              <p className="text-xs text-muted-foreground">System access privileges</p>
            </div>
          </div>
        </motion.label>
      </motion.div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Access Period Header */}
      <motion.div 
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/5 via-primary/10 to-blue-500/5 p-6 border border-primary/10"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <motion.div 
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-white shadow-lg shadow-violet-500/30"
            whileHover={{ scale: 1.05, rotate: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Calendar className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Access Configuration</h3>
            <p className="text-sm text-muted-foreground">Define the access period and account association</p>
          </div>
        </div>
      </motion.div>

      {/* Date Fields */}
      <motion.div 
        className="form-grid"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="space-y-2">
          <Label htmlFor="startDate" className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            Start Date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
            className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate" className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-500" />
            End Date <span className="text-xs text-muted-foreground">(Optional)</span>
          </Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
            className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </motion.div>

      {/* Account Association */}
      <motion.div
        className="p-5 rounded-xl bg-muted/30 border space-y-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h4 className="font-medium">Account Association</h4>
        </div>
        
        {selectedAccount ? (
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl border">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{selectedAccount.name}</p>
              <p className="text-xs text-muted-foreground">From header selection</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-dashed">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No account selected in header</p>
          </div>
        )}
      </motion.div>

      {/* Workstream Assignment */}
      <motion.div
        className="p-5 rounded-xl bg-gradient-to-br from-primary/5 to-violet-500/5 border border-primary/10 space-y-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h4 className="font-medium">Workstream Assignment</h4>
          <span className="text-destructive">*</span>
        </div>
        
        <WorkstreamMultiSelect
          accountId={effectiveAccountId}
          enterpriseId={effectiveEnterpriseId}
          selectedIds={selectedWorkstreams}
          onSelectionChange={handleWorkstreamChange}
          autoSelectDefault={formData.isTechnicalUser}
        />
        
        <p className="text-xs text-muted-foreground">
          Users must be assigned to at least one workstream. Technical users get the Default workstream automatically.
        </p>
      </motion.div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Security Header */}
      <motion.div 
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/5 via-primary/10 to-teal-500/5 p-6 border border-emerald-500/10"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <motion.div 
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Shield className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Security Settings</h3>
            <p className="text-sm text-muted-foreground">Set up secure credentials for the user</p>
          </div>
        </div>
      </motion.div>

      {/* Password Field */}
      <motion.div
        className="space-y-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Label htmlFor="password" className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Password <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            placeholder="Enter a secure password"
            className="pr-12 transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-muted"
            onClick={() => setShowPassword(!showPassword)}
          >
            <motion.div
              initial={false}
              animate={{ rotateY: showPassword ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </motion.div>
          </Button>
        </div>
      </motion.div>

      {/* Password Requirements */}
      <motion.div
        className="p-5 rounded-xl bg-muted/30 border space-y-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Password Requirements
          </h4>
          <Badge variant={passwordValid ? "default" : "secondary"} className={cn(
            passwordValid && "bg-emerald-500 hover:bg-emerald-600"
          )}>
            {Object.values(passwordStatus).filter(Boolean).length}/5 Complete
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "length", label: "At least 12 characters", icon: "📏" },
            { key: "uppercase", label: "One uppercase letter", icon: "🔠" },
            { key: "lowercase", label: "One lowercase letter", icon: "🔡" },
            { key: "number", label: "One number", icon: "🔢" },
            { key: "special", label: "One special character", icon: "✨" },
          ].map(({ key, label, icon }, index) => {
            const isValid = passwordStatus[key as keyof typeof passwordStatus];
            return (
              <motion.div
                key={key}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all duration-300",
                  isValid 
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" 
                    : "bg-muted/50 border-muted"
                )}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
              >
                <motion.div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs",
                    isValid ? "bg-emerald-500 text-white" : "bg-muted"
                  )}
                  animate={isValid ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isValid ? <Check className="w-3 h-3" /> : icon}
                </motion.div>
                <span className={cn(
                  "text-xs font-medium transition-colors",
                  isValid ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                )}>
                  {label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      {/* Assignment Header */}
      <motion.div 
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/5 via-primary/10 to-amber-500/5 p-6 border border-orange-500/10"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <motion.div 
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/30"
            whileHover={{ scale: 1.05, rotate: -5 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Users className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Group Assignment</h3>
            <p className="text-sm text-muted-foreground">Assign the user to one or more groups to inherit their roles and permissions</p>
          </div>
        </div>
      </motion.div>

      {/* Group Selection */}
      <motion.div
        className="p-5 rounded-xl bg-muted/30 border space-y-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h4 className="font-medium">Assigned Groups</h4>
          <span className="text-destructive">*</span>
        </div>
        
        <GroupMultiSelect
          groups={groups}
          selectedGroupIds={selectedGroupIds}
          onSelectionChange={setSelectedGroupIds}
          placeholder="Select one or more groups..."
        />
      </motion.div>
    </div>
  );

  const isPending = createUser.isPending || updateUserWorkstreams.isPending || updateUserGroups.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Add New User</DialogTitle>
        </VisuallyHidden>

        {/* Animated Header */}
        <motion.div 
          className="relative overflow-hidden bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-8 py-5 flex-shrink-0"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute inset-0 bg-grid-primary/5 [mask-image:linear-gradient(0deg,transparent,black)]" />
          <motion.div 
            className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <div className="relative flex items-center gap-4">
            <motion.div 
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <User className="w-6 h-6" />
            </motion.div>
            <div>
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                Add New User
                <motion.div
                  animate={{ rotate: [0, 15, -15, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                </motion.div>
              </h2>
              <p className="text-sm text-muted-foreground">
                Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* License Capacity Banner */}
        <div className="px-8 pt-4">
          <LicenseCapacityBanner capacity={licenseCapacity} isLoading={isLoadingCapacity} />
        </div>

        {/* Form Content */}
        <div className={cn(
          "flex-1 overflow-y-auto px-8 py-6",
          isSubmitBlocked && "opacity-60 pointer-events-none"
        )}>
          <div className="transition-opacity duration-200">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
          </div>
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
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </div>
            
            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={prevStep}
                    className="gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                </motion.div>
              )}
              
              {currentStep < 4 ? (
                <Button 
                  type="button" 
                  onClick={nextStep}
                  disabled={!isCurrentStepValid}
                  className="gap-2 min-w-[120px]"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button 
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isAllValid || isPending || isSubmitBlocked}
                  className="gap-2 min-w-[140px] bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/30"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : isSubmitBlocked ? (
                    <>
                      <Shield className="w-4 h-4" />
                      {hasNoLicenses ? "No License" : "At Capacity"}
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Create User
                    </>
                  )}
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
