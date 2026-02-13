import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  Building2,
  Package,
  Wrench,
  Calendar,
  Users,
  Bell,
  User,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LicenseFormData } from "@/hooks/useLicenses";
import { useEnterprises } from "@/hooks/useEnterprises";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";

interface LicenseAddDialogProps {
  accountId: string;
  accountName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: LicenseFormData & { account_id: string }) => Promise<void>;
}

interface ExistingLicense {
  enterprise_id: string;
  product_id: string;
  service_id: string;
  end_date: string;
}

const emptyFormData: LicenseFormData = {
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

export function LicenseAddDialog({
  accountId,
  accountName,
  open,
  onOpenChange,
  onSave,
}: LicenseAddDialogProps) {
  const { enterprises } = useEnterprises();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<LicenseFormData>(emptyFormData);
  const [selectedEnterpriseName, setSelectedEnterpriseName] = useState<string>("");
  const [existingLicenses, setExistingLicenses] = useState<ExistingLicense[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Calculate form completion
  const formCompletion = useMemo(() => {
    const requiredFields = [
      formData.enterprise_id,
      formData.product_id,
      formData.service_id,
      formData.start_date,
      formData.end_date,
      formData.contact_full_name,
      formData.contact_email,
    ];
    const filledFields = requiredFields.filter(Boolean).length;
    return Math.round((filledFields / requiredFields.length) * 100);
  }, [formData]);

  const isFormValid = formCompletion === 100 && !duplicateWarning;

  // Fetch existing licenses for this account when dialog opens
  useEffect(() => {
    if (open && accountId) {
      const fetchExistingLicenses = async () => {
        if (isExternalApi()) {
          const { data, error } = await httpClient.get<{ enterprise_id: string; product_id: string; service_id: string; end_date: string }[]>(
            '/api/licenses',
            { params: { accountId } }
          );
          if (!error && data) {
            setExistingLicenses(data);
          }
        } else {
          const { data, error } = await supabase
            .from("account_licenses")
            .select("enterprise_id, product_id, service_id, end_date")
            .eq("account_id", accountId);
          
          if (!error && data) {
            setExistingLicenses(data);
          }
        }
      };
      fetchExistingLicenses();
    }
  }, [open, accountId]);

  // Check for duplicate active license whenever the combination changes
  useEffect(() => {
    if (formData.enterprise_id && formData.product_id && formData.service_id) {
      const today = new Date().toISOString().split("T")[0];
      const activeDuplicate = existingLicenses.find(
        (license) =>
          license.enterprise_id === formData.enterprise_id &&
          license.product_id === formData.product_id &&
          license.service_id === formData.service_id &&
          license.end_date >= today
      );
      
      if (activeDuplicate) {
        setDuplicateWarning(
          `An active license with this Enterprise, Product, and Service combination already exists (expires: ${new Date(activeDuplicate.end_date).toLocaleDateString()})`
        );
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  }, [formData.enterprise_id, formData.product_id, formData.service_id, existingLicenses]);

  // Get unique enterprise names
  const uniqueEnterpriseNames = useMemo(() => {
    const names = [...new Set(enterprises.map((e) => e.name))];
    return names.sort((a, b) => {
      // Keep "Global" first
      if (a === "Global") return -1;
      if (b === "Global") return 1;
      return a.localeCompare(b);
    });
  }, [enterprises]);

  // Get products available for the selected enterprise name
  const productsForEnterprise = useMemo(() => {
    if (!selectedEnterpriseName) return [];
    return enterprises
      .filter((e) => e.name === selectedEnterpriseName && e.product)
      .map((e) => ({
        enterpriseId: e.id,
        productId: e.product!.id,
        productName: e.product!.name,
        services: e.services,
      }));
  }, [enterprises, selectedEnterpriseName]);

  // Get services based on selected enterprise record
  const selectedEnterpriseRecord = useMemo(
    () => enterprises.find((e) => e.id === formData.enterprise_id),
    [enterprises, formData.enterprise_id]
  );

  const services = selectedEnterpriseRecord?.services || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent submission if there's an active duplicate
    if (duplicateWarning) {
      toast.error("Cannot create duplicate active license", {
        description: "A license with this combination already exists and is still valid."
      });
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave({ ...formData, account_id: accountId });
      setFormData(emptyFormData);
      setSelectedEnterpriseName("");
      setDuplicateWarning(null);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setFormData(emptyFormData);
    setSelectedEnterpriseName("");
    setDuplicateWarning(null);
    onOpenChange(false);
  };

  const handleEnterpriseNameChange = (name: string) => {
    setSelectedEnterpriseName(name);
    // Reset product and service when enterprise name changes
    setFormData({
      ...formData,
      enterprise_id: "",
      product_id: "",
      service_id: "",
    });
  };

  const handleProductChange = (productId: string) => {
    // Find the enterprise record that matches this product for the selected name
    const matchingEnterprise = productsForEnterprise.find(
      (p) => p.productId === productId
    );
    if (matchingEnterprise) {
      setFormData({
        ...formData,
        enterprise_id: matchingEnterprise.enterpriseId,
        product_id: productId,
        service_id: matchingEnterprise.services.length === 1 ? matchingEnterprise.services[0].id : "",
      });
    }
  };

  // Section completion states
  const isEnterpriseComplete = formData.enterprise_id && formData.product_id && formData.service_id;
  const isValidityComplete = formData.start_date && formData.end_date;
  const isContactComplete = formData.contact_full_name && formData.contact_email;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <VisuallyHidden>
          <DialogTitle>Add License</DialogTitle>
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
              <FileText className="w-6 h-6 text-primary" />
            </motion.div>
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Add License
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                </motion.span>
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Adding license to <span className="font-medium text-foreground">{accountName}</span>
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
                {/* Enterprise & Product Section */}
                <motion.div variants={sectionVariants} className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <motion.div
                      animate={isEnterpriseComplete ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      {isEnterpriseComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Building2 className="w-4 h-4" />
                      )}
                    </motion.div>
                    <span>Enterprise & Product</span>
                    {isEnterpriseComplete && (
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
                      "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-fluid-sm p-4 rounded-lg border bg-muted/20 transition-all duration-300",
                      isEnterpriseComplete && "border-emerald-200 bg-emerald-50/30"
                    )}
                  >
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Enterprise <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={selectedEnterpriseName}
                        onValueChange={handleEnterpriseNameChange}
                      >
                        <SelectTrigger className="bg-background hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Select enterprise" />
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueEnterpriseNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        Product <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.product_id}
                        onValueChange={handleProductChange}
                        disabled={!selectedEnterpriseName}
                      >
                        <SelectTrigger className="bg-background hover:border-primary/50 transition-colors">
                          <SelectValue placeholder={selectedEnterpriseName ? "Select product" : "Select enterprise first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {productsForEnterprise.map((p) => (
                            <SelectItem key={p.productId} value={p.productId}>
                              {p.productName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                        Service <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.service_id}
                        onValueChange={(value) => setFormData({ ...formData, service_id: value })}
                        disabled={!formData.product_id}
                      >
                        <SelectTrigger className="bg-background hover:border-primary/50 transition-colors">
                          <SelectValue placeholder={formData.product_id ? "Select service" : "Select product first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </motion.div>
                  
                  {/* Duplicate Warning */}
                  <AnimatePresence>
                    {duplicateWarning && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive"
                      >
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{duplicateWarning}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Validity & Users Section */}
                <motion.div variants={sectionVariants} className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <motion.div
                      animate={isValidityComplete ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      {isValidityComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Calendar className="w-4 h-4" />
                      )}
                    </motion.div>
                    <span>Validity Period & Users</span>
                    {isValidityComplete && (
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
                      "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-fluid-sm p-4 rounded-lg border bg-muted/20 transition-all duration-300",
                      isValidityComplete && "border-emerald-200 bg-emerald-50/30"
                    )}
                  >
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Start Date <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="bg-background hover:border-primary/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        End Date <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="bg-background hover:border-primary/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        Number of Users
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.number_of_users}
                        onChange={(e) =>
                          setFormData({ ...formData, number_of_users: parseInt(e.target.value) || 1 })
                        }
                        className="bg-background hover:border-primary/50 transition-colors"
                      />
                    </div>
                  </motion.div>
                </motion.div>

                {/* Contact Details Section */}
                <motion.div variants={sectionVariants} className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <motion.div
                      animate={isContactComplete ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      {isContactComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </motion.div>
                    <span>Contact Details</span>
                    {isContactComplete && (
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
                      "form-grid p-4 rounded-lg border bg-muted/20 transition-all duration-300",
                      isContactComplete && "border-emerald-200 bg-emerald-50/30"
                    )}
                  >
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Contact Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={formData.contact_full_name}
                        onChange={(e) => setFormData({ ...formData, contact_full_name: e.target.value })}
                        placeholder="Full name"
                        className="bg-background hover:border-primary/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Contact Email <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="email"
                        value={formData.contact_email}
                        onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                        placeholder="email@example.com"
                        className="bg-background hover:border-primary/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Phone (Optional)</Label>
                      <Input
                        value={formData.contact_phone}
                        onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                        placeholder="+1 234 567 8900"
                        className="bg-background hover:border-primary/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Department (Optional)</Label>
                      <Input
                        value={formData.contact_department}
                        onChange={(e) => setFormData({ ...formData, contact_department: e.target.value })}
                        placeholder="IT Department"
                        className="bg-background hover:border-primary/50 transition-colors"
                      />
                    </div>
                  </motion.div>
                </motion.div>

                {/* Renewal Settings Section */}
                <motion.div variants={sectionVariants} className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Bell className="w-4 h-4" />
                    </motion.div>
                    <span>Renewal Notifications</span>
                  </div>
                  <motion.div 
                    whileHover={{ scale: 1.005 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/20 border hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Enable Notifications</Label>
                      <p className="text-xs text-muted-foreground">
                        Send email reminders before license expires
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={formData.notice_days}
                          onChange={(e) =>
                            setFormData({ ...formData, notice_days: parseInt(e.target.value) || 30 })
                          }
                          className="w-16 h-8 text-center bg-background"
                        />
                        <span className="text-xs text-muted-foreground">days before</span>
                      </div>
                      <Switch
                        checked={formData.renewal_notify}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, renewal_notify: checked })
                        }
                      />
                    </div>
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
                <Button type="button" variant="outline" onClick={handleClose}>
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
                  disabled={isSaving || !!duplicateWarning} 
                  className={cn(
                    "gap-2 transition-all duration-300",
                    isFormValid && "bg-emerald-600 hover:bg-emerald-700"
                  )}
                >
                  <Plus className="w-4 h-4" />
                  {isSaving ? "Adding..." : "Add License"}
                </Button>
              </motion.div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
