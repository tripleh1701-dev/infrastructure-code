import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { useMultiTenantCacheClear } from "@/hooks/useMultiTenantCacheClear";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Clear cache when account/enterprise selection changes
  const { isTransitioning } = useMultiTenantCacheClear();

  return (
    <div className="min-h-screen min-h-dvh bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      <motion.main
        initial={false}
        animate={{
          marginLeft: sidebarCollapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)",
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="min-h-screen min-h-dvh relative"
        style={{
          width: sidebarCollapsed 
            ? "calc(100% - var(--sidebar-width-collapsed))" 
            : "calc(100% - var(--sidebar-width-expanded))"
        }}
      >
        {children}
        
        {/* Context Transition Overlay */}
        <AnimatePresence>
          {isTransitioning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ marginLeft: sidebarCollapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)" }}
            >
              {/* Gradient backdrop */}
              <motion.div 
                className="absolute inset-0 bg-gradient-to-br from-slate-50/80 via-blue-50/60 to-slate-50/80 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              
              {/* Loading card */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: -5 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 500, 
                  damping: 30,
                  delay: 0.05
                }}
                className="relative flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-white/95 border border-slate-200/80 shadow-2xl shadow-blue-500/10"
              >
                {/* Animated gradient ring */}
                <div className="relative">
                  <motion.div
                    className="w-12 h-12 rounded-full border-[3px] border-slate-200"
                    style={{ borderTopColor: 'transparent' }}
                  />
                  <motion.div
                    className="absolute inset-0 w-12 h-12 rounded-full border-[3px] border-transparent"
                    style={{ 
                      borderTopColor: '#0171EC',
                      borderRightColor: '#0171EC'
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ 
                      duration: 0.8, 
                      repeat: Infinity, 
                      ease: "linear" 
                    }}
                  />
                  {/* Inner pulse */}
                  <motion.div
                    className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20"
                    animate={{ 
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 0.8, 0.5]
                    }}
                    transition={{ 
                      duration: 1.5, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }}
                  />
                </div>
                
                {/* Text */}
                <div className="flex flex-col items-center gap-1">
                  <motion.span 
                    className="text-sm font-semibold bg-gradient-to-r from-slate-700 to-slate-600 bg-clip-text text-transparent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    Switching context
                  </motion.span>
                  <motion.div 
                    className="flex items-center gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-blue-500"
                        animate={{ 
                          opacity: [0.3, 1, 0.3],
                          scale: [0.8, 1, 0.8]
                        }}
                        transition={{ 
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  );
}
