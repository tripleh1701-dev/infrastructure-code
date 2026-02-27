import { useState, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  GitBranch,
  Box,
  Users,
  Settings,
  Shield,
  Activity,
  Mail,
  ChevronLeft,
  CloudCog,
  LogOut,
  ChevronUp,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import trumpetLogo from "@/assets/trumpet-logo.png";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/PermissionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { inboxService } from "@/lib/api/services/inbox.service";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  menuKey: string; // Maps to role_permissions.menu_key
  badge?: string;
}

// All possible nav items with their menu keys
const allNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", path: "/", menuKey: "overview" },
  { icon: Mail, label: "My Inbox", path: "/inbox", menuKey: "inbox" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", menuKey: "dashboard" },
  { icon: GitBranch, label: "Pipelines", path: "/pipelines", menuKey: "pipelines" },
  { icon: Box, label: "Builds", path: "/builds", menuKey: "builds" },
  { icon: Users, label: "Access Control", path: "/access-control", menuKey: "access-control" },
  { icon: Settings, label: "Account Settings", path: "/account-settings", menuKey: "account-settings" },
  { icon: Shield, label: "Security & Governance", path: "/security", menuKey: "security" },
  { icon: CloudCog, label: "Provisioning", path: "/provisioning", menuKey: "provisioning" },
  { icon: Activity, label: "Monitoring", path: "/monitoring", menuKey: "monitoring" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { hasMenuAccess, isLoading, currentUserRoleName } = usePermissions();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Fetch inbox pending count for badge
  const { data: inboxCount = 0 } = useQuery({
    queryKey: ["inbox-count"],
    queryFn: () => inboxService.getPendingCount(),
    refetchInterval: 30000,
  });

  // Filter nav items based on permissions and inject dynamic badge
  const navItems = useMemo(() => {
    return allNavItems
      .filter((item) => hasMenuAccess(item.menuKey))
      .map((item) => {
        if (item.menuKey === "inbox" && inboxCount > 0) {
          return { ...item, badge: String(inboxCount) };
        }
        return item;
      });
  }, [hasMenuAccess, inboxCount]);

  const getUserInitials = () => {
    if (!user?.email) return "U";
    const parts = user.email.split("@")[0].split(/[._-]/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return user.email[0].toUpperCase();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <motion.aside
      initial={false}
      animate={{ 
        width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)" 
      }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-screen h-dvh z-40 flex flex-col overflow-visible"
      style={{ background: "linear-gradient(180deg, #0a1628 0%, #0d1e36 100%)" }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/10">
        <Link to="/" className="flex items-center gap-3">
          <motion.div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <img src={trumpetLogo} alt="Trumpet" className="w-full h-full object-cover" />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex flex-col"
              >
                <span className="text-lg font-bold text-white">Trumpet</span>
                <span className="text-[10px] text-white/60 -mt-1">CI/CD Platform</span>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {isLoading ? (
          // Loading skeleton for nav items
          <ul className="space-y-1 px-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <li key={i}>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                  <div className="w-5 h-5 rounded bg-white/10 animate-pulse" />
                  {!collapsed && (
                    <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.path !== "/" && location.pathname.startsWith(item.path));
              const Icon = item.icon;

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => onNavigate?.()}
                    onMouseEnter={() => setHoveredItem(item.path)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-[#0171EC] text-white"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="text-sm font-medium whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Badge */}
                    {item.badge && !collapsed && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#0171EC] text-white"
                      >
                        {item.badge}
                      </motion.span>
                    )}

                    {/* Tooltip for collapsed state */}
                    {collapsed && hoveredItem === item.path && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="absolute left-full ml-2 px-3 py-1.5 bg-white border border-[#e2e8f0] rounded-lg shadow-lg z-50 whitespace-nowrap text-[#0f172a]"
                      >
                        <span className="text-sm font-medium">{item.label}</span>
                        {item.badge && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-[#0171EC] text-white">
                            {item.badge}
                          </span>
                        )}
                      </motion.div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* User Profile with hover menu */}
      <div className="border-t border-white/10 p-3 relative">
        <div
          onMouseEnter={() => setUserMenuOpen(true)}
          onMouseLeave={() => setUserMenuOpen(false)}
          className="relative"
        >
          <div className={cn(
            "flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer",
            collapsed && "justify-center"
          )}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: "linear-gradient(135deg, #0171EC 0%, #05E9FE 100%)" }}
            >
              {getUserInitials()}
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-sm font-medium text-white truncate">
                    {user?.email?.split("@")[0] || "User"}
                  </p>
                  <p className="text-xs text-white/60 truncate">
                    {currentUserRoleName || "No Role"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {!collapsed && (
              <ChevronUp className={cn("w-4 h-4 text-white/40 transition-transform", userMenuOpen && "rotate-180")} />
            )}
          </div>

          {/* Popover menu on hover */}
          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={cn(
                  "absolute bottom-full mb-2 rounded-xl z-50 overflow-hidden",
                  "bg-popover/95 backdrop-blur-xl border border-border/60",
                  "shadow-[0_8px_30px_-4px_rgba(0,0,0,0.25),0_2px_8px_-2px_rgba(0,0,0,0.15)]",
                  collapsed ? "left-full ml-2 bottom-0 mb-0 w-60" : "left-2 right-2"
                )}
              >
                {/* User info section */}
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-primary/20"
                      style={{ background: "linear-gradient(135deg, #0171EC 0%, #05E9FE 100%)" }}
                    >
                      {getUserInitials()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user?.email?.split("@")[0] || "User"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {user?.email || ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2.5 px-0.5">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10">
                      <Shield className="w-3 h-3 text-primary" />
                      <span className="text-[11px] font-medium text-primary">
                        {currentUserRoleName || "No Role"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="mx-3 h-px bg-border/60" />

                {/* Actions */}
                <div className="p-1.5 space-y-0.5">
                  {/* Theme toggle */}
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg text-foreground hover:bg-muted transition-colors"
                  >
                    {theme === "dark" ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )}
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </button>

                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse Toggle — modern floating tab */}
      <motion.button
        onClick={onToggle}
        className={cn(
          "absolute top-20 -right-3.5 z-50",
          "w-7 h-7 rounded-full",
          "bg-gradient-to-br from-[#0a1628] to-[#162544]",
          "border-2 border-white/20",
          "flex items-center justify-center",
          "text-white/80 hover:text-white",
          "shadow-[0_2px_12px_-2px_rgba(1,113,236,0.4)]",
          "hover:shadow-[0_4px_20px_-2px_rgba(1,113,236,0.6)]",
          "hover:border-[#0171EC]/60",
          "transition-all duration-200",
        )}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.85 }}
      >
        {/* Ping ring hint when collapsed */}
        {collapsed && (
          <span className="absolute inset-0 rounded-full border-2 border-[#0171EC]/50 animate-ping" style={{ animationDuration: '2.5s' }} />
        )}
        <motion.div
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </motion.div>
      </motion.button>
    </motion.aside>
  );
}
