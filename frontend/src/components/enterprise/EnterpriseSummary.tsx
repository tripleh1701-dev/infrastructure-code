import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Globe, Package, Wrench, Edit2, Trash2, Lock, Search, X, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Calendar, Building2, MoreVertical, Link2, ShieldAlert } from "lucide-react";
import oracleLogo from "@/assets/logos/oracle.png";
import sapLogo from "@/assets/logos/sap.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";
import { GLOBAL_ENTERPRISE_ID } from "@/contexts/EnterpriseContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { EnterpriseTableView } from "./EnterpriseTableView";
import type { ViewMode } from "@/components/ui/view-toggle";

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

interface EnterpriseSummaryProps {
  enterprises: EnterpriseWithDetails[];
  isLoading: boolean;
  onEdit: (enterprise: EnterpriseWithDetails) => void;
  onRefresh: () => void;
  view: ViewMode;
  isEnterpriseLinked?: (id: string) => boolean;
  getLinkDetails?: (id: string) => { enterprise_id: string; license_count: number; account_names: string[] } | null;
}

type SortOption = "name-asc" | "name-desc" | "date-asc" | "date-desc";

const sortLabels: Record<SortOption, string> = {
  "name-asc": "Name (A-Z)",
  "name-desc": "Name (Z-A)",
  "date-asc": "Oldest First",
  "date-desc": "Newest First",
};

// Brand logo mapping for known enterprise names
const BRAND_LOGOS: Record<string, string> = {
  oracle: oracleLogo,
  sap: sapLogo,
};

function getBrandLogo(name: string): string | null {
  const key = name.toLowerCase().trim();
  for (const [brand, logo] of Object.entries(BRAND_LOGOS)) {
    if (key.includes(brand)) return logo;
  }
  return null;
}

