import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  User,
  Sparkles,
  Mail,
  Calendar,
  Shield,
  Users,
  Building2,
  Wrench,
  Layers,
  ChevronLeft,
  ChevronRight,
  Check,
  Save,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useUpdateAccessControlUser, useCheckUserEmailExists, AccessControlUser } from "@/hooks/useAccessControlUsers";
import { useUpdateUserWorkstreams } from "@/hooks/useUserWorkstreams";
import { useUpdateUserGroups, useUserGroups } from "@/hooks/useUserGroups";

import { useGroups, Group } from "@/hooks/useGroups";
import { useRoles, Role } from "@/hooks/useRoles";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { WorkstreamMultiSelect } from "./WorkstreamMultiSelect";
import { GroupMultiSelect } from "./GroupMultiSelect";
import { cn } from "@/lib/utils";
import { useAuditLog } from "@/hooks/useAuditLog";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AccessControlUser | null;
}

const STEPS = [
  { id: 1, title: "Identity", icon: User, description: "Basic info" },
  { id: 2, title: "Access", icon: Calendar, description: "Period & account" },
  { id: 3, title: "Security", icon: Shield, description: "Status & type" },
  { id: 4, title: "Assignment", icon: Users, description: "Group & workstream" },
];

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

const fieldVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.3,
      ease: [0, 0, 0.2, 1] as const,
    },
  }),
};

