import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Shield, Sparkles, Check, ChevronRight, ChevronLeft, Settings2, FileText, Layers, AlertCircle, Loader2, Wrench } from "lucide-react";
import { useUpdateRole, useCheckRoleNameExists, Role } from "@/hooks/useRoles";
import { useUpdateRolePermissions, RolePermission } from "@/hooks/useRolePermissions";
import { RoleScopesModal, MenuPermission } from "./RoleScopesModal";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { cn } from "@/lib/utils";
import { WorkstreamMultiSelect } from "./WorkstreamMultiSelect";

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
}

const steps = [
  { id: 1, title: "Details", icon: FileText },
  { id: 2, title: "Context", icon: Layers },
  { id: 3, title: "Scopes", icon: Settings2 },
];

export function EditRoleDialog({ open, onOpenChange, role }: EditRoleDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const updateRole = useUpdateRole();
  const updatePermissions = useUpdateRolePermissions();


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

  // Fetch existing role permissions
  const { data: existingPermissions = [] } = useQuery({
    queryKey: ["role-permissions", role?.id],
    queryFn: async () => {
      if (!role?.id) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .eq("role_id", role.id);
      if (error) throw error;
      
      // Transform to MenuPermission format
      return (data || []).map((p) => ({
        menuKey: p.menu_key,
        menuLabel: p.menu_label,
        isVisible: p.is_visible ?? false,
        tabs: (p.tabs as { key: string; label: string; isVisible: boolean }[]) || [],
        canCreate: p.can_create ?? false,
        canView: p.can_view ?? false,
        canEdit: p.can_edit ?? false,
        canDelete: p.can_delete ?? false,
      })) as MenuPermission[];
    },
    enabled: Boolean(role?.id) && open,
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [showScopesModal, setShowScopesModal] = useState(false);
  const [scopePermissions, setScopePermissions] = useState<MenuPermission[]>([]);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    workstreamIds: [] as string[],
    productId: "",
    serviceId: "",
  });

  // Check for duplicate role name within the same account + enterprise combination (excluding current role)
  const { isDuplicate: isNameDuplicate, isChecking: isCheckingName } = useCheckRoleNameExists(
    formData.name,
    selectedAccount?.id,
    selectedEnterprise?.id,
    role?.id // Exclude current role when editing
  );

  // Reset form when role changes
  useEffect(() => {
    if (role && open) {
      setFormData({
        name: role.name,
        description: role.description || "",
        workstreamIds: role.workstreamIds || (role.workstreamId ? [role.workstreamId] : []),
        productId: role.productId || "",
        serviceId: role.serviceId || "",
      });
      setCurrentStep(1);
      setDirection(1);
    }
  }, [role, open]);

  // Load existing permissions when dialog opens
  useEffect(() => {
    if (existingPermissions.length > 0 && open) {
      setScopePermissions(existingPermissions);
    }
  }, [existingPermissions, open]);

  const handleNext = () => {
    if (currentStep < 3) {
      setDirection(1);
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!role || isNameDuplicate || !formData.name.trim()) return;

    try {
      await updateRole.mutateAsync({
        id: role.id,
        data: {
          name: formData.name,
          description: formData.description || undefined,
          permissions: role.permissions,
          workstreamIds: formData.workstreamIds.length > 0 ? formData.workstreamIds : undefined,
          productId: formData.productId || undefined,
          serviceId: formData.serviceId || undefined,
        },
      });

      // Update permissions if any were configured
      if (scopePermissions.length > 0) {
        await updatePermissions.mutateAsync({
          roleId: role.id,
          permissions: scopePermissions.map((p) => ({
            roleId: role.id,
            menuKey: p.menuKey,
            menuLabel: p.menuLabel,
            isVisible: p.isVisible,
            tabs: p.tabs,
            canCreate: p.canCreate,
            canView: p.canView,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
          })),
        });
      }

      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setCurrentStep(1);
    setFormData({
      name: "",
      description: "",
      workstreamIds: [],
      productId: "",
      serviceId: "",
    });
    setScopePermissions([]);
    onOpenChange(false);
  };

  const handleScopesSave = (permissions: MenuPermission[]) => {
    setScopePermissions(permissions);
    setShowScopesModal(false);
  };

  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        return formData.name.trim().length > 0 && !isNameDuplicate;
      case 2:
        return Boolean(formData.workstreamIds.length > 0 && formData.productId && formData.serviceId); // Required fields
      case 3:
        return true; // Scopes are optional
      default:
        return false;
    }
  };

  const isValid = isStepValid(1) && isStepValid(2);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 100 : -100, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -100 : 100, opacity: 0 }),
  };

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
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            <div className="bg-muted/20 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="font-medium text-foreground">Role Details</h3>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Role Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter role name"
                  required
                  className={cn(
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
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter role description"
                  rows={3}
                />
              </div>
            </div>
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
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            <div className="bg-muted/20 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-primary" />
                <h3 className="font-medium text-foreground">Context Assignment</h3>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-primary" />
                  Workstreams <span className="text-destructive">*</span>
                </Label>
                <WorkstreamMultiSelect
                  accountId={selectedAccount?.id}
                  enterpriseId={selectedEnterprise?.id}
                  selectedIds={formData.workstreamIds}
                  onSelectionChange={(ids) => setFormData(prev => ({ ...prev, workstreamIds: ids }))}
                  autoSelectDefault={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product">Product <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.productId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, productId: value }))}
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
              </div>

              <div className="space-y-2">
                 <Label htmlFor="service">Service <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.serviceId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, serviceId: value }))}
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
              </div>
               
               <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 mt-4">
                 <AlertCircle className="w-4 h-4 flex-shrink-0" />
                 <p className="text-xs">
                   All context fields are required.
                 </p>
               </div>
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
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            <div className="bg-muted/20 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-4 h-4 text-primary" />
                <h3 className="font-medium text-foreground">Role Scopes</h3>
              </div>

              <p className="text-sm text-muted-foreground">
                Configure menu visibility and CRUD permissions for this role.
              </p>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowScopesModal(true)}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Configure Scopes
                </span>
                {scopePermissions.length > 0 && (
                  <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                    {scopePermissions.filter(p => p.isVisible).length} menus configured
                  </span>
                )}
              </Button>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
          <VisuallyHidden>
            <DialogTitle>Edit Role</DialogTitle>
          </VisuallyHidden>

          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-8 py-6 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  Edit Role
                  <Sparkles className="w-4 h-4 text-primary" />
                </h2>
                <p className="text-sm text-muted-foreground">
                  Update role details and permissions
                </p>
              </div>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-between mt-6">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                        currentStep === step.id
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                          : currentStep > step.id
                          ? "bg-primary/80 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {currentStep > step.id ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <step.icon className="w-5 h-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs mt-1 font-medium",
                        currentStep === step.id
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "w-16 h-0.5 mx-2",
                        currentStep > step.id ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Form Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
            <div className="transition-opacity duration-200">
              {renderStepContent()}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between border-t p-6 bg-muted/30 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={currentStep === 1 ? handleClose : handleBack}
            >
              {currentStep === 1 ? (
                "Cancel"
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </>
              )}
            </Button>

            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!isStepValid(currentStep)}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!isValid || updateRole.isPending}
              >
                {updateRole.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Only render RoleScopesModal when it's open to prevent ref composition conflicts */}
      {showScopesModal && (
        <RoleScopesModal
          open={showScopesModal}
          onOpenChange={setShowScopesModal}
          permissions={scopePermissions}
          onSave={handleScopesSave}
        />
      )}
    </>
  );
}
