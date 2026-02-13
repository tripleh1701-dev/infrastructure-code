import { Fragment, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin,
  Cloud,
  Server,
  ChevronRight,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountWithDetails } from "@/hooks/useAccounts";
import { useLicenses, LicenseWithDetails } from "@/hooks/useLicenses";
import { AccountExpandedRow } from "./AccountExpandedRow";

interface AccountTableRowProps {
  account: AccountWithDetails;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddLicense: () => void;
  onEditLicense: (license: LicenseWithDetails) => void;
  onDeleteLicense: (license: LicenseWithDetails) => void;
  getCloudTypeLabel: (type: string) => string;
}

export function AccountTableRow({
  account,
  index,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddLicense,
  onEditLicense,
  onDeleteLicense,
  getCloudTypeLabel,
}: AccountTableRowProps) {
  const { licenses } = useLicenses(account.id);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const primaryAddress = account.addresses?.[0];
  
  const licenseCount = account.license_count ?? licenses.length;
  const expiringCount = account.expiring_license_count ?? 0;

  return (
    <Fragment>
      <motion.tr
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        className={cn(
          "border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-all duration-200 group cursor-pointer",
          isExpanded && "bg-[#f0f7ff] border-l-4 border-l-[#0171EC] shadow-[inset_0_0_0_1px_rgba(1,113,236,0.15)]",
          !isExpanded && "border-l-4 border-l-transparent",
          isDropdownOpen && "bg-[#f0f7ff] shadow-[inset_0_0_0_1px_rgba(1,113,236,0.2),0_2px_8px_-2px_rgba(1,113,236,0.15)]"
        )}
        onClick={onToggleExpand}
      >
        <td className="px-5 py-4 w-10">
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </motion.div>
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div 
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold",
                account.cloud_type === "public" 
                  ? "bg-gradient-to-br from-[#0171EC] to-[#05E9FE]" 
                  : account.cloud_type === "private"
                  ? "bg-gradient-to-br from-violet-500 to-purple-400"
                  : "bg-gradient-to-br from-emerald-500 to-teal-400"
              )}
            >
              {account.cloud_type === "public" ? (
                <Cloud className="w-4 h-4" />
              ) : (
                <Server className="w-4 h-4" />
              )}
            </div>
            <div>
              <p className="font-medium text-[#0f172a]">{account.name}</p>
              <p className="text-xs text-[#64748b]">{account.master_account_name}</p>
            </div>
          </div>
        </td>
        <td className="px-5 py-4">
          <span className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
            account.cloud_type === "public" 
              ? "bg-[#0171EC]/10 text-[#0171EC] border border-[#0171EC]/30" 
              : account.cloud_type === "private"
              ? "bg-violet-500/10 text-violet-600 border border-violet-500/30"
              : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
          )}>
            {account.cloud_type === "public" ? <Cloud className="w-3 h-3" /> : <Server className="w-3 h-3" />}
            {getCloudTypeLabel(account.cloud_type)}
          </span>
        </td>
        <td className="px-5 py-4">
          {primaryAddress ? (
            <div className="flex items-center gap-1.5 text-sm text-[#64748b]">
              <MapPin className="w-3.5 h-3.5" />
              <span>{primaryAddress.city}, {primaryAddress.country}</span>
              {account.addresses.length > 1 && (
                <span className="px-1.5 py-0.5 bg-[#f1f5f9] border border-[#e2e8f0] rounded text-[10px] text-[#64748b]">
                  +{account.addresses.length - 1}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-[#94a3b8]">—</span>
          )}
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm text-[#0f172a]">
              <FileText className="w-3.5 h-3.5 text-[#64748b]" />
              {licenseCount}
            </div>
            {expiringCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#fef3c7] text-[#d97706] border border-[#fcd34d] animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                {expiringCount} expiring
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-4">
          <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            account.status === "active" 
              ? "bg-[#dcfce7] text-[#16a34a] border border-[#bbf7d0]" 
              : "bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0]"
          )}>
            {account.status === "active" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {account.status === "active" ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-5 py-4">
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="gap-2 cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
                Edit Account
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onAddLicense();
                }}
                className="gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add License
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="gap-2 cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Delete Account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </motion.tr>

      <AnimatePresence>
        {isExpanded && (
          <tr className="bg-[#f8fbff]">
            <td colSpan={7} className="p-0 border-l-4 border-l-[#0171EC]">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AccountExpandedRow
                  account={account}
                  licenses={licenses}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddLicense={onAddLicense}
                  onEditLicense={onEditLicense}
                  onDeleteLicense={onDeleteLicense}
                />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </Fragment>
  );
}
