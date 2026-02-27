import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { 
  Shield, 
  Sparkles, 
  Lock, 
  Settings2,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Box,
  Wrench,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useCreateRole, useCheckRoleNameExists } from "@/hooks/useRoles";
import { useCreateRolePermissions, CreateRolePermissionData } from "@/hooks/useRolePermissions";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { RoleScopesModal, MenuPermission } from "./RoleScopesModal";
import { WorkstreamMultiSelect } from "./WorkstreamMultiSelect";

interface AddRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  { id: 1, title: "Details", icon: FileText, description: "Role info" },
  { id: 2, title: "Context", icon: Layers, description: "Workstream & product" },
  { id: 3, title: "Scopes", icon: Lock, description: "Permissions" },
];

export function AddRoleDialog({ open, onOpenChange }: AddRoleDialogProps) {
  const createRole = useCreateRole();
  const createRolePermissions = useCreateRolePermissions();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  const { workstreams = [] } = useWorkstreams(selectedAccount?.id, selectedEnterprise?.id);
  
  // Fetch licensed products and services for the selected account/enterprise
  const { data: licensedData = { products: [], services: [] } } = useQuery({
    queryKey: ["licensed-products-services", selectedAccount?.id, selectedEnterprise?.id],
    queryFn: async () => {
      if (!selectedAccount?.id || !selectedEnterprise?.id) {
        return { products: [], services: [] };
      }

      // Fetch licenses for the selected account and enterprise
      const { data: licenses, error: licensesError } = await supabase
        .from("account_licenses")
        .select("product_id, service_id")
        .eq("account_id", selectedAccount.id)
        .eq("enterprise_id", selectedEnterprise.id)
        .gte("end_date", new Date().toISOString().split("T")[0]); // Only active licenses

      if (licensesError) throw licensesError;

      if (!licenses || licenses.length === 0) {
        return { products: [], services: [] };
      }

      // Get unique product and service IDs
      const productIds = [...new Set(licenses.map((l) => l.product_id))];
      const serviceIds = [...new Set(licenses.map((l) => l.service_id))];

      // Fetch products
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("*")
        .in("id", productIds)
        .order("name");

      if (productsError) throw productsError;

      // Fetch services
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("*")
        .in("id", serviceIds)
        .order("name");

      if (servicesError) throw servicesError;

      return {
        products: products || [],
        services: services || [],
      };
    },
    enabled: Boolean(selectedAccount?.id && selectedEnterprise?.id),
  });

  const products = licensedData.products;
  const services = licensedData.services;

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [showScopesModal, setShowScopesModal] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    workstreamIds: [] as string[],
    productId: "",
    serviceId: "",
  });

  const [permissions, setPermissions] = useState<MenuPermission[]>([]);

  // Check for duplicate role name within the same account + enterprise combination
  const { isDuplicate: isNameDuplicate, isChecking: isCheckingName } = useCheckRoleNameExists(
    formData.name,
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  // Step validation
  const stepValidation = useMemo(() => ({
    1: Boolean(formData.name.trim() && !isNameDuplicate),
    2: Boolean(formData.workstreamIds.length > 0 && formData.productId && formData.serviceId), // Required fields
    3: true, // Optional but recommended
  }), [formData.name, isNameDuplicate, formData.workstreamIds.length, formData.productId, formData.serviceId]);

  const isCurrentStepValid = stepValidation[currentStep as keyof typeof stepValidation];
  const isAllValid = formData.name.trim().length > 0 && !isNameDuplicate && 
    Boolean(formData.workstreamIds.length > 0 && formData.productId && formData.serviceId);

  const handleSubmit = async () => {
    if (!isAllValid || !selectedAccount?.id || !selectedEnterprise?.id) return;

    try {
      const result = await createRole.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        permissions: permissions.reduce((acc, p) => {
          let count = 0;
          if (p.canCreate) count++;
          if (p.canView) count++;
          if (p.canEdit) count++;
          if (p.canDelete) count++;
          return acc + count;
        }, 0),
        accountId: selectedAccount.id,
        enterpriseId: selectedEnterprise.id,
        workstreamIds: formData.workstreamIds.length > 0 ? formData.workstreamIds : undefined,
        productId: formData.productId || undefined,
        serviceId: formData.serviceId || undefined,
      });

      // Create role permissions if any were configured
      if (result && permissions.length > 0) {
        const permissionsToCreate: CreateRolePermissionData[] = permissions.map((p) => ({
          roleId: result.id,
          menuKey: p.menuKey,
          menuLabel: p.menuLabel,
          isVisible: p.isVisible,
          tabs: p.tabs,
          canCreate: p.canCreate,
          canView: p.canView,
          canEdit: p.canEdit,
          canDelete: p.canDelete,
        }));

        await createRolePermissions.mutateAsync(permissionsToCreate);
      }

      handleClose();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      description: "",
      workstreamIds: [],
      productId: "",
      serviceId: "",
    });
    setPermissions([]);
    setCurrentStep(1);
    setDirection(1);
    onOpenChange(false);
  };

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const nextStep = () => {
    if (currentStep < 3 && isCurrentStepValid) {
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
                <div className="w-8 h-0.5 mx-1 relative">
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
            <Shield className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Role Details</h3>
            <p className="text-sm text-muted-foreground">Define the basic information for this role</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="space-y-4"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-1.5">
            Role Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Developer, Project Manager, Viewer"
            className={cn(
              "transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary",
              isNameDuplicate && "border-destructive focus:border-destructive focus:ring-destructive/20"
            )}
          />
          {isNameDuplicate && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              A role with this name already exists for this account and enterprise
            </p>
          )}
          {isCheckingName && formData.name.trim() && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking availability...
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Describe the responsibilities and access level for this role..."
            rows={4}
            className="resize-none transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
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
        <span className="text-sm text-muted-foreground">
          This role will be scoped to:
        </span>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
          {selectedAccount?.name || "Account"} / {selectedEnterprise?.name || "Enterprise"}
        </Badge>
      </motion.div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
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
            <Layers className="w-8 h-8" />
          </motion.div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Context Assignment</h3>
            <p className="text-sm text-muted-foreground">Link this role to specific workstream, product, or service</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-fluid-sm">
        <motion.div
          className="space-y-2"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Label className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" />
            Workstreams <span className="text-destructive">*</span>
          </Label>
          <WorkstreamMultiSelect
            accountId={selectedAccount?.id}
            enterpriseId={selectedEnterprise?.id}
            selectedIds={formData.workstreamIds}
            onSelectionChange={(ids) => setFormData((prev) => ({ ...prev, workstreamIds: ids }))}
            autoSelectDefault={false}
          />
        </motion.div>

        <motion.div
          className="space-y-2"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Label className="flex items-center gap-2">
            <Box className="w-4 h-4 text-primary" />
             Product <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.productId}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, productId: value }))}
          >
            <SelectTrigger>
               <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
           {products.length === 0 && (
             <p className="text-xs text-muted-foreground">
               No licensed products available for this account/enterprise
             </p>
           )}
        </motion.div>

        <motion.div
          className="space-y-2"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Label className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
             Service <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.serviceId}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, serviceId: value }))}
          >
            <SelectTrigger>
               <SelectValue placeholder="Select service" />
            </SelectTrigger>
            <SelectContent>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
           {services.length === 0 && (
             <p className="text-xs text-muted-foreground">
               No licensed services available for this account/enterprise
             </p>
           )}
        </motion.div>
      </div>

       <motion.div
         className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700"
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         transition={{ delay: 0.5 }}
       >
         <AlertCircle className="w-4 h-4 flex-shrink-0" />
         <p className="text-xs">
           All context fields are required. The role will be scoped to the selected workstream, product, and service.
         </p>
       </motion.div>
    </div>
  );

  const renderStep3 = () => {
    const totalPermissions = permissions.reduce((acc, p) => {
      let count = 0;
      if (p.canCreate) count++;
      if (p.canView) count++;
      if (p.canEdit) count++;
      if (p.canDelete) count++;
      return acc + count;
    }, 0);

    return (
      <div className="space-y-6">
        <motion.div 
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/5 via-primary/10 to-primary/5 p-6 border border-primary/10"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-center gap-4">
            <motion.div 
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg shadow-emerald-500/30"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Lock className="w-8 h-8" />
            </motion.div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Scope Configuration</h3>
              <p className="text-sm text-muted-foreground">Define menu visibility and CRUD permissions</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="flex flex-col items-center justify-center p-8 rounded-xl bg-muted/30 border border-dashed border-muted-foreground/30"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {permissions.length > 0 ? (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Badge className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  <Shield className="w-3.5 h-3.5 mr-1.5" />
                  {permissions.length} Menus Configured
                </Badge>
                <Badge variant="outline" className="px-3 py-1.5">
                  {totalPermissions} Permissions
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {permissions.map((p) => (
                  <Badge key={p.menuKey} variant="secondary" className="text-xs">
                    {p.menuLabel}
                  </Badge>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowScopesModal(true)}
                className="mt-4"
              >
                <Settings2 className="w-4 h-4 mr-2" />
                Edit Scopes
              </Button>
            </div>
          ) : (
            <>
              <motion.div
                className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4"
                whileHover={{ scale: 1.05 }}
              >
                <Lock className="w-8 h-8 text-muted-foreground" />
              </motion.div>
              <h4 className="text-sm font-medium text-foreground mb-1">No Scopes Configured</h4>
              <p className="text-xs text-muted-foreground text-center mb-4 max-w-xs">
                Configure which menus, tabs, and actions users with this role can access.
              </p>
              <Button
                type="button"
                variant="default"
                onClick={() => setShowScopesModal(true)}
              >
                <Settings2 className="w-4 h-4 mr-2" />
                Configure Scopes
              </Button>
            </>
          )}
        </motion.div>

        <motion.p
          className="text-xs text-muted-foreground text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Click the button above to open the scope configuration modal.
        </motion.p>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
          <VisuallyHidden>
            <DialogTitle>Add New Role</DialogTitle>
          </VisuallyHidden>

          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-8 py-6 flex-shrink-0">
            <div className="flex items-center gap-4">
              <motion.div 
                className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
              >
                <Shield className="w-6 h-6 text-primary" />
              </motion.div>
              <div>
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  Add New Role
                  <Sparkles className="w-4 h-4 text-primary" />
                </h2>
                <p className="text-sm text-muted-foreground">
                  Create a role with specific access and permissions
                </p>
              </div>
            </div>
          </div>

          {/* Step Indicator */}
          {renderStepIndicator()}

          {/* Form Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
            <div className="transition-opacity duration-200">
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t p-6 bg-muted/30 flex-shrink-0">
            <div className="flex gap-2">
              {currentStep > 1 && (
                <Button type="button" variant="outline" onClick={prevStep}>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              )}
            </div>

            {/* Progress Bar */}
            <div className="flex-1 mx-6">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    isAllValid ? "bg-emerald-500" : "bg-primary"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${(currentStep / STEPS.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground mt-1">
                Step {currentStep} of {STEPS.length}
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              {currentStep < 3 ? (
                <Button type="button" onClick={nextStep} disabled={!isCurrentStepValid}>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isAllValid || createRole.isPending}
                >
                  {createRole.isPending ? "Creating..." : "Create Role"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Only render RoleScopesModal when it's open to prevent ref composition conflicts */}
      {showScopesModal && (
        <RoleScopesModal
          open={showScopesModal}
          onOpenChange={setShowScopesModal}
          permissions={permissions}
          onSave={setPermissions}
        />
      )}
    </>
  );
}