export function EnterpriseSummary({ enterprises, isLoading, onEdit, onRefresh, view, isEnterpriseLinked, getLinkDetails }: EnterpriseSummaryProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");

  // Filter and sort enterprises
  const filteredEnterprises = useMemo(() => {
    let result = [...enterprises];
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.product?.name.toLowerCase().includes(query) ||
          e.services.some((s) => s.name.toLowerCase().includes(query))
      );
    }

    result.sort((a, b) => {
      if (a.id === GLOBAL_ENTERPRISE_ID) return -1;
      if (b.id === GLOBAL_ENTERPRISE_ID) return 1;

      switch (sortOption) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "date-asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "date-desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [enterprises, searchQuery, sortOption]);

  const getSortIcon = () => {
    if (sortOption.endsWith("-asc")) return <ArrowUp className="w-4 h-4" />;
    if (sortOption.endsWith("-desc")) return <ArrowDown className="w-4 h-4" />;
    return <ArrowUpDown className="w-4 h-4" />;
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    // Prevent deletion if linked to licenses
    if (isEnterpriseLinked?.(deleteId)) {
      const details = getLinkDetails?.(deleteId);
      toast.error(`This enterprise is linked to ${details?.license_count || 'some'} license(s) in account(s): ${details?.account_names.join(", ") || 'unknown'}. Remove the licenses first.`);
      setDeleteId(null);
      return;
    }

    setIsDeleting(true);
    try {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/enterprises/${deleteId}`);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("enterprises")
          .delete()
          .eq("id", deleteId);
        if (error) throw error;
      }

      toast.success("Enterprise deleted successfully");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete enterprise");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const isGlobalEnterprise = (id: string) => id === GLOBAL_ENTERPRISE_ID;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (enterprises.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-12 text-center"
      >
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">No Enterprises Yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Click "Add Enterprise" to create your first enterprise with product & services.
        </p>
      </motion.div>
    );
  }

  return (
    <>
      {/* Professional Search and Filter Bar */}
      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search enterprises, products, or services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-10 bg-card border-border"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-10 min-w-[140px] bg-card">
                {getSortIcon()}
                <span className="text-sm">{sortLabels[sortOption]}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem 
                onClick={() => setSortOption("name-asc")}
                className={cn("gap-2", sortOption === "name-asc" && "bg-muted")}
              >
                <ArrowUp className="w-4 h-4" />
                Name (A-Z)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortOption("name-desc")}
                className={cn("gap-2", sortOption === "name-desc" && "bg-muted")}
              >
                <ArrowDown className="w-4 h-4" />
                Name (Z-A)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setSortOption("date-desc")}
                className={cn("gap-2", sortOption === "date-desc" && "bg-muted")}
              >
                <ArrowDown className="w-4 h-4" />
                Newest First
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortOption("date-asc")}
                className={cn("gap-2", sortOption === "date-asc" && "bg-muted")}
              >
                <ArrowUp className="w-4 h-4" />
                Oldest First
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Results count */}
      {searchQuery && (
        <p className="text-xs text-muted-foreground mb-4">
          Showing {filteredEnterprises.length} of {enterprises.length} enterprises
        </p>
      )}

      {/* No Results State */}
      {filteredEnterprises.length === 0 && searchQuery ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-lg p-12 text-center"
        >
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No Results Found</h3>
          <p className="text-sm text-muted-foreground">
            No enterprises match "{searchQuery}". Try a different search term.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearchQuery("")}>
            Clear Search
          </Button>
        </motion.div>
      ) : view === "table" ? (
        <EnterpriseTableView 
          enterprises={filteredEnterprises} 
          onEdit={onEdit} 
          onDelete={(id) => setDeleteId(id)}
          isEnterpriseLinked={isEnterpriseLinked}
          getLinkDetails={getLinkDetails}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredEnterprises.map((enterprise, index) => (
            <motion.div
              key={enterprise.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.04, type: "spring", stiffness: 100 }}
              whileHover={{ y: -2 }}
            >
              <Card 
                className={cn(
                  "group cursor-pointer border border-border rounded-xl p-5 flex flex-col transition-all duration-300 hover:shadow-lg hover:border-primary/20 min-h-[200px] bg-card",
                  isGlobalEnterprise(enterprise.id) && "border-l-4 border-l-primary"
                )}
              >
                {/* Header: Icon + Title/Subtitle + Actions */}
                <div className="flex items-start gap-3 mb-3">
                  <motion.div 
                    whileHover={{ rotate: 5, scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-shadow duration-300 shadow-md overflow-hidden",
                      !getBrandLogo(enterprise.name) && (isGlobalEnterprise(enterprise.id) 
                        ? "bg-gradient-to-br from-[#0171EC] to-[#38bdf8] text-white group-hover:shadow-lg group-hover:shadow-primary/25" 
                        : "bg-gradient-to-br from-[#06b6d4] to-[#0ea5e9] text-white group-hover:shadow-lg group-hover:shadow-cyan-500/25"),
                      getBrandLogo(enterprise.name) && "bg-white border border-border group-hover:shadow-lg"
                    )}
                  >
                    {getBrandLogo(enterprise.name) ? (
                      <img src={getBrandLogo(enterprise.name)!} alt={enterprise.name} className="w-8 h-8 object-contain" />
                    ) : isGlobalEnterprise(enterprise.id) ? (
                      <Sparkles className="w-5 h-5" />
                    ) : (
                      <Building2 className="w-5 h-5" />
                    )}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-foreground truncate transition-colors duration-200 group-hover:text-primary">
                      {enterprise.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-muted-foreground">
                        {isGlobalEnterprise(enterprise.id) ? "Default Enterprise" : "Enterprise"}
                      </p>
                      {isEnterpriseLinked?.(enterprise.id) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-semibold border border-amber-300 bg-amber-50 text-amber-700">
                              <Link2 className="w-2.5 h-2.5" />
                              Licensed
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              Linked to {getLinkDetails?.(enterprise.id)?.license_count || 0} license(s)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  
                  {/* Type indicator */}
                  <motion.span 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 flex-shrink-0",
                      isGlobalEnterprise(enterprise.id) 
                        ? "bg-primary/10 text-primary" 
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <motion.span 
                      animate={{ scale: isGlobalEnterprise(enterprise.id) ? [1, 1.2, 1] : 1 }}
                      transition={{ repeat: isGlobalEnterprise(enterprise.id) ? Infinity : 0, duration: 2 }}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isGlobalEnterprise(enterprise.id) ? "bg-primary" : "bg-muted-foreground"
                      )} 
                    />
                    {isGlobalEnterprise(enterprise.id) ? "Global" : "Custom"}
                  </motion.span>

                  {/* Actions Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-primary/10 hover:text-primary -mt-1 -mr-1"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => onEdit(enterprise)} className="gap-2 cursor-pointer">
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit
                      </DropdownMenuItem>
                      {!isGlobalEnterprise(enterprise.id) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => {
                              if (isEnterpriseLinked?.(enterprise.id)) {
                                const details = getLinkDetails?.(enterprise.id);
                                toast.error(`Linked to ${details?.license_count || 'some'} license(s). Remove the licenses first.`);
                                return;
                              }
                              setDeleteId(enterprise.id);
                            }} 
                            className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1 line-clamp-2">
                  {enterprise.product 
                    ? `Licensed for ${enterprise.product.name}${enterprise.services.length > 0 ? ` with ${enterprise.services.length} service${enterprise.services.length > 1 ? 's' : ''}` : ''}.`
                    : "No product or services assigned yet."
                  }
                </p>
                
                {/* Tags at bottom */}
                <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-border/50">
                  {enterprise.product && (
                    <motion.span
                      whileHover={{ scale: 1.03 }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-primary/30 bg-primary/5 text-primary transition-all duration-200 hover:border-primary/50"
                    >
                      <Package className="w-3 h-3" />
                      <span className="text-muted-foreground">Product:</span>
                      {enterprise.product.name}
                    </motion.span>
                  )}
                  {enterprise.services.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-background text-muted-foreground transition-all duration-200 hover:border-primary/50 cursor-default">
                          <Wrench className="w-3 h-3" />
                          <span className="text-muted-foreground/70">{enterprise.services.length > 1 ? 'Services:' : 'Service:'}</span>
                          {enterprise.services.slice(0, 2).map(s => s.name).join(", ")}
                          {enterprise.services.length > 2 && ` +${enterprise.services.length - 2}`}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{enterprise.services.map(s => s.name).join(", ")}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {!enterprise.product && enterprise.services.length === 0 && (
                    <span className="text-[11px] text-muted-foreground/60 italic">No tags</span>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Enterprise</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this enterprise? This action cannot be undone and will also remove all product and service linkages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
