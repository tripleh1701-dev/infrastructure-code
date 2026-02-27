import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  LayoutDashboard,
  Mail,
  GitBranch,
  Box,
  Users,
  Settings,
  Shield,
  Activity,
  ChevronDown,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Check,
  Sparkles,
  Lock,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Define menu structure matching Sidebar.tsx
const MENU_STRUCTURE = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    tabs: [],
  },
  {
    key: "inbox",
    label: "My Inbox",
    icon: Mail,
    tabs: [],
  },
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    tabs: [
      { key: "analytics", label: "Analytics" },
      { key: "reports", label: "Reports" },
      { key: "insights", label: "AI Insights" },
    ],
  },
  {
    key: "pipelines",
    label: "Pipelines",
    icon: GitBranch,
    tabs: [
      { key: "active", label: "Active Pipelines" },
      { key: "history", label: "History" },
      { key: "templates", label: "Templates" },
    ],
  },
  {
    key: "builds",
    label: "Builds",
    icon: Box,
    tabs: [
      { key: "recent", label: "Recent Builds" },
      { key: "scheduled", label: "Scheduled" },
      { key: "artifacts", label: "Artifacts" },
    ],
  },
  {
    key: "access-control",
    label: "Access Control",
    icon: Users,
    tabs: [
      { key: "users", label: "Users" },
      { key: "groups", label: "Groups" },
      { key: "roles", label: "Roles" },
    ],
  },
  {
    key: "account-settings",
    label: "Account Settings",
    icon: Settings,
    tabs: [
      { key: "enterprise", label: "Enterprise" },
      { key: "accounts", label: "Accounts" },
      { key: "global-settings", label: "Global Settings" },
    ],
  },
  {
    key: "security",
    label: "Security & Governance",
    icon: Shield,
    tabs: [
      { key: "policies", label: "Policies" },
      { key: "audit", label: "Audit Logs" },
      { key: "compliance", label: "Compliance" },
    ],
  },
  {
    key: "monitoring",
    label: "Monitoring",
    icon: Activity,
    tabs: [
      { key: "metrics", label: "Metrics" },
      { key: "alerts", label: "Alerts" },
      { key: "logs", label: "Logs" },
    ],
  },
];

