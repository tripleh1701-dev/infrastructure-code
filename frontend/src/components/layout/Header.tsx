import { motion, AnimatePresence } from "framer-motion";
import { Building2, ChevronDown, Check, Briefcase, AlertTriangle, LogOut, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useAccountContext } from "@/contexts/AccountContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { enterprises, selectedEnterprise, setSelectedEnterprise, isLoading: enterpriseLoading, getEnterpriseDisplayName } = useEnterpriseContext();
  const { accounts, selectedAccount, setSelectedAccount, isLoading: accountsLoading } = useAccountContext();
  const { user, signOut } = useAuth();
  const { currentUserRoleName } = usePermissions();
  const navigate = useNavigate();
  
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

        // Auto-select first enterprise if current selection is not in the filtered list
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

  // Filter enterprises based on account licenses
  const filteredEnterprises = useMemo(() => {
    if (accountEnterpriseIds.length === 0) {
      return []; // Return empty if no licenses for this account
    }
    return enterprises.filter(e => accountEnterpriseIds.includes(e.id));
  }, [enterprises, accountEnterpriseIds]);

  // Check for duplicate enterprise names within filtered list
  const hasDuplicateNamesInFiltered = (enterpriseName: string): boolean => {
    const count = filteredEnterprises.filter(e => e.name === enterpriseName).length;
    return count > 1;
  };

  // Get display name - show product if duplicate names exist in filtered list
  const getFilteredEnterpriseDisplayName = (enterprise: typeof enterprises[0]): string => {
    if (hasDuplicateNamesInFiltered(enterprise.name) && enterprise.product?.name) {
      return `${enterprise.name} - ${enterprise.product.name}`;
    }
    return enterprise.name;
  };

  // Check if account has no licenses (only when account is selected and loading is done)
  const hasNoLicenses = selectedAccount && !loadingEnterpriseIds && accountEnterpriseIds.length === 0;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user?.email) return "U";
    const parts = user.email.split("@")[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.email[0].toUpperCase();
  };

  return (
    <>
      <header className="border-b border-border bg-white sticky top-0 z-30 responsive-header flex items-center justify-between">
        <div className="h-full w-full flex items-center justify-between">
          {/* Page Title */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-4"
          >
            <span className="text-sm font-medium text-[#0f172a]">{title}</span>
          </motion.div>

          {/* Right Side - Account/Enterprise Selectors and User Menu */}
          <div className="flex items-center gap-3">
            {actions}
            
            {/* Account Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
                  disabled={accountsLoading}
                >
                  <Briefcase className="w-4 h-4" />
                  <span className="text-sm">
                    {accountsLoading ? "Loading..." : selectedAccount?.name || "Select Account"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5" />
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
                  className="h-8 gap-2 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
                  disabled={enterpriseLoading || loadingEnterpriseIds || hasNoLicenses}
                >
                  <Building2 className="w-4 h-4" />
                  <span className="text-sm">
                    {enterpriseLoading || loadingEnterpriseIds 
                      ? "Loading..." 
                      : hasNoLicenses
                        ? "No Enterprise"
                        : selectedEnterprise 
                          ? getFilteredEnterpriseDisplayName(selectedEnterprise)
                          : "Select Enterprise"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5" />
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

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] px-2"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user?.email || "User"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Shield className="w-3 h-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Role: {currentUserRoleName || "No Role Assigned"}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
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
            className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 sticky top-14 z-20"
          >
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">
                No Enterprise license has been assigned to "{selectedAccount?.name}".
              </span>
              <span className="text-sm text-amber-600">
                Please add a license from Account Settings to enable enterprise features.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
