import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/PermissionContext";

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
  { icon: Mail, label: "My Inbox", path: "/inbox", menuKey: "inbox", badge: "3" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", menuKey: "dashboard" },
  { icon: GitBranch, label: "Pipelines", path: "/pipelines", menuKey: "pipelines" },
  { icon: Box, label: "Builds", path: "/builds", menuKey: "builds" },
  { icon: Users, label: "Access Control", path: "/access-control", menuKey: "access-control" },
  { icon: Settings, label: "Account Settings", path: "/account-settings", menuKey: "account-settings" },
  { icon: Shield, label: "Security & Governance", path: "/security", menuKey: "security" },
  { icon: Activity, label: "Monitoring", path: "/monitoring", menuKey: "monitoring" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const { hasMenuAccess, isLoading, currentUserRoleName } = usePermissions();

  // Filter nav items based on permissions
  const navItems = allNavItems.filter((item) => hasMenuAccess(item.menuKey));

  return (
    <motion.aside
      initial={false}
      animate={{ 
        width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)" 
      }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-screen h-dvh z-40 flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0a1628 0%, #0d1e36 100%)" }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/10">
        <Link to="/" className="flex items-center gap-3">
          <motion.div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #0171EC 0%, #05E9FE 100%)" }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Zap className="w-5 h-5 text-white" />
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
      <nav className="flex-1 py-4 overflow-y-auto">
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

      {/* User Profile */}
      <div className="border-t border-white/10 p-3">
        <div className={cn(
          "flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer",
          collapsed && "justify-center"
        )}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, #0171EC 0%, #05E9FE 100%)" }}
          >
            JD
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
                  John Doe
                </p>
                <p className="text-xs text-white/60 truncate">
                  {currentUserRoleName || "Admin"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse Toggle */}
      <motion.button
        onClick={onToggle}
        className="absolute top-20 -right-3 w-6 h-6 rounded-full bg-white border border-[#e2e8f0] shadow-md flex items-center justify-center text-[#64748b] hover:text-[#0f172a] transition-colors z-50"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <motion.div
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </motion.div>
      </motion.button>
    </motion.aside>
  );
}