export interface MenuPermission {
  menuKey: string;
  menuLabel: string;
  isVisible: boolean;
  tabs: { key: string; label: string; isVisible: boolean }[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface RoleScopesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: MenuPermission[];
  onSave: (permissions: MenuPermission[]) => void;
}

export function RoleScopesModal({
  open,
  onOpenChange,
  permissions,
  onSave,
}: RoleScopesModalProps) {
  const [localPermissions, setLocalPermissions] = useState<MenuPermission[]>(() =>
    initializePermissions(permissions)
  );
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  function initializePermissions(existing: MenuPermission[]): MenuPermission[] {
    return MENU_STRUCTURE.map((menu) => {
      const existingPerm = existing.find((p) => p.menuKey === menu.key);
      if (existingPerm) {
        return {
          ...existingPerm,
          tabs: menu.tabs.map((tab) => {
            const existingTab = existingPerm.tabs.find((t) => t.key === tab.key);
            return {
              key: tab.key,
              label: tab.label,
              isVisible: existingTab?.isVisible ?? false,
            };
          }),
        };
      }
      return {
        menuKey: menu.key,
        menuLabel: menu.label,
        isVisible: false,
        tabs: menu.tabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          isVisible: false,
        })),
        canCreate: false,
        canView: false,
        canEdit: false,
        canDelete: false,
      };
    });
  }

  const toggleMenu = (menuKey: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(menuKey)) {
        next.delete(menuKey);
      } else {
        next.add(menuKey);
      }
      return next;
    });
  };

  const updateMenuVisibility = (menuKey: string, isVisible: boolean) => {
    setLocalPermissions((prev) =>
      prev.map((p) =>
        p.menuKey === menuKey
          ? {
              ...p,
              isVisible,
              tabs: p.tabs.map((t) => ({ ...t, isVisible: isVisible ? t.isVisible : false })),
              canCreate: isVisible ? p.canCreate : false,
              canView: isVisible ? p.canView : false,
              canEdit: isVisible ? p.canEdit : false,
              canDelete: isVisible ? p.canDelete : false,
            }
          : p
      )
    );
  };

  const updateTabVisibility = (menuKey: string, tabKey: string, isVisible: boolean) => {
    setLocalPermissions((prev) =>
      prev.map((p) =>
        p.menuKey === menuKey
          ? {
              ...p,
              tabs: p.tabs.map((t) =>
                t.key === tabKey ? { ...t, isVisible } : t
              ),
            }
          : p
      )
    );
  };

  const updatePermission = (
    menuKey: string,
    permission: "canCreate" | "canView" | "canEdit" | "canDelete",
    value: boolean
  ) => {
    setLocalPermissions((prev) =>
      prev.map((p) =>
        p.menuKey === menuKey ? { ...p, [permission]: value } : p
      )
    );
  };

  const handleSave = () => {
    onSave(localPermissions.filter((p) => p.isVisible));
    onOpenChange(false);
  };

  const handleReset = () => {
    setLocalPermissions(initializePermissions([]));
  };

  const handleSelectAll = () => {
    setLocalPermissions((prev) =>
      prev.map((p) => ({
        ...p,
        isVisible: true,
        tabs: p.tabs.map((t) => ({ ...t, isVisible: true })),
        canCreate: true,
        canView: true,
        canEdit: true,
        canDelete: true,
      }))
    );
    // Expand all menus to show the selection
    setExpandedMenus(new Set(MENU_STRUCTURE.map((m) => m.key)));
  };

  const isAllSelected = localPermissions.every(
    (p) =>
      p.isVisible &&
      p.canCreate &&
      p.canView &&
      p.canEdit &&
      p.canDelete &&
      p.tabs.every((t) => t.isVisible)
  );

  const enabledMenuCount = localPermissions.filter((p) => p.isVisible).length;
  const totalPermissions = localPermissions.reduce((acc, p) => {
    if (!p.isVisible) return acc;
    let count = 0;
    if (p.canCreate) count++;
    if (p.canView) count++;
    if (p.canEdit) count++;
    if (p.canDelete) count++;
    return acc + count;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        <VisuallyHidden>
          <DialogTitle>Configure Role Scopes</DialogTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-8 py-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 transition-transform">
                <Lock className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  Configure Scopes
                  <Sparkles className="w-4 h-4 text-primary" />
                </h2>
                <p className="text-sm text-muted-foreground">
                  Define menu visibility and CRUD permissions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant={isAllSelected ? "secondary" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isAllSelected) {
                    handleReset();
                  } else {
                    handleSelectAll();
                  }
                }}
                className={cn(
                  "gap-1.5 transition-all",
                  isAllSelected && "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200"
                )}
              >
                <CheckCheck className="w-4 h-4" />
                {isAllSelected ? "Deselect All" : "Select All"}
              </Button>
              <Badge variant="secondary" className="px-3 py-1.5">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                {enabledMenuCount} Menus
              </Badge>
              <Badge variant="outline" className="px-3 py-1.5 bg-primary/5 border-primary/20">
                {totalPermissions} Permissions
              </Badge>
            </div>
          </div>
        </div>

        {/* Content - Scrollable area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {MENU_STRUCTURE.map((menu) => {
              const permission = localPermissions.find((p) => p.menuKey === menu.key);
              const isExpanded = expandedMenus.has(menu.key);
              const Icon = menu.icon;

              return (
                <div
                  key={menu.key}
                  className={cn(
                    "rounded-xl border transition-all duration-200 animate-fade-in",
                    permission?.isVisible
                      ? "bg-primary/5 border-primary/20 shadow-sm"
                      : "bg-muted/30 border-border/50"
                  )}
                >
                  {/* Menu Header */}
                  <div className="flex items-center gap-4 p-4">
                    <Checkbox
                      id={`menu-${menu.key}`}
                      checked={permission?.isVisible ?? false}
                      onCheckedChange={(checked) =>
                        updateMenuVisibility(menu.key, checked === true)
                      }
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => toggleMenu(menu.key)}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                          permission?.isVisible
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <Label
                          htmlFor={`menu-${menu.key}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {menu.label}
                        </Label>
                        {menu.tabs.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {menu.tabs.length} tabs available
                          </p>
                        )}
                      </div>
                    </div>

                    {/* CRUD Permissions */}
                    {permission?.isVisible && (
                      <div className="flex items-center gap-2 animate-scale-in">
                        {[
                          { key: "canView", icon: Eye, label: "View", color: "text-blue-600" },
                          { key: "canCreate", icon: Plus, label: "Create", color: "text-emerald-600" },
                          { key: "canEdit", icon: Pencil, label: "Edit", color: "text-amber-600" },
                          { key: "canDelete", icon: Trash2, label: "Delete", color: "text-red-600" },
                        ].map((perm) => (
                          <button
                            key={perm.key}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updatePermission(
                                menu.key,
                                perm.key as "canCreate" | "canView" | "canEdit" | "canDelete",
                                !permission[perm.key as keyof typeof permission]
                              );
                            }}
                            className={cn(
                              "relative p-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95",
                              permission[perm.key as keyof typeof permission]
                                ? "bg-white shadow-sm border border-slate-200"
                                : "bg-muted/50 hover:bg-muted"
                            )}
                          >
                            <perm.icon
                              className={cn(
                                "w-4 h-4 transition-colors",
                                permission[perm.key as keyof typeof permission]
                                  ? perm.color
                                  : "text-muted-foreground"
                              )}
                            />
                            {permission[perm.key as keyof typeof permission] && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full flex items-center justify-center animate-scale-in">
                                <Check className="w-2 h-2 text-primary-foreground" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Expand Toggle */}
                    {menu.tabs.length > 0 && permission?.isVisible && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu(menu.key);
                        }}
                        className="p-2"
                      >
                        <ChevronDown 
                          className={cn(
                            "w-4 h-4 transition-transform duration-200",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </Button>
                    )}
                  </div>

                  {/* Tabs Section */}
                  {isExpanded && permission?.isVisible && menu.tabs.length > 0 && (
                    <div className="overflow-hidden animate-accordion-down">
                      <div className="px-4 pb-4 pl-16">
                        <div className="bg-white/50 rounded-lg border border-slate-100 p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                            Visible Tabs
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {permission.tabs.map((tab) => (
                              <label
                                key={tab.key}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 hover:scale-102",
                                  tab.isVisible
                                    ? "bg-primary/10 border border-primary/30"
                                    : "bg-muted/50 border border-transparent hover:bg-muted"
                                )}
                              >
                                <Checkbox
                                  checked={tab.isVisible}
                                  onCheckedChange={(checked) =>
                                    updateTabVisibility(menu.key, tab.key, checked === true)
                                  }
                                  className="w-3.5 h-3.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <span className="text-xs font-medium">{tab.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t p-6 bg-muted/30 flex-shrink-0">
          <Button 
            type="button" 
            variant="outline" 
            onClick={(e) => {
              e.stopPropagation();
              handleReset();
            }}
          >
            Reset All
          </Button>
          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
            >
              <Check className="w-4 h-4 mr-2" />
              Save Scopes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { MENU_STRUCTURE };
