import { motion, AnimatePresence } from "framer-motion";
import { Building2, ChevronDown, Check, Briefcase, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEffect, useState, useMemo } from "react";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { supabase } from "@/integrations/supabase/client";


interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { enterprises, selectedEnterprise, setSelectedEnterprise, isLoading: enterpriseLoading, getEnterpriseDisplayName } = useEnterpriseContext();
  const { accounts, selectedAccount, setSelectedAccount, isLoading: accountsLoading } = useAccountContext();
  
  const [accountEnterpriseIds, setAccountEnterpriseIds] = useState<string[]>([]);
  const [loadingEnterpriseIds, setLoadingEnterpriseIds] = useState(false);

  // Fetch enterprise IDs linked to the selected account via licenses
  useEffect(() => {
    const fetchAccountEnterprises = async () => {
      if (!selectedAccount?.id) {
        setAccountEnterpriseIds([]);
        return;
      }

      setLoadingEnterpriseIds(true);
      try {
        let uniqueIds: string[] = [];

        if (isExternalApi()) {
          const { data, error } = await httpClient.get<{ enterprise_id: string }[]>('/api/licenses', {
            params: { accountId: selectedAccount.id, fields: 'enterprise_id' },
          });
          if (error) throw new Error(error.message);
          uniqueIds = [...new Set((data || []).map(l => l.enterprise_id))];
        } else {
          const { data, error } = await supabase
            .from("account_licenses")
            .select("enterprise_id")
            .eq("account_id", selectedAccount.id);

          if (error) throw error;
          uniqueIds = [...new Set(data?.map(l => l.enterprise_id) || [])];
        }

        setAccountEnterpriseIds(uniqueIds);

        if (uniqueIds.length > 0 && selectedEnterprise && !uniqueIds.includes(selectedEnterprise.id)) {
          const firstEnterprise = enterprises.find(e => e.id === uniqueIds[0]);
          if (firstEnterprise) {
            setSelectedEnterprise(firstEnterprise);
          }
        }
      } catch (error) {
        console.error("Error fetching account enterprises:", error);
      } finally {
        setLoadingEnterpriseIds(false);
      }
    };

    fetchAccountEnterprises();
  }, [selectedAccount?.id, enterprises, selectedEnterprise, setSelectedEnterprise]);

  const filteredEnterprises = useMemo(() => {
    if (accountEnterpriseIds.length === 0) return [];
    return enterprises.filter(e => accountEnterpriseIds.includes(e.id));
  }, [enterprises, accountEnterpriseIds]);

  const hasDuplicateNamesInFiltered = (enterpriseName: string): boolean => {
    return filteredEnterprises.filter(e => e.name === enterpriseName).length > 1;
  };

  const getFilteredEnterpriseDisplayName = (enterprise: typeof enterprises[0]): string => {
    if (hasDuplicateNamesInFiltered(enterprise.name) && enterprise.product?.name) {
      return `${enterprise.name} - ${enterprise.product.name}`;
    }
    return enterprise.name;
  };

  const hasNoLicenses = selectedAccount && !loadingEnterpriseIds && accountEnterpriseIds.length === 0;


  return (
    <>
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="flex items-center justify-between px-content py-2.5">
          {/* Left: Title + Subtitle + Context */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-4 min-w-0"
          >
            <div className="min-w-0">
              <h1 className="text-lg font-bold gradient-text whitespace-nowrap">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
          </motion.div>

          {/* Right: Context + Selectors + User */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {actions}
            
            {/* Account Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 px-2"
                  disabled={accountsLoading}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium hidden md:inline">
                    {accountsLoading ? "..." : selectedAccount?.name || "Account"}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-h-64 overflow-y-auto">
                {accounts.length === 0 ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    No accounts available
                  </DropdownMenuItem>
                ) : (
                  accounts.map((account) => (
                    <DropdownMenuItem
                      key={account.id}
                      onClick={() => setSelectedAccount({ id: account.id, name: account.name })}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="truncate">{account.name}</span>
                      {selectedAccount?.id === account.id && (
                        <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                      )}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Enterprise Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 px-2"
                  disabled={enterpriseLoading || loadingEnterpriseIds || hasNoLicenses}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium hidden md:inline">
                    {enterpriseLoading || loadingEnterpriseIds 
                      ? "..." 
                      : hasNoLicenses
                        ? "No Enterprise"
                        : selectedEnterprise 
                          ? getFilteredEnterpriseDisplayName(selectedEnterprise)
                          : "Enterprise"}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-64 overflow-y-auto">
                {filteredEnterprises.length === 0 ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    No enterprises for this account
                  </DropdownMenuItem>
                ) : (
                  filteredEnterprises.map((enterprise) => (
                    <DropdownMenuItem
                      key={enterprise.id}
                      onClick={() => setSelectedEnterprise(enterprise)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="truncate">{getFilteredEnterpriseDisplayName(enterprise)}</span>
                      {selectedEnterprise?.id === enterprise.id && (
                        <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" />
                      )}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        </div>
      </header>

      {/* No License Warning Banner */}
      <AnimatePresence>
        {hasNoLicenses && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-[hsl(var(--warning))]/5 border-b border-[hsl(var(--warning))]/20 px-6 py-2 sticky top-14 z-20"
          >
            <div className="flex items-center gap-2 text-[hsl(var(--warning))]">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-medium">
                No Enterprise license assigned to "{selectedAccount?.name}".
              </span>
              <span className="text-xs opacity-80">
                Add a license from Account Settings.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
