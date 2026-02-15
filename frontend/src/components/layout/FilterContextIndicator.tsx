import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useAccountGlobalAccess } from "@/hooks/useAccountGlobalAccess";
import { Badge } from "@/components/ui/badge";
import { Building2, Briefcase, Filter, Globe } from "lucide-react";

interface FilterContextIndicatorProps {
  compact?: boolean;
}

export function FilterContextIndicator({ compact = false }: FilterContextIndicatorProps) {
  const { selectedAccount, isLoading: accountLoading } = useAccountContext();
  const { selectedEnterprise, enterprises, isLoading: enterpriseLoading } = useEnterpriseContext();
  const { hasGlobalAccess } = useAccountGlobalAccess(selectedAccount?.id);

  if (accountLoading || enterpriseLoading) {
    return null;
  }

  const getEnterpriseDisplayName = (): string => {
    if (!selectedEnterprise) return "All Enterprises";
    
    const duplicateCount = enterprises.filter(e => e.name === selectedEnterprise.name).length;
    if (duplicateCount > 1 && selectedEnterprise.product?.name) {
      return `${selectedEnterprise.name} - ${selectedEnterprise.product.name}`;
    }
    return selectedEnterprise.name;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1 font-medium text-[10px] px-1.5 py-0 h-5">
          <Briefcase className="h-2.5 w-2.5" />
          {selectedAccount?.name || "All"}
        </Badge>
        <span>/</span>
        <Badge variant="outline" className="gap-1 font-medium text-[10px] px-1.5 py-0 h-5">
          <Building2 className="h-2.5 w-2.5" />
          {getEnterpriseDisplayName()}
        </Badge>
        {hasGlobalAccess && (
          <Badge variant="secondary" className="gap-1 font-medium text-[10px] px-1.5 py-0 h-5 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20">
            <Globe className="h-2.5 w-2.5" />
            Global
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border/50 text-sm">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">Showing data for:</span>
      
      <Badge variant="outline" className="gap-1.5 font-medium">
        <Briefcase className="h-3 w-3" />
        {selectedAccount?.name || "All Accounts"}
      </Badge>
      
      <span className="text-muted-foreground">/</span>
      
      <Badge variant="outline" className="gap-1.5 font-medium">
        <Building2 className="h-3 w-3" />
        {getEnterpriseDisplayName()}
      </Badge>

      {hasGlobalAccess && (
        <>
          <span className="text-muted-foreground">•</span>
          <Badge variant="secondary" className="gap-1.5 font-medium bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20">
            <Globe className="h-3 w-3" />
            Global Access
          </Badge>
        </>
      )}
    </div>
  );
}