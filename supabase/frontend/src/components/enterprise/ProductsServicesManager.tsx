import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Package, Wrench, Plus, Edit2, Trash2, X, Save, ArrowLeft } from "lucide-react";
import { productsService, servicesService } from "@/lib/api/services/products.service";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Item {
  id: string;
  name: string;
  description: string | null;
}

interface ProductsServicesManagerProps {
  onClose: () => void;
  onUpdate?: () => void;
}

export function ProductsServicesManager({ onClose, onUpdate }: ProductsServicesManagerProps) {
  const [products, setProducts] = useState<Item[]>([]);
  const [services, setServices] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("products");
  
  const [newItemName, setNewItemName] = useState("");
  const [newItemError, setNewItemError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingError, setEditingError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  const [deleteItem, setDeleteItem] = useState<{ id: string; type: "product" | "service" } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);

  // Duplicate validation helpers
  const isDuplicateName = (name: string, excludeId?: string): boolean => {
    const trimmedName = name.trim().toLowerCase();
    const items = activeTab === "products" ? products : services;
    return items.some(
      (item) => item.name.toLowerCase() === trimmedName && item.id !== excludeId
    );
  };

  const validateNewItemName = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    if (trimmed.length > 100) return "Name must be less than 100 characters";
    if (isDuplicateName(trimmed)) {
      return `This ${activeTab === "products" ? "product" : "service"} name already exists`;
    }
    return "";
  };

  const validateEditingName = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return "Name cannot be empty";
    if (trimmed.length > 100) return "Name must be less than 100 characters";
    if (isDuplicateName(trimmed, editingId || undefined)) {
      return `This ${activeTab === "products" ? "product" : "service"} name already exists`;
    }
    return "";
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, servicesRes] = await Promise.all([
        productsService.getAll(),
        servicesService.getAll(),
      ]);

      if (productsRes.error) throw new Error(productsRes.error.message);
      if (servicesRes.error) throw new Error(servicesRes.error.message);

      setProducts((productsRes.data || []).map(p => ({ id: p.id, name: p.name, description: p.description })));
      setServices((servicesRes.data || []).map(s => ({ id: s.id, name: s.name, description: s.description })));
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewItemChange = (value: string) => {
    setNewItemName(value);
    setNewItemError(validateNewItemName(value));
  };

  const handleEditingNameChange = (value: string) => {
    setEditingName(value);
    setEditingError(validateEditingName(value));
  };

  const handleAdd = async () => {
    const error = validateNewItemName(newItemName);
    if (error || !newItemName.trim()) {
      setNewItemError(error || "Name cannot be empty");
      return;
    }

    setIsAdding(true);
    const service = activeTab === "products" ? productsService : servicesService;
    
    try {
      const { data, error } = await service.create(newItemName.trim());
      if (error) throw new Error(error.message);

      if (data) {
        const item = { id: data.id, name: data.name, description: data.description };
        if (activeTab === "products") {
          setProducts((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          setServices((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
        }
      }
      
      setNewItemName("");
      setNewItemError("");
      toast.success(`${activeTab === "products" ? "Product" : "Service"} added successfully`);
    } catch (error: any) {
      toast.error(error.message || "Failed to add item");
    } finally {
      setIsAdding(false);
    }
  };

  const startEdit = (item: Item) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingError("");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    setShowUpdateConfirm(false);

    setIsSaving(true);
    const service = activeTab === "products" ? productsService : servicesService;
    
    try {
      const { error } = await service.update(editingId, editingName.trim());
      if (error) throw new Error(error.message);

      if (activeTab === "products") {
        setProducts((prev) =>
          prev.map((p) => (p.id === editingId ? { ...p, name: editingName.trim() } : p))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } else {
        setServices((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, name: editingName.trim() } : s))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      
      cancelEdit();
      toast.success("Updated successfully");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmUpdate = () => {
    const error = validateEditingName(editingName);
    if (error || !editingId || !editingName.trim()) {
      setEditingError(error || "Name cannot be empty");
      return;
    }
    setShowUpdateConfirm(true);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;

    setIsDeleting(true);
    const service = deleteItem.type === "product" ? productsService : servicesService;
    
    try {
      const { error } = await service.delete(deleteItem.id);
      if (error) throw new Error(error.message);

      if (deleteItem.type === "product") {
        setProducts((prev) => prev.filter((p) => p.id !== deleteItem.id));
      } else {
        setServices((prev) => prev.filter((s) => s.id !== deleteItem.id));
      }
      
      toast.success("Deleted successfully");
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete. It may be linked to an enterprise.");
    } finally {
      setIsDeleting(false);
      setDeleteItem(null);
    }
  };

  const renderItemList = (items: Item[], type: "product" | "service") => {
    if (isLoading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-[#f1f5f9] animate-pulse rounded-lg" />
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="text-center py-8 text-[#64748b]">
          No {type}s yet. Add one above.
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "rounded-lg border bg-white transition-colors",
              editingId === item.id && editingError 
                ? "border-red-300" 
                : "border-[#e2e8f0] hover:border-[#0171EC]/30"
            )}
          >
            <div className="flex items-center gap-3 p-3">
              {editingId === item.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => handleEditingNameChange(e.target.value)}
                    className={cn("flex-1 border-[#e2e8f0]", editingError && "border-red-400 focus-visible:ring-red-400")}
                    autoFocus
                    maxLength={100}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-[#0171EC]"
                    onClick={handleConfirmUpdate}
                    disabled={isSaving || !editingName.trim() || !!editingError}
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={cancelEdit}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-[#0f172a]">{item.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-[#64748b] hover:text-[#0171EC]"
                    onClick={() => startEdit(item)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-[#64748b] hover:text-[#ef4444]"
                    onClick={() => setDeleteItem({ id: item.id, type })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
            {editingId === item.id && editingError && (
              <p className="text-xs text-red-500 px-3 pb-2">{editingError}</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-[#64748b] hover:text-[#0f172a]">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h3 className="font-semibold text-[#0f172a]">Manage Products & Services</h3>
            <p className="text-xs text-[#64748b]">Create, edit, or delete items from the master list</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#f1f5f9] border border-[#e2e8f0] p-1 mb-4">
            <TabsTrigger 
              value="products" 
              className="gap-2 data-[state=active]:bg-white data-[state=active]:text-[#0f172a] data-[state=active]:shadow-sm text-[#64748b]"
            >
              <Package className="w-4 h-4" />
              Products ({products.length})
            </TabsTrigger>
            <TabsTrigger 
              value="services" 
              className="gap-2 data-[state=active]:bg-white data-[state=active]:text-[#0f172a] data-[state=active]:shadow-sm text-[#64748b]"
            >
              <Wrench className="w-4 h-4" />
              Services ({services.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input
                  placeholder="New product name"
                  value={newItemName}
                  onChange={(e) => handleNewItemChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !newItemError && handleAdd()}
                  className={cn("flex-1 border-[#e2e8f0]", newItemError && "border-red-400 focus-visible:ring-red-400")}
                  maxLength={100}
                />
                <Button
                  onClick={handleAdd}
                  disabled={isAdding || !newItemName.trim() || !!newItemError}
                  className="gap-2 bg-[#0171EC] hover:bg-[#0171EC]/90"
                >
                  <Plus className="w-4 h-4" />
                  Add Product
                </Button>
              </div>
              {newItemError && (
                <p className="text-xs text-red-500 pl-1">{newItemError}</p>
              )}
            </div>
            
            {renderItemList(products, "product")}
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input
                  placeholder="New service name"
                  value={newItemName}
                  onChange={(e) => handleNewItemChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !newItemError && handleAdd()}
                  className={cn("flex-1 border-[#e2e8f0]", newItemError && "border-red-400 focus-visible:ring-red-400")}
                  maxLength={100}
                />
                <Button
                  onClick={handleAdd}
                  disabled={isAdding || !newItemName.trim() || !!newItemError}
                  className="gap-2 bg-[#0171EC] hover:bg-[#0171EC]/90"
                >
                  <Plus className="w-4 h-4" />
                  Add Service
                </Button>
              </div>
              {newItemError && (
                <p className="text-xs text-red-500 pl-1">{newItemError}</p>
              )}
            </div>
            
            {renderItemList(services, "service")}
          </TabsContent>
        </Tabs>
      </div>

      {/* Update Confirmation Dialog */}
      <AlertDialog open={showUpdateConfirm} onOpenChange={setShowUpdateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update {activeTab === "products" ? "Product" : "Service"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to rename this {activeTab === "products" ? "product" : "service"}? 
              This change will be reflected everywhere it's used across all enterprises.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="bg-[#0171EC] hover:bg-[#0171EC]/90"
            >
              {isSaving ? "Updating..." : "Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteItem?.type === "product" ? "Product" : "Service"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteItem?.type}? This action cannot be undone. 
              If it's linked to any enterprise, the deletion will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-[#ef4444] hover:bg-[#ef4444]/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
