import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { toast } from "sonner";
import { X, Building2, Package, Wrench, Plus, Check, Sparkles, Save, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLOBAL_ENTERPRISE_ID } from "@/contexts/EnterpriseContext";
import { productsService, servicesService } from "@/lib/api/services/products.service";
import { enterprisesService } from "@/lib/api/services/enterprises.service";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { supabase } from "@/integrations/supabase/client";

const GLOBAL_ITEM_ID = "00000000-0000-0000-0000-000000000001";

interface Product {
  id: string;
  name: string;
  description: string | null;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
}

interface EnterpriseWithDetails {
  id: string;
  name: string;
  created_at: string;
  product: {
    id: string;
    name: string;
  } | null;
  services: {
    id: string;
    name: string;
  }[];
}

interface EditEnterpriseFormProps {
  enterprise: EnterpriseWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ExistingEnterprise {
  id: string;
  name: string;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
} as const;

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 30 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { type: "spring" as const, stiffness: 400, damping: 25 }
  }
};

export function EditEnterpriseForm({ enterprise, open, onOpenChange, onSuccess }: EditEnterpriseFormProps) {
  const isGlobalEnterprise = enterprise.id === GLOBAL_ENTERPRISE_ID;
  const [enterpriseName, setEnterpriseName] = useState(enterprise.name);
  const [nameError, setNameError] = useState("");
  const [existingEnterprises, setExistingEnterprises] = useState<ExistingEnterprise[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(enterprise.product?.id || null);
  const [selectedServices, setSelectedServices] = useState<string[]>(
    enterprise.services.map((s) => s.id)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [showNewService, setShowNewService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isCreatingService, setIsCreatingService] = useState(false);

  // Calculate form completion
  const formCompletion = useMemo(() => {
    const steps = [
      enterpriseName.trim().length > 0 && !nameError,
      selectedProduct !== null,
      selectedServices.length > 0,
    ];
    const completed = steps.filter(Boolean).length;
    return Math.round((completed / steps.length) * 100);
  }, [enterpriseName, nameError, selectedProduct, selectedServices]);

  const isFormValid = formCompletion === 100;

  useEffect(() => {
    if (open) {
      fetchData();
      setEnterpriseName(enterprise.name);
      setSelectedProduct(enterprise.product?.id || null);
      setSelectedServices(enterprise.services.map((s) => s.id));
    }
  }, [open, enterprise]);

  const fetchData = async () => {
    setIsFetching(true);
    try {
      if (isExternalApi()) {
        const [productsRes, servicesRes, enterprisesRes] = await Promise.all([
          productsService.getAll(),
          servicesService.getAll(),
          httpClient.get<{ id: string; name: string }[]>("/enterprises"),
        ]);

        if (isGlobalEnterprise) {
          setProducts((productsRes.data || []).map(p => ({ id: p.id, name: p.name, description: p.description })));
          setServices((servicesRes.data || []).map(s => ({ id: s.id, name: s.name, description: s.description })));
        } else {
          setProducts((productsRes.data || []).filter(p => p.id !== GLOBAL_ITEM_ID).map(p => ({ id: p.id, name: p.name, description: p.description })));
          setServices((servicesRes.data || []).filter(s => s.id !== GLOBAL_ITEM_ID).map(s => ({ id: s.id, name: s.name, description: s.description })));
        }
        setExistingEnterprises(enterprisesRes.data || []);
      } else {
        const [productsRes, servicesRes, enterprisesRes] = await Promise.all([
          supabase.from("products").select("*").order("name"),
          supabase.from("services").select("*").order("name"),
          supabase.from("enterprises").select("id, name"),
        ]);

        if (productsRes.error) throw productsRes.error;
        if (servicesRes.error) throw servicesRes.error;

        if (isGlobalEnterprise) {
          setProducts(productsRes.data || []);
          setServices(servicesRes.data || []);
        } else {
          setProducts((productsRes.data || []).filter(p => p.id !== GLOBAL_ITEM_ID));
          setServices((servicesRes.data || []).filter(s => s.id !== GLOBAL_ITEM_ID));
        }
        setExistingEnterprises(enterprisesRes.data || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsFetching(false);
    }
  };

  const isDuplicateName = (name: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    return existingEnterprises.some(
      (ent) => ent.name.toLowerCase() === trimmedName && ent.id !== enterprise.id
    );
  };

  const validateName = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase() === "global" && !isGlobalEnterprise) {
      return "'Global' is a reserved enterprise name";
    }
    if (trimmed.length > 100) {
      return "Name must be less than 100 characters";
    }
    if (isDuplicateName(trimmed)) {
      return "This enterprise name already exists";
    }
    return "";
  };

  const handleNameChange = (value: string) => {
    setEnterpriseName(value);
    setNameError(validateName(value));
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) return;

    setIsCreatingProduct(true);
    try {
      const { data, error } = await productsService.create(newProductName.trim());
      if (error) throw new Error(error.message);
      if (data) {
        setProducts((prev) => [...prev, { id: data.id, name: data.name, description: data.description }]);
        setSelectedProduct(data.id);
      }
      setNewProductName("");
      setShowNewProduct(false);
      toast.success("Product created successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to create product");
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const handleCreateService = async () => {
    if (!newServiceName.trim()) return;

    setIsCreatingService(true);
    try {
      const { data, error } = await servicesService.create(newServiceName.trim());
      if (error) throw new Error(error.message);
      if (data) {
        setServices((prev) => [...prev, { id: data.id, name: data.name, description: data.description }]);
        setSelectedServices((prev) => [...prev, data.id]);
      }
      setNewServiceName("");
      setShowNewService(false);
      toast.success("Service created successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to create service");
    } finally {
      setIsCreatingService(false);
    }
  };

  const handleServiceToggle = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateName(enterpriseName);
    if (!enterpriseName.trim()) {
      toast.error("Please enter an enterprise name");
      return;
    }

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!selectedProduct) {
      toast.error("Please select a product");
      return;
    }

    if (selectedServices.length === 0) {
      toast.error("Please select at least one service");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await enterprisesService.update(enterprise.id, {
        name: enterpriseName.trim(),
        productId: selectedProduct,
        serviceIds: selectedServices,
      });

      if (error) throw new Error(error.message);

      toast.success("Enterprise updated successfully");

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating enterprise:", error);
      toast.error(error.message || "Failed to update enterprise");
    } finally {
      setIsLoading(false);
    }
  };

  // Section completion states
  const isNameComplete = enterpriseName.trim().length > 0 && !nameError;
  const isProductComplete = selectedProduct !== null;
  const isServicesComplete = selectedServices.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <VisuallyHidden>
          <DialogTitle>Edit Enterprise</DialogTitle>
        </VisuallyHidden>

        {/* Header with animated gradient */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-8 py-6 flex-shrink-0 relative overflow-hidden"
        >
          {/* Animated background shimmer */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          <div className="flex items-center gap-4 relative z-10">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shadow-lg"
            >
              <Building2 className="w-6 h-6 text-primary" />
            </motion.div>
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Edit Enterprise
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                </motion.span>
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Update <span className="font-medium text-foreground">{enterprise.name}</span> details
              </p>
            </div>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <AnimatePresence mode="wait">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid gap-fluid-md"
              >
                {/* Enterprise Name Section */}
                <motion.div variants={sectionVariants} className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <motion.div
                      animate={isNameComplete ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      {isNameComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Building2 className="w-4 h-4" />
                      )}
                    </motion.div>
                    <span>Enterprise Details</span>
                    {isNameComplete && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-xs text-emerald-500 font-normal"
                      >
                        ✓ Complete
                      </motion.span>
                    )}
                  </div>
                  <motion.div 
                    whileHover={{ scale: 1.005 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className={cn(
                      "p-4 rounded-lg border bg-muted/20 space-y-2 transition-all duration-300",
                      isNameComplete && "border-emerald-200 bg-emerald-50/30"
                    )}
                  >
                    <Label htmlFor="enterpriseName" className="text-sm font-medium">
                      Enterprise Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="enterpriseName"
                      placeholder="Enter enterprise name"
                      value={enterpriseName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className={cn(
                        "bg-background hover:border-primary/50 transition-colors",
                        nameError && "border-destructive focus:border-destructive focus:ring-destructive/20"
                      )}
                      maxLength={100}
                    />
                    {nameError && (
                      <motion.p 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-destructive"
                      >
                        {nameError}
                      </motion.p>
                    )}
                  </motion.div>
                </motion.div>

                {/* Product Selection Section */}
                <motion.div variants={sectionVariants} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <motion.div
                        animate={isProductComplete ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        {isProductComplete ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Package className="w-4 h-4" />
                        )}
                      </motion.div>
                      <span>Product</span>
                      <span className="text-xs font-normal">(select one)</span>
                      {isProductComplete && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-xs text-emerald-500 font-normal"
                        >
                          ✓ Complete
                        </motion.span>
                      )}
                    </div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1 text-primary hover:text-primary/80 hover:bg-primary/5"
                        onClick={() => setShowNewProduct(!showNewProduct)}
                      >
                        <Plus className={cn("w-3 h-3 transition-transform duration-200", showNewProduct && "rotate-45")} />
                        Create New
                      </Button>
                    </motion.div>
                  </div>

                  <motion.div 
                    whileHover={{ scale: 1.005 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className={cn(
                      "p-4 rounded-lg border bg-muted/20 space-y-4 transition-all duration-300",
                      isProductComplete && "border-emerald-200 bg-emerald-50/30"
                    )}
                  >
                    <AnimatePresence>
                      {showNewProduct && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex gap-2 p-3 bg-background rounded-lg border border-primary/40"
                        >
                          <Input
                            autoFocus
                            placeholder="New product name"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            className="bg-background"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateProduct}
                            disabled={isCreatingProduct || !newProductName.trim()}
                          >
                            {isCreatingProduct ? "..." : "Add"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowNewProduct(false);
                              setNewProductName("");
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {isFetching ? (
                      <div className="grid grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                        ))}
                      </div>
                    ) : (
                      <motion.div 
                        className="grid grid-cols-2 gap-3"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        {products.map((product, index) => {
                          const isSelected = selectedProduct === product.id;
                          return (
                            <motion.div
                              key={product.id}
                              variants={cardVariants}
                              custom={index}
                              whileHover={{ scale: 1.02, y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-background",
                                isSelected
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md"
                                  : "hover:border-primary/50 hover:shadow-sm"
                              )}
                              onClick={() => setSelectedProduct(product.id)}
                            >
                              <motion.div
                                animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                                className={cn(
                                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground"
                                )}
                              >
                                {isSelected && (
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                )}
                              </motion.div>
                              <span className="text-sm font-medium">{product.name}</span>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </motion.div>
                </motion.div>

                {/* Services Selection Section */}
                <motion.div variants={sectionVariants} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <motion.div
                        animate={isServicesComplete ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        {isServicesComplete ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Wrench className="w-4 h-4" />
                        )}
                      </motion.div>
                      <span>Services</span>
                      <span className="text-xs font-normal">(select multiple)</span>
                      {isServicesComplete && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-xs text-emerald-500 font-normal"
                        >
                          ✓ {selectedServices.length} selected
                        </motion.span>
                      )}
                    </div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1 text-primary hover:text-primary/80 hover:bg-primary/5"
                        onClick={() => setShowNewService(!showNewService)}
                      >
                        <Plus className={cn("w-3 h-3 transition-transform duration-200", showNewService && "rotate-45")} />
                        Create New
                      </Button>
                    </motion.div>
                  </div>

                  <motion.div 
                    whileHover={{ scale: 1.005 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className={cn(
                      "p-4 rounded-lg border bg-muted/20 space-y-4 transition-all duration-300",
                      isServicesComplete && "border-emerald-200 bg-emerald-50/30"
                    )}
                  >
                    <AnimatePresence>
                      {showNewService && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex gap-2 p-3 bg-background rounded-lg border border-primary/40"
                        >
                          <Input
                            autoFocus
                            placeholder="New service name"
                            value={newServiceName}
                            onChange={(e) => setNewServiceName(e.target.value)}
                            className="bg-background"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateService}
                            disabled={isCreatingService || !newServiceName.trim()}
                          >
                            {isCreatingService ? "..." : "Add"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowNewService(false);
                              setNewServiceName("");
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {isFetching ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                        ))}
                      </div>
                    ) : (
                      <motion.div 
                        className="grid grid-cols-2 md:grid-cols-3 gap-3"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        {services.map((service, index) => {
                          const isSelected = selectedServices.includes(service.id);
                          return (
                            <motion.div
                              key={service.id}
                              variants={cardVariants}
                              custom={index}
                              whileHover={{ scale: 1.02, y: -2 }}
                              whileTap={{ scale: 0.98 }}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-background",
                                isSelected
                                  ? "border-primary bg-primary/5 shadow-md"
                                  : "hover:border-primary/50 hover:shadow-sm"
                              )}
                              onClick={() => handleServiceToggle(service.id)}
                            >
                              <motion.div
                                animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                                className={cn(
                                  "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground"
                                )}
                              >
                                {isSelected && (
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                )}
                              </motion.div>
                              <span className="text-sm font-medium flex-1">
                                {service.name}
                              </span>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Enhanced Footer with Progress */}
          <div className="border-t bg-muted/30 flex-shrink-0">
            {/* Animated Progress Bar */}
            <div className="h-1 bg-muted/50 overflow-hidden">
              <motion.div
                className={cn(
                  "h-full transition-colors duration-500",
                  isFormValid ? "bg-emerald-500" : "bg-primary"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${formCompletion}%` }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
              />
            </div>
            
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {isFormValid ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1.5 text-emerald-600"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="font-medium">Ready to save!</span>
                    </motion.div>
                  ) : (
                    <>
                      <Circle className="w-3 h-3" />
                      <span>{formCompletion}% complete</span>
                    </>
                  )}
                </div>
              </div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button 
                  type="submit" 
                  disabled={isLoading} 
                  className={cn(
                    "gap-2 transition-all duration-300",
                    isFormValid && "bg-emerald-600 hover:bg-emerald-700"
                  )}
                >
                  <Save className="w-4 h-4" />
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </motion.div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
