import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  Edit,
  FileText,
  Calendar,
  Users,
  Bell,
  BellOff,
  Save,
  X,
  Building2,
  Package,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLicenses, LicenseFormData, LicenseWithDetails } from "@/hooks/useLicenses";
import { useEnterprises } from "@/hooks/useEnterprises";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface LicenseManagerProps {
  accountId: string;
  accountName: string;
  onLicenseCountChange?: (count: number) => void;
}

interface LicenseRowFormData extends LicenseFormData {
  id?: string;
  isNew?: boolean;
  enterprise_name?: string; // For grouping by unique enterprise name
}

const emptyLicenseRow: LicenseRowFormData = {
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
  isNew: true,
};

export function LicenseManager({ accountId, accountName, onLicenseCountChange }: LicenseManagerProps) {
  const { licenses, isLoading, createLicense, updateLicense, deleteLicense } = useLicenses(accountId);
  const { enterprises, isLoading: enterprisesLoading } = useEnterprises();
  const [editingLicense, setEditingLicense] = useState<LicenseWithDetails | null>(null);
  const [deletingLicense, setDeletingLicense] = useState<LicenseWithDetails | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formRows, setFormRows] = useState<LicenseRowFormData[]>([{ ...emptyLicenseRow }]);
  const [isSaving, setIsSaving] = useState(false);

  // Notify parent of license count changes
  useEffect(() => {
    onLicenseCountChange?.(licenses.length);
  }, [licenses.length, onLicenseCountChange]);

  // Get unique enterprise names
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

  // Get services for selected enterprise (by ID)
  const getEnterpriseServices = (enterpriseId: string) => {
    const enterprise = enterprises.find((e) => e.id === enterpriseId);
    return enterprise?.services || [];
  };

  // When enterprise name is selected
  const handleEnterpriseNameChange = (index: number, enterpriseName: string) => {
    const products = getProductsForEnterpriseName(enterpriseName);
    setFormRows((prev) => {
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
    setFormRows((prev) => {
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

  const handleRowChange = (index: number, field: keyof LicenseRowFormData, value: any) => {
    setFormRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addRow = () => {
    setFormRows((prev) => [...prev, { ...emptyLicenseRow }]);
  };

  const removeRow = (index: number) => {
    if (formRows.length > 1) {
      setFormRows((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const validateRow = (row: LicenseRowFormData): string | null => {
    if (!row.enterprise_id) return "Enterprise is required";
    if (!row.product_id) return "Product is required";
    if (!row.service_id) return "Service is required";
    if (!row.start_date) return "Start date is required";
    if (!row.end_date) return "End date is required";
    if (new Date(row.end_date) <= new Date(row.start_date)) {
      return "End date must be after start date";
    }
    if (row.number_of_users < 1) return "Number of users must be at least 1";
    if (!row.contact_full_name) return "Contact name is required";
    if (!row.contact_email) return "Contact email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact_email)) {
      return "Invalid email format";
    }
    if (row.notice_days < 1) return "Notice days must be at least 1";
    return null;
  };

  const handleSaveAll = async () => {
    // Validate all rows
    for (let i = 0; i < formRows.length; i++) {
      const error = validateRow(formRows[i]);
      if (error) {
        toast({ title: "Validation Error", description: `Row ${i + 1}: ${error}`, variant: "destructive" });
        return;
      }
    }

    setIsSaving(true);
    try {
      for (const row of formRows) {
        await createLicense.mutateAsync({
          account_id: accountId,
          enterprise_id: row.enterprise_id,
          product_id: row.product_id,
          service_id: row.service_id,
          start_date: row.start_date,
          end_date: row.end_date,
          number_of_users: row.number_of_users,
          contact_full_name: row.contact_full_name,
          contact_email: row.contact_email,
          contact_phone: row.contact_phone,
          contact_department: row.contact_department,
          contact_designation: row.contact_designation,
          renewal_notify: row.renewal_notify,
          notice_days: row.notice_days,
        });
      }
      toast({ title: "Success", description: `${formRows.length} license(s) added successfully` });
      setFormRows([{ ...emptyLicenseRow }]);
      setShowAddForm(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to save licenses", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateLicense = async (data: LicenseFormData) => {
    if (!editingLicense) return;
    try {
      await updateLicense.mutateAsync({ id: editingLicense.id, data });
      toast({ title: "Success", description: "License updated successfully" });
      setEditingLicense(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update license", variant: "destructive" });
    }
  };

  const handleDeleteLicense = async () => {
    if (!deletingLicense) return;
    try {
      await deleteLicense.mutateAsync(deletingLicense.id);
      toast({ title: "Success", description: "License deleted successfully" });
      setDeletingLicense(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete license", variant: "destructive" });
    }
  };

  const isExpiringSoon = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (endDate: string) => {
    return new Date(endDate) < new Date();
  };

  if (isLoading || enterprisesLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Licenses
            {licenses.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {licenses.length}
              </Badge>
            )}
          </CardTitle>
          {!showAddForm && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setShowAddForm(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add License
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add License Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Add New License(s)</h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setShowAddForm(false);
                      setFormRows([{ ...emptyLicenseRow }]);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  {formRows.map((row, index) => (
                    <LicenseFormRow
                      key={index}
                      row={row}
                      index={index}
                      uniqueEnterpriseNames={uniqueEnterpriseNames}
                      getProductsForEnterpriseName={getProductsForEnterpriseName}
                      getEnterpriseServices={getEnterpriseServices}
                      onEnterpriseNameChange={handleEnterpriseNameChange}
                      onProductChange={handleProductChange}
                      onChange={handleRowChange}
                      onRemove={removeRow}
                      canRemove={formRows.length > 1}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={addRow}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Another Row
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSaveAll}
                    disabled={isSaving}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? "Saving..." : `Save ${formRows.length} License(s)`}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Licenses Table */}
        {licenses.length === 0 && !showAddForm ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No licenses found. Add a license to get started.
          </div>
        ) : licenses.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="h-9 text-xs w-10">Status</TableHead>
                  <TableHead className="h-9 text-xs">Enterprise</TableHead>
                  <TableHead className="h-9 text-xs">Product</TableHead>
                  <TableHead className="h-9 text-xs">Service</TableHead>
                  <TableHead className="h-9 text-xs">Users</TableHead>
                  <TableHead className="h-9 text-xs">Period</TableHead>
                  <TableHead className="h-9 text-xs">Contact</TableHead>
                  <TableHead className="h-9 text-xs">Renewal</TableHead>
                  <TableHead className="h-9 text-xs w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((license) => {
                  const expired = isExpired(license.end_date);
                  return (
                  <TableRow 
                    key={license.id} 
                    className={cn(
                      "hover:bg-muted/30 transition-all",
                      expired && "opacity-60"
                    )}
                  >
                    <TableCell className="py-2">
                      <div className="flex items-center justify-center">
                        <div 
                          className={cn(
                            "w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 transition-all",
                            expired 
                              ? "bg-muted-foreground/40 ring-muted/50" 
                              : "bg-success ring-success/30 shadow-[0_0_6px_hsl(var(--success)/0.5)]"
                          )}
                          title={expired ? "Inactive - License Expired" : "Active License"}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{license.enterprise?.name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{license.product?.name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{license.service?.name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{license.number_of_users}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span>{format(new Date(license.start_date), "MMM d, yyyy")}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>→</span>
                          <span
                            className={cn(
                              isExpired(license.end_date)
                                ? "text-destructive"
                                : isExpiringSoon(license.end_date)
                                ? "text-warning"
                                : ""
                            )}
                          >
                            {format(new Date(license.end_date), "MMM d, yyyy")}
                          </span>
                          {isExpired(license.end_date) && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1">
                              Expired
                            </Badge>
                          )}
                          {isExpiringSoon(license.end_date) && !isExpired(license.end_date) && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 text-warning border-warning">
                              Expiring
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm">
                        <div className="font-medium">{license.contact_full_name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {license.contact_email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1">
                        {license.renewal_notify ? (
                          <>
                            <Bell className="w-3.5 h-3.5 text-success" />
                            <span className="text-xs text-muted-foreground">{license.notice_days}d</span>
                          </>
                        ) : (
                          <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => setEditingLicense(license)}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeletingLicense(license)}
                        >
                        <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>

      {/* Edit Dialog */}
      {editingLicense && (
        <EditLicenseDialog
          license={editingLicense}
          enterprises={enterprises}
          uniqueEnterpriseNames={uniqueEnterpriseNames}
          getProductsForEnterpriseName={getProductsForEnterpriseName}
          open={!!editingLicense}
          onOpenChange={(open) => !open && setEditingLicense(null)}
          onSave={handleUpdateLicense}
          getEnterpriseServices={getEnterpriseServices}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingLicense} onOpenChange={(open) => !open && setDeletingLicense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete License</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this license? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteLicense}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// License Form Row Component
interface LicenseFormRowProps {
  row: LicenseRowFormData;
  index: number;
  uniqueEnterpriseNames: string[];
  getProductsForEnterpriseName: (enterpriseName: string) => { id: string; name: string; enterpriseId: string }[];
  getEnterpriseServices: (enterpriseId: string) => { id: string; name: string }[];
  onEnterpriseNameChange: (index: number, enterpriseName: string) => void;
  onProductChange: (index: number, productId: string, enterpriseName: string) => void;
  onChange: (index: number, field: keyof LicenseRowFormData, value: any) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

function LicenseFormRow({
  row,
  index,
  uniqueEnterpriseNames,
  getProductsForEnterpriseName,
  getEnterpriseServices,
  onEnterpriseNameChange,
  onProductChange,
  onChange,
  onRemove,
  canRemove,
}: LicenseFormRowProps) {
  const products = row.enterprise_name ? getProductsForEnterpriseName(row.enterprise_name) : [];
  const services = row.enterprise_id ? getEnterpriseServices(row.enterprise_id) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border rounded-lg p-4 bg-background space-y-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">License {index + 1}</span>
        {canRemove && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Enterprise Name, Product, Service Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Enterprise *</Label>
          <Select value={row.enterprise_name || ""} onValueChange={(v) => onEnterpriseNameChange(index, v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select enterprise" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              {uniqueEnterpriseNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Product *</Label>
          {!row.enterprise_name || products.length <= 1 ? (
            <Input
              className="h-9 text-sm bg-muted/50"
              value={products.length === 1 ? products[0].name : ""}
              disabled
              placeholder="Select enterprise first"
            />
          ) : (
            <Select value={row.product_id} onValueChange={(v) => onProductChange(index, v, row.enterprise_name || "")}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Service *</Label>
          {services.length > 1 ? (
            <Select value={row.service_id} onValueChange={(v) => onChange(index, "service_id", v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-9 text-sm bg-muted/50"
              value={services[0]?.name || ""}
              disabled
              placeholder={row.enterprise_id ? "Auto-filled" : "Select product first"}
            />
          )}
        </div>
      </div>

      {/* Dates and Users Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Start Date *</Label>
          <Input
            type="date"
            className="h-9 text-sm"
            value={row.start_date}
            onChange={(e) => onChange(index, "start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">End Date *</Label>
          <Input
            type="date"
            className="h-9 text-sm"
            value={row.end_date}
            onChange={(e) => onChange(index, "end_date", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">No. of Users *</Label>
          <Input
            type="number"
            min={1}
            className="h-9 text-sm"
            value={row.number_of_users}
            onChange={(e) => onChange(index, "number_of_users", parseInt(e.target.value) || 1)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notice (Days) *</Label>
          <Input
            type="number"
            min={1}
            className="h-9 text-sm"
            value={row.notice_days}
            onChange={(e) => onChange(index, "notice_days", parseInt(e.target.value) || 30)}
          />
        </div>
      </div>

      {/* Contact Details Row */}
      <div className="grid grid-cols-5 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Contact Name *</Label>
          <Input
            className="h-9 text-sm"
            placeholder="Full name"
            value={row.contact_full_name}
            onChange={(e) => onChange(index, "contact_full_name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email *</Label>
          <Input
            type="email"
            className="h-9 text-sm"
            placeholder="email@example.com"
            value={row.contact_email}
            onChange={(e) => onChange(index, "contact_email", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input
            className="h-9 text-sm"
            placeholder="Phone number"
            value={row.contact_phone}
            onChange={(e) => onChange(index, "contact_phone", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Department</Label>
          <Input
            className="h-9 text-sm"
            placeholder="Department"
            value={row.contact_department}
            onChange={(e) => onChange(index, "contact_department", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Designation</Label>
          <Input
            className="h-9 text-sm"
            placeholder="Designation"
            value={row.contact_designation}
            onChange={(e) => onChange(index, "contact_designation", e.target.value)}
          />
        </div>
      </div>

      {/* Renewal Notification */}
      <div className="flex items-center gap-2 pt-1">
        <Switch
          checked={row.renewal_notify}
          onCheckedChange={(checked) => onChange(index, "renewal_notify", checked)}
        />
        <Label className="text-xs text-muted-foreground">Enable renewal notifications</Label>
      </div>
    </motion.div>
  );
}

// Edit License Dialog
interface EditLicenseDialogProps {
  license: LicenseWithDetails;
  enterprises: { id: string; name: string; product: { id: string; name: string } | null; services: { id: string; name: string }[] }[];
  uniqueEnterpriseNames: string[];
  getProductsForEnterpriseName: (enterpriseName: string) => { id: string; name: string; enterpriseId: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: LicenseFormData) => void;
  getEnterpriseServices: (enterpriseId: string) => { id: string; name: string }[];
}

function EditLicenseDialog({
  license,
  enterprises,
  uniqueEnterpriseNames,
  getProductsForEnterpriseName,
  open,
  onOpenChange,
  onSave,
  getEnterpriseServices,
}: EditLicenseDialogProps) {
  // Find the initial enterprise name from the license
  const initialEnterpriseName = enterprises.find((e) => e.id === license.enterprise_id)?.name || "";
  
  const [enterpriseName, setEnterpriseName] = useState(initialEnterpriseName);
  const [formData, setFormData] = useState<LicenseFormData>({
    enterprise_id: license.enterprise_id,
    product_id: license.product_id,
    service_id: license.service_id,
    start_date: license.start_date,
    end_date: license.end_date,
    number_of_users: license.number_of_users,
    contact_full_name: license.contact_full_name,
    contact_email: license.contact_email,
    contact_phone: license.contact_phone || "",
    contact_department: license.contact_department || "",
    contact_designation: license.contact_designation || "",
    renewal_notify: license.renewal_notify,
    notice_days: license.notice_days,
  });

  const products = enterpriseName ? getProductsForEnterpriseName(enterpriseName) : [];
  const services = formData.enterprise_id ? getEnterpriseServices(formData.enterprise_id) : [];

  const handleEnterpriseNameChange = (name: string) => {
    setEnterpriseName(name);
    const newProducts = getProductsForEnterpriseName(name);
    if (newProducts.length === 1) {
      const newServices = getEnterpriseServices(newProducts[0].enterpriseId);
      setFormData((prev) => ({
        ...prev,
        enterprise_id: newProducts[0].enterpriseId,
        product_id: newProducts[0].id,
        service_id: newServices.length === 1 ? newServices[0].id : "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        enterprise_id: "",
        product_id: "",
        service_id: "",
      }));
    }
  };

  const handleProductChange = (productId: string) => {
    const selectedProduct = products.find((p) => p.id === productId);
    if (!selectedProduct) return;

    const newServices = getEnterpriseServices(selectedProduct.enterpriseId);
    setFormData((prev) => ({
      ...prev,
      enterprise_id: selectedProduct.enterpriseId,
      product_id: productId,
      service_id: newServices.length === 1 ? newServices[0].id : "",
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit License</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Enterprise Name, Product, Service */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Enterprise *</Label>
              <Select value={enterpriseName} onValueChange={handleEnterpriseNameChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select enterprise" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {uniqueEnterpriseNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Product *</Label>
              {!enterpriseName || products.length <= 1 ? (
                <Input 
                  className="h-9 text-sm bg-muted/50" 
                  value={products.length === 1 ? products[0].name : ""} 
                  disabled 
                  placeholder="Select enterprise first"
                />
              ) : (
                <Select value={formData.product_id} onValueChange={handleProductChange}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Service *</Label>
              {services.length > 1 ? (
                <Select
                  value={formData.service_id}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, service_id: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input 
                  className="h-9 text-sm bg-muted/50" 
                  value={services[0]?.name || ""} 
                  disabled 
                  placeholder={formData.enterprise_id ? "Auto-filled" : "Select product first"}
                />
              )}
            </div>
          </div>

          {/* Dates and Users */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date *</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={formData.start_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date *</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={formData.end_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, end_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">No. of Users *</Label>
              <Input
                type="number"
                min={1}
                className="h-9 text-sm"
                value={formData.number_of_users}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, number_of_users: parseInt(e.target.value) || 1 }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notice (Days) *</Label>
              <Input
                type="number"
                min={1}
                className="h-9 text-sm"
                value={formData.notice_days}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notice_days: parseInt(e.target.value) || 30 }))
                }
              />
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Name *</Label>
              <Input
                className="h-9 text-sm"
                value={formData.contact_full_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, contact_full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                className="h-9 text-sm"
                value={formData.contact_email}
                onChange={(e) => setFormData((prev) => ({ ...prev, contact_email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                className="h-9 text-sm"
                value={formData.contact_phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, contact_phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Input
                className="h-9 text-sm"
                value={formData.contact_department}
                onChange={(e) => setFormData((prev) => ({ ...prev, contact_department: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Designation</Label>
              <Input
                className="h-9 text-sm"
                value={formData.contact_designation}
                onChange={(e) => setFormData((prev) => ({ ...prev, contact_designation: e.target.value }))}
              />
            </div>
          </div>

          {/* Renewal Notification */}
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.renewal_notify}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, renewal_notify: checked }))}
            />
            <Label className="text-xs text-muted-foreground">Enable renewal notifications</Label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(formData)}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
