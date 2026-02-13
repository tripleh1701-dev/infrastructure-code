import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// Using native checkbox to avoid Radix ref composition loops inside Dialog+ScrollArea
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Sparkles,
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeft,
  Layers,
  Package,
  Server,
  Shield,
  Building2,
  ChevronDown,
  Eye,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateGroup, useGroupRoles, RoleWithPermissions, useCheckGroupNameExists } from "@/hooks/useGroups";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useLicenses } from "@/hooks/useLicenses";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { AlertCircle } from "lucide-react";

interface AddGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  { id: 1, title: "Basic Info", icon: Users },
  { id: 2, title: "Scoping", icon: Building2 },
  { id: 3, title: "Roles", icon: Shield },
];

export function AddGroupDialog({ open, onOpenChange }: AddGroupDialogProps) {
  const createGroup = useCreateGroup();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  const [currentStep, setCurrentStep] = useState(1);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    workstreamId: "",
    productId: "",
    serviceId: "",
    roleIds: [] as string[],
  });

  // Check for duplicate group name within the same account + enterprise combination
  const { isDuplicate: isNameDuplicate, isChecking: isCheckingName } = useCheckGroupNameExists(
    formData.name,
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  const toggleRoleExpand = (roleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  // Fetch workstreams for current account/enterprise
  const { workstreams = [] } = useWorkstreams(
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  // Fetch licenses for current account/enterprise to get products/services
  const { licenses = [] } = useLicenses(selectedAccount?.id);

  // Filter licenses by enterprise
  const filteredLicenses = useMemo(() => {
    if (!selectedEnterprise?.id) return [];
    return licenses.filter(l => l.enterprise_id === selectedEnterprise.id);
  }, [licenses, selectedEnterprise?.id]);

  // Get unique products from licenses
  const availableProducts = useMemo(() => {
    const productMap = new Map<string, { id: string; name: string }>();
    filteredLicenses.forEach(l => {
      if (l.product?.id && l.product?.name) {
        productMap.set(l.product.id, { id: l.product.id, name: l.product.name });
      }
    });
    return Array.from(productMap.values());
  }, [filteredLicenses]);

  // Get services filtered by selected product
  const availableServices = useMemo(() => {
    if (!formData.productId) return [];
    const serviceMap = new Map<string, { id: string; name: string }>();
    filteredLicenses
      .filter(l => l.product_id === formData.productId)
      .forEach(l => {
        if (l.service?.id && l.service?.name) {
          serviceMap.set(l.service.id, { id: l.service.id, name: l.service.name });
        }
      });
    return Array.from(serviceMap.values());
  }, [filteredLicenses, formData.productId]);

  // Fetch roles filtered by account, enterprise, and workstream
  const { data: availableRoles = [] } = useGroupRoles(
    selectedAccount?.id,
    selectedEnterprise?.id,
    formData.workstreamId || undefined
  );
  // Role scopes modal state - REMOVED to fix infinite loop with nested Radix dialogs
  // Users can view role scopes from the Roles tab instead

  const handleSubmit = async () => {
    // Only submit if we're on the final step
    if (currentStep !== STEPS.length) {
      return;
    }

    try {
      await createGroup.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        accountId: selectedAccount?.id,
        enterpriseId: selectedEnterprise?.id,
        workstreamId: formData.workstreamId || undefined,
        productId: formData.productId || undefined,
        serviceId: formData.serviceId || undefined,
        roleIds: formData.roleIds,
      });
      handleClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Prevent form submission on Enter key
  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      description: "",
      workstreamId: "",
      productId: "",
      serviceId: "",
      roleIds: [],
    });
    setCurrentStep(1);
    onOpenChange(false);
  };

  const handleRoleToggle = (roleId: string) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        return formData.name.trim().length > 0 && !isNameDuplicate;
      case 2:
         return Boolean(formData.workstreamId && formData.productId && formData.serviceId); // Required fields
      case 3:
        return true; // Optional fields
      default:
        return false;
    }
  };

  const canProceed = isStepValid(currentStep) && !isCheckingName;
   const isComplete = isStepValid(1) && isStepValid(2);

  const progressPercentage = useMemo(() => {
    let completed = 0;
    if (isStepValid(1)) completed++;
    if (formData.workstreamId || formData.productId) completed++;
    if (formData.roleIds.length > 0) completed++;
    return (completed / 3) * 100;
  }, [formData, isStepValid]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
          <VisuallyHidden>
            <DialogTitle>Add New Group</DialogTitle>
          </VisuallyHidden>

          {/* Header with Steps */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-8 py-6 flex-shrink-0">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200/50 transition-transform hover:scale-105">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  Add New Group
                  <Sparkles className="w-4 h-4 text-primary" />
                </h2>
                <p className="text-sm text-muted-foreground">
                  Create a group with workstream, product, and role assignments
                </p>
              </div>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => isStepValid(step.id - 1) && setCurrentStep(step.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                      currentStep === step.id
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                        : currentStep > step.id
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <step.icon className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium hidden sm:inline">
                      {step.title}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                  <div className="flex-1 mx-2">
                      <div className="h-0.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: currentStep > step.id ? "100%" : "0%" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Form Content - prevent Enter key submission */}
          <form
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={handleFormKeyDown}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            <ScrollArea className="flex-1 px-8 py-6">
              <div className="transition-opacity duration-200">
                {currentStep === 1 && (
                  <div
                    key="step1"
                    className="space-y-6 animate-fade-in"
                  >
                    <div className="bg-muted/20 rounded-xl p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Users className="w-4 h-4 text-primary" />
                        <h3 className="font-medium text-foreground">
                          Group Details
                        </h3>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="name">Group Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Enter group name"
                          required
                          className={cn("h-11", isNameDuplicate && "border-destructive focus-visible:ring-destructive")}
                        />
                        {isNameDuplicate && (
                          <p className="text-sm text-destructive flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            A group with this name already exists for this account and enterprise
                          </p>
                        )}
                        {isCheckingName && formData.name.trim() && (
                          <p className="text-sm text-muted-foreground">
                            Checking availability...
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          placeholder="Enter group description"
                          rows={3}
                        />
                      </div>

                      {/* Show context badges */}
                      <div className="pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground mb-2">
                          This group will be created for:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedAccount && (
                            <Badge variant="secondary" className="gap-1">
                              <Building2 className="w-3 h-3" />
                              {selectedAccount.name}
                            </Badge>
                          )}
                          {selectedEnterprise && (
                            <Badge variant="outline" className="gap-1">
                              <Package className="w-3 h-3" />
                              {selectedEnterprise.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div
                    key="step2"
                    className="space-y-6 animate-fade-in"
                  >
                    <div className="bg-muted/20 rounded-xl p-6 space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Layers className="w-4 h-4 text-primary" />
                        <h3 className="font-medium text-foreground">
                          Scope Configuration
                        </h3>
                      </div>

                      <div className="space-y-2">
                         <Label htmlFor="workstream">Workstream <span className="text-destructive">*</span></Label>
                        <Select
                          value={formData.workstreamId}
                          onValueChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              workstreamId: value,
                              roleIds: [], // Reset roles when workstream changes
                            }))
                          }
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select workstream" />
                          </SelectTrigger>
                          <SelectContent>
                            {workstreams.map((ws) => (
                              <SelectItem key={ws.id} value={ws.id}>
                                <div className="flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-muted-foreground" />
                                  {ws.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                         {workstreams.length === 0 && (
                           <p className="text-xs text-muted-foreground">
                             No workstreams available for this account/enterprise
                           </p>
                         )}
                      </div>

                      <div className="space-y-2">
                         <Label htmlFor="product">Product <span className="text-destructive">*</span></Label>
                        <Select
                          value={formData.productId}
                          onValueChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              productId: value,
                              serviceId: "", // Reset service when product changes
                            }))
                          }
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProducts.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-muted-foreground" />
                                  {product.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                         {availableProducts.length === 0 && (
                           <p className="text-xs text-muted-foreground">
                             No licensed products available for this account/enterprise
                           </p>
                         )}
                      </div>

                      <div className="space-y-2">
                         <Label htmlFor="service">Service <span className="text-destructive">*</span></Label>
                        <Select
                          value={formData.serviceId}
                          onValueChange={(value) =>
                            setFormData((prev) => ({ ...prev, serviceId: value }))
                          }
                          disabled={!formData.productId}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue
                              placeholder={
                                formData.productId
                                  ? "Select service"
                                  : "Select a product first"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableServices.map((service) => (
                              <SelectItem key={service.id} value={service.id}>
                                <div className="flex items-center gap-2">
                                  <Server className="w-4 h-4 text-muted-foreground" />
                                  {service.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                         {formData.productId && availableServices.length === 0 && (
                           <p className="text-xs text-muted-foreground">
                             No services available for the selected product
                           </p>
                         )}
                      </div>
                       
                       <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 mt-4">
                         <AlertCircle className="w-4 h-4 flex-shrink-0" />
                         <p className="text-xs">
                           All context fields are required. The group will be scoped to the selected workstream, product, and service.
                         </p>
                       </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div
                    key="step3"
                    className="space-y-6 animate-fade-in"
                  >
                    <div className="bg-muted/20 rounded-xl p-6 space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          <h3 className="font-medium text-foreground">
                            Assign Roles
                          </h3>
                        </div>
                        {formData.roleIds.length > 0 && (
                          <Badge variant="secondary">
                            {formData.roleIds.length} selected
                          </Badge>
                        )}
                      </div>

                      {availableRoles.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">
                            No roles found for the selected context.
                          </p>
                          <p className="text-xs mt-1">
                            Create roles first or select a workstream.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                          {availableRoles.map((role: RoleWithPermissions) => {
                            const isExpanded = expandedRoles.has(role.id);
                            const hasPermissions = role.permissions && role.permissions.length > 0;
                            
                            return (
                              <div
                                key={role.id}
                                className={cn(
                                  "flex flex-col rounded-lg border transition-all duration-200",
                                  formData.roleIds.includes(role.id)
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-white border-border hover:bg-muted/30"
                                )}
                              >
                                {/* Role header - clickable for selection */}
                                <div 
                                  className="flex items-start gap-3 p-4 cursor-pointer"
                                  onClick={() => handleRoleToggle(role.id)}
                                >
                                  {/* Native checkbox to avoid Radix ref composition loop in Dialog+ScrollArea */}
                                  <input
                                    type="checkbox"
                                    checked={formData.roleIds.includes(role.id)}
                                    onChange={() => handleRoleToggle(role.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 mt-0.5 shrink-0 rounded-sm border border-primary accent-primary focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="font-medium text-sm">
                                        {role.name}
                                      </p>
                                      {hasPermissions && (
                                        <button
                                          type="button"
                                          onClick={(e) => toggleRoleExpand(role.id, e)}
                                          className={cn(
                                            "flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all duration-200",
                                            "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                            isExpanded && "bg-muted/50 text-foreground"
                                          )}
                                        >
                                          <span>{role.permissions.length} scope{role.permissions.length !== 1 ? "s" : ""}</span>
                                          <motion.div
                                            animate={{ rotate: isExpanded ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                          >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                          </motion.div>
                                        </button>
                                      )}
                                    </div>
                                    {role.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                        {role.description}
                                      </p>
                                    )}
                                    
                                    {/* Collapsed scope preview */}
                                    {hasPermissions && !isExpanded && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {role.permissions.slice(0, 3).map((perm) => (
                                          <Badge
                                            key={perm.menuKey}
                                            variant="secondary"
                                            className="text-[10px] px-1.5 py-0.5"
                                          >
                                            {perm.menuLabel}
                                          </Badge>
                                        ))}
                                        {role.permissions.length > 3 && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] px-1.5 py-0.5"
                                          >
                                            +{role.permissions.length - 3}
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* Empty scopes indicator */}
                                    {!hasPermissions && (
                                      <p className="text-xs text-muted-foreground/60 mt-1 italic">
                                        No scopes configured
                                      </p>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Expandable scopes section */}
                                <AnimatePresence>
                                  {isExpanded && hasPermissions && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2, ease: "easeInOut" }}
                                      className="overflow-hidden"
                                    >
                                      <div className="px-4 pb-4 pt-0">
                                        <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                                            <Shield className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-xs font-medium text-foreground">
                                              Configured Scopes
                                            </span>
                                          </div>
                                          <div className="space-y-2">
                                            {role.permissions.map((perm, idx) => (
                                              <motion.div
                                                key={perm.menuKey}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="flex items-center justify-between py-1.5 px-2 rounded-md bg-background/50 hover:bg-background transition-colors"
                                              >
                                                <span className="text-xs font-medium text-foreground">
                                                  {perm.menuLabel}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                  {perm.canView && (
                                                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                                      <Eye className="w-2.5 h-2.5" />
                                                      View
                                                    </span>
                                                  )}
                                                  {perm.canCreate && (
                                                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                                      <Plus className="w-2.5 h-2.5" />
                                                      Create
                                                    </span>
                                                  )}
                                                  {perm.canEdit && (
                                                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                                      <Pencil className="w-2.5 h-2.5" />
                                                      Edit
                                                    </span>
                                                  )}
                                                  {perm.canDelete && (
                                                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                                      <Trash2 className="w-2.5 h-2.5" />
                                                      Delete
                                                    </span>
                                                  )}
                                                  {!perm.canView && !perm.canCreate && !perm.canEdit && !perm.canDelete && (
                                                    <span className="text-[10px] text-muted-foreground italic">
                                                      No permissions
                                                    </span>
                                                  )}
                                                </div>
                                              </motion.div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t bg-muted/30 flex-shrink-0">
              {/* Progress Bar */}
              <div className="h-1 bg-muted">
                <div
                  className={cn(
                    "h-full transition-all duration-300",
                    isComplete ? "bg-emerald-500" : "bg-primary"
                  )}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-2">
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCurrentStep((prev) => prev - 1)}
                      className="gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClose}
                  >
                    Cancel
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  {isComplete && (
                    <span className="text-sm text-emerald-600 font-medium flex items-center gap-1 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      Ready to save!
                    </span>
                  )}

                  {currentStep < STEPS.length ? (
                    <Button
                      type="button"
                      onClick={() => setCurrentStep((prev) => prev + 1)}
                      disabled={!canProceed}
                      className="gap-2"
                    >
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!isComplete || createGroup.isPending}
                      className="gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                    >
                      {createGroup.isPending ? "Creating..." : "Create Group"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </DialogContent>
    </Dialog>
  );
}
