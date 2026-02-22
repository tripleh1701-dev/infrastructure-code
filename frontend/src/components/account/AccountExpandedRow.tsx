import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MapPin,
  User,
  Calendar,
  Mail,
  Building2,
  Package,
  Wrench,
  Users,
  Bell,
  BellOff,
  Edit,
  Trash2,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountWithDetails } from "@/hooks/useAccounts";
import { LicenseWithDetails } from "@/hooks/useLicenses";
import { format, differenceInDays } from "date-fns";
import { AddTechnicalUserDialog } from "./AddTechnicalUserDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

interface AccountExpandedRowProps {
  account: AccountWithDetails;
  licenses: LicenseWithDetails[];
  onEdit: () => void;
  onDelete: () => void;
  onAddLicense: () => void;
  onEditLicense: (license: LicenseWithDetails) => void;
  onDeleteLicense: (license: LicenseWithDetails) => void;
}

export function AccountExpandedRow({
  account,
  licenses,
  onEdit,
  onDelete,
  onAddLicense,
  onEditLicense,
  onDeleteLicense,
}: AccountExpandedRowProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const technicalUsers = account.technical_users || [];

  const isExpiringSoon = (endDate: string) => {
    const daysRemaining = differenceInDays(new Date(endDate), new Date());
    return daysRemaining <= 30 && daysRemaining > 0;
  };

  const isExpired = (endDate: string) => {
    return new Date(endDate) < new Date();
  };

  const getDaysRemaining = (endDate: string) => {
    return differenceInDays(new Date(endDate), new Date());
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Delete user_groups first
      await supabase.from("user_groups").delete().eq("user_id", userId);
      // Delete user_workstreams
      await supabase.from("user_workstreams").delete().eq("user_id", userId);
      // Delete the technical user
      const { error } = await supabase.from("account_technical_users").delete().eq("id", userId);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Technical user removed successfully");
    } catch (error) {
      toast.error("Failed to remove technical user");
    }
    setDeletingUserId(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-4 py-4 bg-muted/30 border-t border-border">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-4">
            <TabsList className="h-8 p-0.5 bg-muted/50 border border-border rounded-md">
              <TabsTrigger 
                value="overview" 
                className="text-xs h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="addresses" 
                className="text-xs h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                Addresses ({account.addresses?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger 
                value="technical-users" 
                className="text-xs h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                Technical Users ({technicalUsers.length})
              </TabsTrigger>
              <TabsTrigger 
                value="licenses" 
                className="text-xs h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
              >
                Licenses ({licenses.length})
                {licenses.some((l) => isExpiringSoon(l.end_date)) && (
                  <AlertTriangle className="w-3 h-3 ml-1 text-warning data-[state=active]:text-primary-foreground" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Account Info */}
              <div className="p-4 rounded-lg bg-background border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Account Details</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Master Account</span>
                    <span>{account.master_account_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cloud Type</span>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {account.cloud_type}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] h-5",
                        (account.expired_license_count ?? 0) > 0
                          ? "text-destructive border-destructive"
                          : account.status === "active"
                          ? "text-success border-success"
                          : "text-muted-foreground"
                      )}
                    >
                      {(account.expired_license_count ?? 0) > 0 ? "Expired" : account.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Primary Address */}
              {account.addresses?.[0] && (
                <div className="p-4 rounded-lg bg-background border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium">Primary Address</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <p>{account.addresses[0].line1}</p>
                    {account.addresses[0].line2 && (
                      <p className="text-muted-foreground">{account.addresses[0].line2}</p>
                    )}
                    <p className="text-muted-foreground">
                      {account.addresses[0].city}, {account.addresses[0].state}{" "}
                      {account.addresses[0].postal_code}
                    </p>
                    <p className="text-muted-foreground">{account.addresses[0].country}</p>
                  </div>
                </div>
              )}

              {/* Technical Users Summary */}
              <div className="p-4 rounded-lg bg-background border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-medium">Technical Users</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {technicalUsers.length}
                  </Badge>
                </div>
                {technicalUsers.length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {technicalUsers.slice(0, 2).map((user) => (
                      <div key={user.id} className="flex items-center justify-between">
                        <span className="font-medium truncate">
                          {user.first_name} {user.last_name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] h-5",
                            user.status === "active" ? "text-success border-success" : "text-muted-foreground"
                          )}
                        >
                          {user.status}
                        </Badge>
                      </div>
                    ))}
                    {technicalUsers.length > 2 && (
                      <button
                        onClick={() => setActiveTab("technical-users")}
                        className="text-xs text-primary hover:underline"
                      >
                        +{technicalUsers.length - 2} more
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No technical users</p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Addresses Tab */}
          <TabsContent value="addresses" className="mt-0">
            {(account.addresses?.length ?? 0) === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No addresses configured
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(account.addresses ?? []).map((address, index) => (
                  <div
                    key={address.id}
                    className="p-3 rounded-lg bg-background border border-border"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Address {index + 1}
                      </span>
                    </div>
                    <div className="text-sm space-y-0.5">
                      <p>{address.line1}</p>
                      {address.line2 && (
                        <p className="text-muted-foreground">{address.line2}</p>
                      )}
                      <p className="text-muted-foreground">
                        {address.city}, {address.state} {address.postal_code}
                      </p>
                      <p className="text-muted-foreground">{address.country}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Technical Users Tab */}
          <TabsContent value="technical-users" className="mt-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {technicalUsers.length} Technical User{technicalUsers.length !== 1 ? "s" : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setShowAddUserDialog(true)}
              >
                <Plus className="w-3 h-3" />
                Add Technical User
              </Button>
            </div>

            {technicalUsers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No technical users configured for this account
              </div>
            ) : (
              <div className="space-y-2">
                {technicalUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          "w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 flex-shrink-0",
                          user.status === "active"
                            ? "bg-success ring-success/30 shadow-[0_0_6px_hsl(var(--success)/0.5)]"
                            : "bg-muted-foreground/40 ring-muted/50"
                        )}
                        title={user.status === "active" ? "Active" : "Inactive"}
                      />
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">
                          {user.first_name} {user.middle_name ? `${user.middle_name} ` : ""}{user.last_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        <span className="truncate max-w-[200px]">{user.email}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {user.assigned_role}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {user.assigned_group}
                      </Badge>
                      {user.start_date && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{format(new Date(user.start_date), "MMM d, yyyy")}</span>
                          {user.end_date && (
                            <>
                              <span>→</span>
                              <span
                                className={cn(
                                  new Date(user.end_date) < new Date()
                                    ? "text-destructive font-medium"
                                    : ""
                                )}
                              >
                                {format(new Date(user.end_date), "MMM d, yyyy")}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {account.technical_users.length > 1 && (
                      <div className="flex items-center gap-0.5 border-l pl-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeletingUserId(user.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Licenses Tab */}
          <TabsContent value="licenses" className="mt-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {licenses.length} License{licenses.length !== 1 ? "s" : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={onAddLicense}
              >
                <Plus className="w-3 h-3" />
                Add License
              </Button>
            </div>

            {licenses.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No licenses configured for this account
              </div>
            ) : (
              <div className="space-y-2">
                {licenses.map((license) => {
                  const daysRemaining = getDaysRemaining(license.end_date);
                  const expired = isExpired(license.end_date);
                  const expiring = isExpiringSoon(license.end_date);

                    return (
                      <div
                        key={license.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg bg-background border transition-all",
                          expired
                            ? "border-destructive/50 opacity-60"
                            : expiring
                            ? "border-warning/50"
                            : "border-border"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div 
                            className={cn(
                              "w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 transition-all flex-shrink-0",
                              expired 
                                ? "bg-muted-foreground/40 ring-muted/50" 
                                : "bg-success ring-success/30 shadow-[0_0_6px_hsl(var(--success)/0.5)]"
                            )}
                            title={expired ? "Inactive - License Expired" : "Active License"}
                          />
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">
                              {license.enterprise?.name}
                            </span>
                          </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Package className="w-3 h-3" />
                          {license.product?.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Wrench className="w-3 h-3" />
                          {license.service?.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {license.number_of_users} users
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-xs">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {format(new Date(license.start_date), "MMM d, yyyy")}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span
                                className={cn(
                                  expired
                                    ? "text-destructive font-medium"
                                    : expiring
                                    ? "text-warning font-medium"
                                    : "text-muted-foreground"
                                )}
                              >
                                {format(new Date(license.end_date), "MMM d, yyyy")}
                              </span>
                            </div>
                            {(expired || expiring) && (
                              <span
                                className={cn(
                                  "text-[10px] font-medium",
                                  expired ? "text-destructive" : "text-warning"
                                )}
                              >
                                {expired
                                  ? "Expired"
                                  : `${daysRemaining} days remaining`}
                              </span>
                            )}
                          </div>
                          {license.renewal_notify ? (
                            <Bell className="w-4 h-4 text-success" />
                          ) : (
                            <BellOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 border-l pl-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => onEditLicense(license)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => onDeleteLicense(license)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Technical User Dialog */}
      <AddTechnicalUserDialog
        open={showAddUserDialog}
        onOpenChange={setShowAddUserDialog}
        accountId={account.id}
        accountName={account.name}
        enterpriseId={technicalUsers[0]?.enterprise_id ?? null}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingUserId} onOpenChange={(open) => !open && setDeletingUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Technical User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-semibold text-foreground">{(() => {
                const user = account.technical_users.find(u => u.id === deletingUserId);
                return user ? `${user.first_name} ${user.last_name}` : 'this technical user';
              })()}</span>? This action cannot be undone.
              The user's group and workstream assignments will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUserId && handleDeleteUser(deletingUserId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
