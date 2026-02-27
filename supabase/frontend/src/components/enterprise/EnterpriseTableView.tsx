import { useState } from "react";
import { motion } from "framer-motion";
import { Package, Wrench, Edit2, Trash2, Sparkles, Building2, MoreHorizontal, Calendar, Link2, ShieldAlert } from "lucide-react";
import oracleLogo from "@/assets/logos/oracle.png";
import sapLogo from "@/assets/logos/sap.svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GLOBAL_ENTERPRISE_ID } from "@/contexts/EnterpriseContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

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

interface EnterpriseTableViewProps {
  enterprises: EnterpriseWithDetails[];
  onEdit: (enterprise: EnterpriseWithDetails) => void;
  onDelete: (id: string) => void;
  isEnterpriseLinked?: (id: string) => boolean;
  getLinkDetails?: (id: string) => { enterprise_id: string; license_count: number; account_names: string[] } | null;
}

const BRAND_LOGOS: Record<string, string> = { oracle: oracleLogo, sap: sapLogo };
function getBrandLogo(name: string): string | null {
  const key = name.toLowerCase().trim();
  for (const [brand, logo] of Object.entries(BRAND_LOGOS)) {
    if (key.includes(brand)) return logo;
  }
  return null;
}

export function EnterpriseTableView({ enterprises, onEdit, onDelete, isEnterpriseLinked, getLinkDetails }: EnterpriseTableViewProps) {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const isGlobalEnterprise = (id: string) => id === GLOBAL_ENTERPRISE_ID;

  const handleTryDelete = (id: string) => {
    if (isEnterpriseLinked?.(id)) {
      const details = getLinkDetails?.(id);
      toast.error(`This enterprise is linked to ${details?.license_count || 'some'} license(s). Remove the licenses first.`);
      return;
    }
    onDelete(id);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden"
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
            <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Enterprise</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Product</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Services</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Created</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {enterprises.map((enterprise, index) => (
            <motion.tr
              key={enterprise.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-all duration-200 group",
                openDropdownId === enterprise.id && "bg-[#f0f7ff] shadow-[inset_0_0_0_1px_rgba(1,113,236,0.2),0_2px_8px_-2px_rgba(1,113,236,0.15)]"
              )}
            >
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  {getBrandLogo(enterprise.name) ? (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#e2e8f0] overflow-hidden">
                      <img src={getBrandLogo(enterprise.name)!} alt={enterprise.name} className="w-6 h-6 object-contain" />
                    </div>
                  ) : (
                    <div 
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold",
                        isGlobalEnterprise(enterprise.id) 
                          ? "bg-gradient-to-br from-[#0171EC] to-[#05E9FE]" 
                          : "bg-gradient-to-br from-[#06b6d4] to-[#0ea5e9]"
                      )}
                    >
                      {isGlobalEnterprise(enterprise.id) ? (
                        <Sparkles className="w-4 h-4" />
                      ) : (
                        <Building2 className="w-4 h-4" />
                      )}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[#0f172a]">{enterprise.name}</p>
                      {isEnterpriseLinked?.(enterprise.id) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-medium border-amber-300 bg-amber-50 text-amber-700">
                              <Link2 className="w-3 h-3" />
                              Licensed
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              Linked to {getLinkDetails?.(enterprise.id)?.license_count || 0} license(s) in: {getLinkDetails?.(enterprise.id)?.account_names.join(", ") || "—"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-xs text-[#64748b]">
                      {isGlobalEnterprise(enterprise.id) ? "Default Enterprise" : "Enterprise"}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4">
                {enterprise.product ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#0171EC]/10 text-[#0171EC] border border-[#0171EC]/30">
                    <Package className="w-3 h-3 mr-1.5" />
                    {enterprise.product.name}
                  </span>
                ) : (
                  <span className="text-xs text-[#94a3b8]">—</span>
                )}
              </td>
              <td className="px-5 py-4">
                {enterprise.services.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    {enterprise.services.slice(0, 2).map((service) => (
                      <span key={service.id} className="px-2 py-0.5 bg-[#f1f5f9] border border-[#e2e8f0] rounded text-xs text-[#334155]">
                        {service.name}
                      </span>
                    ))}
                    {enterprise.services.length > 2 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="px-2 py-0.5 bg-[#f1f5f9] border border-[#e2e8f0] rounded text-xs text-[#64748b] cursor-help">
                            +{enterprise.services.length - 2}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {enterprise.services.slice(2).map(s => s.name).join(", ")}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-[#94a3b8]">—</span>
                )}
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-1.5 text-sm text-[#64748b]">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(enterprise.created_at), "MMM d, yyyy")}
                </div>
              </td>
              <td className="px-5 py-4">
                <DropdownMenu open={openDropdownId === enterprise.id} onOpenChange={(open) => setOpenDropdownId(open ? enterprise.id : null)}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
                    >
                      <MoreHorizontal className="w-4 h-4" />
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
                          onClick={() => handleTryDelete(enterprise.id)} 
                          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