export function EditUserDialog({ open, onOpenChange, user }: EditUserDialogProps) {
  const updateUser = useUpdateAccessControlUser();
  const updateUserWorkstreams = useUpdateUserWorkstreams();
  const updateUserGroups = useUpdateUserGroups();
  const { logAudit } = useAuditLog();

  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  // Fetch groups filtered by current account/enterprise context
  const { data: groups = [] } = useGroups(
    selectedAccount?.id || null,
    selectedEnterprise?.id || null
  );

  // Fetch all roles for role override dropdown
  const { data: allRoles = [] } = useRoles(
    selectedAccount?.id || null,
    selectedEnterprise?.id || null
  );

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    status: "active" as "active" | "inactive",
    startDate: "",
    endDate: "",
    accountId: "",
    isTechnicalUser: false,
  });

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedWorkstreams, setSelectedWorkstreams] = useState<string[]>([]);
  const [initialWorkstreamsLoaded, setInitialWorkstreamsLoaded] = useState(false);
  const [initialGroupsLoaded, setInitialGroupsLoaded] = useState(false);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);
  const [roleOverride, setRoleOverride] = useState<string>("");

  // Store initial values to detect changes
  const initialFormData = useRef<typeof formData | null>(null);
  const initialGroupIdsRef = useRef<string[]>([]);
  const initialWorkstreamIdsRef = useRef<string[]>([]);
  const initialRoleOverrideRef = useRef<string>("");

  // Fetch user's current group assignments
  const { data: userGroups = [], isFetched: userGroupsFetched } = useUserGroups(user?.id);

  const initialWorkstreamIds = useMemo(
    () => user?.workstreams?.map((ws) => ws.workstreamId).filter(Boolean) ?? [],
    [user]
  );

  const resolvedGroupIds = useMemo(() => {
    if (selectedGroupIds.length > 0) return selectedGroupIds;
    if (userGroups.length > 0) return userGroups.map((ug) => ug.groupId);
    if (user?.groups?.length) return user.groups.map((group) => group.groupId);
    if (user?.assignedGroup) {
      const legacyGroup = groups.find((group) => group.name === user.assignedGroup);
      if (legacyGroup) return [legacyGroup.id];
    }
    return [];
  }, [selectedGroupIds, userGroups, user?.groups, user?.assignedGroup, groups]);

  const resolvedWorkstreamIds = useMemo(() => {
    if (selectedWorkstreams.length > 0) return selectedWorkstreams;
    return initialWorkstreamIds;
  }, [selectedWorkstreams, initialWorkstreamIds]);

  // Check for duplicate email only when email has actually changed from the original
  const emailChanged = user ? formData.email.trim().toLowerCase() !== user.email.trim().toLowerCase() : false;
  const { isDuplicate: rawEmailDuplicate, isChecking: rawCheckingEmail } = useCheckUserEmailExists(
    emailChanged ? formData.email : "",
    formData.accountId || selectedAccount?.id || null,
    selectedEnterprise?.id || null,
    user?.id
  );
  const isEmailDuplicate = emailChanged && rawEmailDuplicate;
  const isCheckingEmail = emailChanged && rawCheckingEmail;

  // Reset everything when dialog opens/closes or user changes
  useEffect(() => {
    if (open && user) {
      setInitialWorkstreamsLoaded(false);
      setInitialGroupsLoaded(false);
      setCurrentStep(1);
      setDirection(0);

      const initial = {
        firstName: user.firstName,
        middleName: user.middleName || "",
        lastName: user.lastName,
        email: user.email,
        status: user.status,
        startDate: user.startDate,
        endDate: user.endDate || "",
        accountId: user.accountId || "",
        isTechnicalUser: user.isTechnicalUser,
      };
      setFormData(initial);
      initialFormData.current = initial;

      const groupIds = user.groups?.map((group) => group.groupId) ?? [];
      setSelectedGroupIds(groupIds);
      initialGroupIdsRef.current = groupIds;

      setSelectedWorkstreams(initialWorkstreamIds);
      initialWorkstreamIdsRef.current = initialWorkstreamIds;

      const userRole = user.assignedRole || "";
      setRoleOverride(userRole);
      initialRoleOverrideRef.current = userRole;

      setTimeout(() => {
        setInitialWorkstreamsLoaded(true);
      }, 50);
    } else if (!open) {
      setInitialWorkstreamsLoaded(false);
      setInitialGroupsLoaded(false);
      setSelectedWorkstreams([]);
      setSelectedGroupIds([]);
      setCurrentStep(1);
      initialFormData.current = null;
    }
  }, [open, user, initialWorkstreamIds]);

  // Load user groups when userGroups query has completed
  useEffect(() => {
    if (open && user && userGroupsFetched && !initialGroupsLoaded) {
      if (userGroups.length > 0) {
        setSelectedGroupIds(userGroups.map((ug) => ug.groupId));
      } else if (user?.groups?.length) {
        setSelectedGroupIds(user.groups.map((group) => group.groupId));
      } else if (user.assignedGroup) {
        const legacyGroup = groups.find((g) => g.name === user.assignedGroup);
        if (legacyGroup) {
          setSelectedGroupIds([legacyGroup.id]);
        }
      }
      setInitialGroupsLoaded(true);
    }
  }, [open, user, userGroups, userGroupsFetched, groups, initialGroupsLoaded]);

  const handleWorkstreamChange = useCallback((ids: string[]) => {
    setSelectedWorkstreams(ids);
  }, []);

  const handleSubmit = async () => {
    if (
      !user ||
      isEmailDuplicate ||
      isCheckingEmail ||
      resolvedGroupIds.length === 0 ||
      resolvedWorkstreamIds.length === 0 ||
      isSubmitting
    ) return;

    setIsSubmitting(true);
    try {
      const selectedGroups = groups.filter((g) => resolvedGroupIds.includes(g.id));
      const primaryGroup = selectedGroups[0];
      const primaryGroupName = primaryGroup?.name || user?.assignedGroup || "";
      const finalRole = roleOverride || primaryGroup?.roles?.[0]?.roleName || user?.assignedRole || "Member";

      await updateUser.mutateAsync({
        id: user.id,
        data: {
          firstName: formData.firstName,
          middleName: formData.middleName || undefined,
          lastName: formData.lastName,
          email: formData.email,
          status: formData.status,
          startDate: formData.startDate,
          endDate: formData.endDate || null,
          assignedGroup: primaryGroupName,
          assignedRole: finalRole,
          isTechnicalUser: formData.isTechnicalUser,
        },
      });

      await updateUserWorkstreams.mutateAsync({
        userId: user.id,
        workstreamIds: resolvedWorkstreamIds,
      });

      await updateUserGroups.mutateAsync({
        userId: user.id,
        groupIds: resolvedGroupIds,
      });

      // Audit log for role/group changes
      const roleChanged = finalRole !== user.assignedRole;
      const groupChanged = primaryGroupName !== user.assignedGroup;

      if (roleChanged) {
        logAudit({
          action: "user.role_changed",
          entityType: "user",
          entityId: user.id,
          entityName: `${formData.firstName} ${formData.lastName}`,
          targetUserEmail: formData.email,
          oldValue: user.assignedRole,
          newValue: finalRole,
        });
      }

      if (groupChanged) {
        logAudit({
          action: "user.group_changed",
          entityType: "user",
          entityId: user.id,
          entityName: `${formData.firstName} ${formData.lastName}`,
          targetUserEmail: formData.email,
          oldValue: user.assignedGroup,
          newValue: primaryGroupName,
        });
      }

      if (!roleChanged && !groupChanged) {
        logAudit({
          action: "user.updated",
          entityType: "user",
          entityId: user.id,
          entityName: `${formData.firstName} ${formData.lastName}`,
          targetUserEmail: formData.email,
        });
      }

      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasUnsavedChanges = useCallback(() => {
    if (!initialFormData.current) return false;
    const init = initialFormData.current;
    const formChanged = Object.keys(init).some(
      (key) => formData[key as keyof typeof formData] !== init[key as keyof typeof init]
    );
    const groupsChanged = JSON.stringify([...selectedGroupIds].sort()) !== JSON.stringify([...initialGroupIdsRef.current].sort());
    const workstreamsChanged = JSON.stringify([...selectedWorkstreams].sort()) !== JSON.stringify([...initialWorkstreamIdsRef.current].sort());
    return formChanged || groupsChanged || workstreamsChanged;
  }, [formData, selectedGroupIds, selectedWorkstreams]);

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      setShowUnsavedAlert(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleDiscardChanges = () => {
    setShowUnsavedAlert(false);
    onOpenChange(false);
  };

  const handleSaveAndClose = async () => {
    setShowUnsavedAlert(false);
    await handleSubmit();
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= STEPS.length) {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    }
  };

  const nextStep = () => goToStep(currentStep + 1);
  const prevStep = () => goToStep(currentStep - 1);

  // Step validations - removed assignedRole requirement since roles come from group
  // For step 4, consider it valid if we have resolved assignments OR if data is still loading
  const hasGroups = selectedGroupIds.length > 0 || userGroups.length > 0 || (user?.groups && user.groups.length > 0) || !!user?.assignedGroup;
  const hasWorkstreams = selectedWorkstreams.length > 0 || initialWorkstreamIds.length > 0;

  const stepValidation = {
    1: Boolean(formData.firstName && formData.lastName && formData.email),
    2: Boolean(formData.startDate),
    3: Boolean(formData.status),
    4: Boolean(hasGroups && hasWorkstreams),
  };

  const isCurrentStepValid = stepValidation[currentStep as keyof typeof stepValidation];
  const isFormValid = Object.values(stepValidation).every(Boolean);

  const canProceed = () => isCurrentStepValid;

  // Get account/enterprise IDs for workstream filtering
  const effectiveAccountId = user?.accountId || selectedAccount?.id || "";
  const effectiveEnterpriseId = user?.enterpriseId || selectedEnterprise?.id || "";

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div
            key="step1"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="space-y-6"
          >

            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-fluid-sm">
              <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={1} className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Enter first name"
                  className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
                />
              </motion.div>
              <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={2} className="space-y-2">
                <Label htmlFor="middleName" className="text-sm font-medium">Middle Name</Label>
                <Input
                  id="middleName"
                  value={formData.middleName}
                  onChange={(e) => setFormData(prev => ({ ...prev, middleName: e.target.value }))}
                  placeholder="Enter middle name"
                  className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
                />
              </motion.div>
              <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={3} className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Enter last name"
                  className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
                />
              </motion.div>
            </div>

            {/* Email Field */}
            <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={4} className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Email Address *
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@company.com"
                  className={cn(
                    "h-11 pl-10 transition-all focus:ring-2 focus:ring-primary/20",
                    isEmailDuplicate && "border-destructive focus:border-destructive focus:ring-destructive/20"
                  )}
                />
                {isCheckingEmail && formData.email.trim() ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                ) : (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                )}
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
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            key="step2"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="space-y-6"
          >

            {/* Date Fields */}
            <div className="form-grid">
              <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={1} className="space-y-2">
                <Label htmlFor="startDate" className="text-sm font-medium">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
                />
              </motion.div>
              <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={2} className="space-y-2">
                <Label htmlFor="endDate" className="text-sm font-medium">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                  className="h-11 transition-all focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-xs text-muted-foreground">Leave empty for indefinite access</p>
              </motion.div>
            </div>

          </motion.div>
        );

      case 3:
        return (
          <motion.div
            key="step3"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="space-y-6"
          >

            {/* Status Selection */}
            <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={1} className="space-y-3">
              <Label className="text-sm font-medium">User Status *</Label>
              <div className="grid grid-cols-2 gap-4">
                {(["active", "inactive"] as const).map((status) => (
                  <motion.div
                    key={status}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setFormData(prev => ({ ...prev, status }))}
                    className={cn(
                      "relative p-4 rounded-xl border-2 cursor-pointer transition-all",
                      formData.status === status
                        ? status === "active"
                          ? "border-emerald-400 bg-emerald-400/10"
                          : "border-red-500 bg-red-500/10"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    {formData.status === status && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={cn(
                          "absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center",
                          status === "active" ? "bg-emerald-400" : "bg-red-500"
                        )}
                      >
                        <Check className="w-3 h-3 text-white" />
                      </motion.div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-3 h-3 rounded-full",
                        status === "active" ? "bg-emerald-400" : "bg-red-500"
                      )} />
                      <span className="font-medium capitalize">{status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {status === "active" ? "User can access the system" : "User access is disabled"}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Technical User Toggle */}
            <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={2}>
              <motion.div
                whileHover={{ scale: 1.01 }}
                onClick={() => setFormData(prev => ({ ...prev, isTechnicalUser: !prev.isTechnicalUser }))}
                className={cn(
                  "relative p-5 rounded-xl border-2 cursor-pointer transition-all",
                  formData.isTechnicalUser
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                {formData.isTechnicalUser && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                  >
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </motion.div>
                )}
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                    formData.isTechnicalUser ? "bg-primary/20" : "bg-muted"
                  )}>
                    <Wrench className={cn(
                      "w-6 h-6 transition-colors",
                      formData.isTechnicalUser ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <p className="font-medium">Technical User</p>
                    <p className="text-sm text-muted-foreground">
                      Mark this user as a technical/system user with special access
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            key="step4"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="space-y-6"
          >

            {/* Group Selection */}
            <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={1} className="space-y-3">
              <Label className="text-sm font-medium">Select Groups *</Label>
              {initialGroupsLoaded && (
                <GroupMultiSelect
                  groups={groups}
                  selectedGroupIds={selectedGroupIds}
                  onSelectionChange={setSelectedGroupIds}
                  placeholder="Select one or more groups..."
                />
              )}
            </motion.div>

            {/* Role Override */}
            <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={2} className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                Role Assignment
              </Label>
              <Select value={roleOverride} onValueChange={setRoleOverride}>
                <SelectTrigger className="h-11 transition-all focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder="Auto-detect from group" />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                        {role.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Override the role derived from the group. Leave empty to auto-detect from group assignment.
              </p>
            </motion.div>

            <motion.div variants={fieldVariants} initial="hidden" animate="visible" custom={3} className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                Workstream Assignment *
              </Label>
              {initialWorkstreamsLoaded && (
                <WorkstreamMultiSelect
                  accountId={effectiveAccountId}
                  enterpriseId={effectiveEnterpriseId}
                  selectedIds={selectedWorkstreams}
                  onSelectionChange={handleWorkstreamChange}
                  autoSelectDefault={false}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Users must be assigned to at least one workstream
              </p>
            </motion.div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <VisuallyHidden>
          <DialogTitle>Edit User</DialogTitle>
        </VisuallyHidden>

        {/* Header with Step Indicator */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-8 py-6 flex-shrink-0">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                Edit User
                <Sparkles className="w-4 h-4 text-primary" />
              </h2>
              <p className="text-sm text-muted-foreground">
                Update user details and access control settings
              </p>
            </div>
          </div>

          {/* Enhanced Step Indicator with Validation Status */}
          <div className="flex items-center justify-center gap-1 py-2">
            {STEPS.map((step, index) => {
              const isActive = currentStep === step.id;
              const isStepValid = stepValidation[step.id as keyof typeof stepValidation];
              const isPast = currentStep > step.id;
              const Icon = step.icon;

              return (
                <div key={step.id} className="flex items-center">
                  <motion.button
                    type="button"
                    onClick={() => goToStep(step.id)}
                    className={cn(
                      "relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300",
                      isActive && "bg-primary/10 shadow-sm",
                      "cursor-pointer hover:bg-primary/5"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <motion.div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 relative",
                        isActive && "bg-primary text-primary-foreground shadow-lg",
                        !isActive && isPast && isStepValid && "bg-emerald-400/80 text-white",
                        !isActive && !isPast && isStepValid && "bg-emerald-400/15 text-emerald-500 border-2 border-emerald-400/40",
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
                      
                      {/* Validation indicator dot */}
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
                        isActive ? "text-primary" : isStepValid ? "text-emerald-500" : "text-muted-foreground"
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
                          isStepValid ? "bg-emerald-400/80" : isPast ? "bg-primary" : "bg-transparent"
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
            className="flex items-center justify-center gap-4 pt-2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {Object.entries(stepValidation).map(([stepId, isValid]) => (
              <div 
                key={stepId}
                className={cn(
                  "flex items-center gap-1.5 text-xs transition-colors",
                  isValid ? "text-emerald-500" : "text-muted-foreground"
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

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="transition-opacity duration-200">
            {renderStepContent()}
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
                    isFormValid 
                      ? "bg-emerald-400 text-white" 
                      : "bg-primary/20 text-primary"
                  )}
                  animate={isFormValid ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {isFormValid ? <Check className="w-3.5 h-3.5" /> : `${Object.values(stepValidation).filter(Boolean).length}`}
                </motion.div>
                <span className="text-sm font-medium text-foreground">
                  {isFormValid ? "Ready to save!" : "Form Progress"}
                </span>
              </div>
              <motion.span 
                className={cn(
                  "text-sm font-semibold",
                  isFormValid ? "text-emerald-500" : "text-primary"
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
                  isFormValid 
                    ? "bg-gradient-to-r from-emerald-400 to-emerald-300" 
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
                      ? "text-emerald-500 font-medium" 
                      : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between px-6 pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={currentStep === 1 ? handleClose : prevStep}
              className="gap-2"
            >
              {currentStep === 1 ? (
                "Cancel"
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </>
              )}
            </Button>

            {currentStep < STEPS.length ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={!canProceed()}
                className="gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!isFormValid || isSubmitting || isEmailDuplicate || isCheckingEmail}
                className="gap-2 min-w-[140px]"
              >
                {isSubmitting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Save className="w-4 h-4" />
                    </motion.div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showUnsavedAlert} onOpenChange={setShowUnsavedAlert}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Would you like to save them before closing?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDiscardChanges}>
            Discard
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleSaveAndClose} disabled={!isFormValid || isSubmitting}>
            Save Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
