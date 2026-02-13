import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  FileText,
  AlertTriangle,
  Edit,
  Trash2,
  Plus,
  Users,
  MoreVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountWithDetails } from "@/hooks/useAccounts";

interface AccountCardProps {
  account: AccountWithDetails;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onAddLicense: () => void;
  onClick: () => void;
  getCloudTypeLabel: (type: string) => string;
}

export function AccountCard({
  account,
  index,
  onEdit,
  onDelete,
  onAddLicense,
  onClick,
  getCloudTypeLabel,
}: AccountCardProps) {
  const primaryAddress = account.addresses?.[0];
  const licenseCount = account.license_count ?? 0;
  const expiringCount = account.expiring_license_count ?? 0;
  const technicalUsersCount = account.technical_users?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 100 }}
      whileHover={{ y: -2 }}
    >
      <Card 
        className="group cursor-pointer border border-border rounded-xl p-5 flex flex-col transition-all duration-300 hover:shadow-lg hover:border-primary/20 min-h-[200px] bg-card"
        onClick={onClick}
      >
        {/* Header: Icon + Title/Subtitle + Actions */}
        <div className="flex items-start gap-3 mb-3">
          <motion.div 
            whileHover={{ rotate: 5, scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400 }}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-shadow duration-300 shadow-md",
              account.cloud_type === "public" 
                ? "bg-gradient-to-br from-[#0171EC] to-[#38bdf8] text-white group-hover:shadow-lg group-hover:shadow-primary/25" 
                : account.cloud_type === "private"
                ? "bg-gradient-to-br from-violet-500 to-purple-400 text-white group-hover:shadow-lg group-hover:shadow-violet-500/25"
                : "bg-gradient-to-br from-emerald-500 to-teal-400 text-white group-hover:shadow-lg group-hover:shadow-emerald-500/25"
            )}
          >
            {account.cloud_type === "public" ? (
              <Cloud className="w-5 h-5" />
            ) : (
              <Server className="w-5 h-5" />
            )}
          </motion.div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate transition-colors duration-200 group-hover:text-primary">
              {account.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {account.master_account_name}
            </p>
          </div>
          
          {/* Status indicator */}
          <motion.span 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 flex-shrink-0",
              account.status === "active" 
                ? "bg-success/10 text-success" 
                : "bg-muted text-muted-foreground"
            )}
          >
            <motion.span 
              animate={{ scale: account.status === "active" ? [1, 1.2, 1] : 1 }}
              transition={{ repeat: account.status === "active" ? Infinity : 0, duration: 2 }}
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                account.status === "active" ? "bg-success" : "bg-muted-foreground"
              )} 
            />
            {account.status === "active" ? "Active" : "Inactive"}
          </motion.span>

          {/* Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-primary/10 hover:text-primary -mt-1 -mr-1"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddLicense(); }} className="gap-2 cursor-pointer">
                <Plus className="w-3.5 h-3.5" />
                Add License
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }} className="gap-2 cursor-pointer">
                <Edit className="w-3.5 h-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                className="gap-2 text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1 line-clamp-2">
          {primaryAddress 
            ? `Located in ${primaryAddress.city}, ${primaryAddress.country}${account.addresses.length > 1 ? ` (+${account.addresses.length - 1} more)` : ''}.`
            : "No location configured."
          }
          {expiringCount > 0 && ` ${expiringCount} license${expiringCount > 1 ? 's' : ''} expiring soon.`}
        </p>
        
        {/* Tags at bottom */}
        <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-border/50">
          {/* Cloud Type */}
          <motion.span
            whileHover={{ scale: 1.03 }}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-200",
              account.cloud_type === "public" 
                ? "border-primary/30 bg-primary/5 text-primary hover:border-primary/50" 
                : account.cloud_type === "private"
                ? "border-violet-500/30 bg-violet-500/5 text-violet-600 hover:border-violet-500/50"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 hover:border-emerald-500/50"
            )}
          >
            {account.cloud_type === "public" ? <Cloud className="w-3 h-3" /> : <Server className="w-3 h-3" />}
            {getCloudTypeLabel(account.cloud_type)}
          </motion.span>

          {/* Licenses count */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-background text-muted-foreground transition-all duration-200 hover:border-primary/50 cursor-default">
                <FileText className="w-3 h-3" />
                {licenseCount} License{licenseCount !== 1 ? 's' : ''}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{licenseCount} active license{licenseCount !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>

          {/* Users count */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-background text-muted-foreground transition-all duration-200 hover:border-primary/50 cursor-default">
                <Users className="w-3 h-3" />
                {technicalUsersCount}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{technicalUsersCount} technical user{technicalUsersCount !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>

          {/* Expiring warning */}
          {expiringCount > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-warning/50 bg-warning/10 text-warning animate-pulse"
            >
              <AlertTriangle className="w-3 h-3" />
              {expiringCount} expiring
            </motion.span>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
