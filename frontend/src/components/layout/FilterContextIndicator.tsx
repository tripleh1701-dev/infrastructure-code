import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useAccountGlobalAccess } from "@/hooks/useAccountGlobalAccess";
import { Badge } from "@/components/ui/badge";
import { Building2, Briefcase, Filter, Globe } from "lucide-react";

export function FilterContextIndicator() {
  const { selectedAccount, isLoading: accountLoading } = useAccountContext();
  const { selectedEnterprise, enterprises, isLoading: enterpriseLoading } = useEnterpriseContext();
  const { hasGlobalAccess } = useAccountGlobalAccess(selectedAccount?.id);

  if (accountLoading || enterpriseLoading) {
    return null;
  }

  // Check if selected enterprise name has duplicates in the list
  const getEnterpriseDisplayName = (): string => {
    if (!selectedEnterprise) return "All Enterprises";
    
    const duplicateCount = enterprises.filter(e => e.name === selectedEnterprise.name).length;
    if (duplicateCount > 1 && selectedEnterprise.product?.name) {
      return `${selectedEnterprise.name} - ${selectedEnterprise.product.name}`;
    }
    return selectedEnterprise.name;
  };

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
          <Badge variant="secondary" className="gap-1.5 font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
            <Globe className="h-3 w-3" />
            Global Access
          </Badge>
        </>
      )}
    </div>
  );
}
