import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";
import {
  Layers,
  Plus,
  Settings,
  Trash2,
  Building2,
  Globe,
  ChevronRight,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useWorkstreams, Workstream } from "@/hooks/useWorkstreams";
import { AddWorkstreamDialog } from "./AddWorkstreamDialog";
import { EditWorkstreamDialog } from "./EditWorkstreamDialog";
import { WorkstreamToolsConfig, ToolSelection, TOOL_CATEGORIES } from "./WorkstreamToolsConfig";

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function WorkstreamSummary() {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { workstreams, isLoading, refetch, updateWorkstream, deleteWorkstream } = useWorkstreams(
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingWorkstream, setEditingWorkstream] = useState<Workstream | null>(null);
  const [renamingWorkstream, setRenamingWorkstream] = useState<Workstream | null>(null);
  const [deletingWorkstream, setDeletingWorkstream] = useState<Workstream | null>(null);
  const [editingTools, setEditingTools] = useState<ToolSelection>([]);

  const handleEditTools = (workstream: Workstream) => {
    setEditingWorkstream(workstream);
    setEditingTools(
      workstream.tools?.map((t) => ({ category: t.category, tool_name: t.tool_name })) || []
    );
  };

  const handleSaveTools = async (tools: ToolSelection) => {
    if (editingWorkstream) {
      await updateWorkstream.mutateAsync({
        id: editingWorkstream.id,
        tools,
      });
      setEditingWorkstream(null);
    }
  };

  const handleSaveName = async (id: string, name: string) => {
    await updateWorkstream.mutateAsync({ id, name });
  };

  const handleDelete = async () => {
    if (deletingWorkstream) {
      await deleteWorkstream.mutateAsync(deletingWorkstream.id);
      setDeletingWorkstream(null);
    }
  };

  const getToolsByCategory = (workstream: Workstream) => {
    const grouped: Record<string, string[]> = {};
    workstream.tools?.forEach((t) => {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t.tool_name);
    });
    return grouped;
  };

  if (isLoading) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm border-slate-200/60 shadow-lg">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        transition={{ duration: 0.3 }}
      >
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200/60 shadow-lg overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-4 bg-gradient-to-r from-violet-50/50 to-transparent border-b">
            <div className="flex items-center gap-3">
              <motion.div
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-200/50"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                <Layers className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <CardTitle className="text-lg font-semibold text-slate-800">
                  Workstream Summary
                </CardTitle>
                <p className="text-sm text-slate-500">
                  {workstreams.length} workstream{workstreams.length !== 1 ? "s" : ""} configured
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => refetch()}
                    className="h-9 w-9"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
              <Button
                onClick={() => setShowAddDialog(true)}
                className="gap-2 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800"
              >
                <Plus className="w-4 h-4" />
                Add Workstream
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            {workstreams.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-4">
                  <Layers className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-700 mb-1">
                  No Workstreams Yet
                </h3>
                <p className="text-sm text-slate-500 mb-4 max-w-sm">
                  Create your first workstream to define CI/CD tool configurations
                </p>
                <Button
                  onClick={() => setShowAddDialog(true)}
                  className="gap-2 bg-gradient-to-r from-violet-600 to-violet-700"
                >
                  <Plus className="w-4 h-4" />
                  Create Workstream
                </Button>
              </motion.div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {workstreams.map((workstream, index) => {
                    const toolsByCategory = getToolsByCategory(workstream);
                    const totalTools = workstream.tools?.length || 0;

                    return (
                      <motion.div
                        key={workstream.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.05 }}
                        whileHover={{ scale: 1.005, x: 4 }}
                        className="group border border-slate-200/60 rounded-xl bg-white hover:border-violet-200 hover:shadow-md transition-all duration-200 overflow-visible"
                      >
                        <div className="p-4 overflow-visible">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white font-bold shadow-sm">
                                {workstream.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-semibold text-slate-800">
                                  {workstream.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                                  <Building2 className="w-3 h-3" />
                                  <span>{workstream.account?.name || "—"}</span>
                                  <ChevronRight className="w-3 h-3" />
                                  <Globe className="w-3 h-3" />
                                  <span>{workstream.enterprise?.name || "—"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-500 hover:text-amber-600"
                                    onClick={() => setRenamingWorkstream(workstream)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Rename</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-500 hover:text-blue-600"
                                    onClick={() => handleEditTools(workstream)}
                                  >
                                    <Settings className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Configure Tools</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-500 hover:text-red-600"
                                    onClick={() => setDeletingWorkstream(workstream)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          {/* Tool Summary */}
                          {totalTools > 0 ? (
                            <div className="flex flex-wrap gap-2 overflow-visible relative">
                              {Object.entries(toolsByCategory).map(([category, tools]) => {
                                const config = TOOL_CATEGORIES[category as keyof typeof TOOL_CATEGORIES];
                                const Icon = config?.icon;
                                return (
                                  <div
                                    key={category}
                                    className="group/category relative"
                                  >
                                    <motion.div
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                    >
                                      <Badge
                                        variant="secondary"
                                        className={cn(
                                          "gap-1.5 cursor-pointer transition-all duration-200",
                                          "hover:ring-2 hover:ring-offset-1 hover:ring-violet-300/50 hover:shadow-sm",
                                          config?.bgColor
                                        )}
                                      >
                                        {Icon && <Icon className="w-3 h-3" />}
                                        {category}: {tools.length}
                                      </Badge>
                                    </motion.div>
                                    {/* Dropdown positioned above the badge */}
                                    <div className="absolute left-0 bottom-full mb-2 z-[100] opacity-0 invisible group-hover/category:opacity-100 group-hover/category:visible pointer-events-none group-hover/category:pointer-events-auto transition-all duration-150">
                                      <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ 
                                          type: "spring", 
                                          stiffness: 400, 
                                          damping: 25,
                                          mass: 0.8
                                        }}
                                        className="bg-white border border-slate-200 rounded-xl shadow-2xl p-2.5 min-w-[160px]"
                                      >
                                        {/* Header with gradient accent */}
                                        <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-100">
                                          <div className={cn(
                                            "w-5 h-5 rounded-md flex items-center justify-center bg-gradient-to-br text-white shadow-sm",
                                            config?.gradient
                                          )}>
                                            {Icon && <Icon className="w-3 h-3" />}
                                          </div>
                                          <span className="text-xs font-semibold text-slate-700">
                                            {category}
                                          </span>
                                        </div>
                                        {/* Tool list with staggered animation */}
                                        <div className="space-y-1">
                                          {tools.map((t, toolIdx) => {
                                            // Find the tool config to get its icon
                                            const toolConfig = config?.tools.find(tc => tc.name === t);
                                            const ToolIcon = toolConfig?.icon;
                                            const toolColor = toolConfig?.color;
                                            
                                            return (
                                              <motion.div
                                                key={t}
                                                initial={{ opacity: 0, x: -10 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                transition={{ 
                                                  delay: toolIdx * 0.05,
                                                  type: "spring",
                                                  stiffness: 300,
                                                  damping: 20
                                                }}
                                                className="text-xs text-slate-600 flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-50/80 hover:bg-slate-100 transition-colors"
                                              >
                                                <motion.div 
                                                  className={cn(
                                                    "w-5 h-5 rounded flex items-center justify-center text-white shadow-sm",
                                                    toolColor || "bg-slate-400"
                                                  )}
                                                  initial={{ scale: 0 }}
                                                  whileInView={{ scale: 1 }}
                                                  transition={{ delay: toolIdx * 0.05 + 0.1 }}
                                                >
                                                  {ToolIcon && <ToolIcon className="w-3 h-3" />}
                                                </motion.div>
                                                <span className="font-medium">{t}</span>
                                              </motion.div>
                                            );
                                          })}
                                        </div>
                                      </motion.div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-400 italic">
                              No tools configured
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <AddWorkstreamDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => refetch()}
      />

      <EditWorkstreamDialog
        open={!!renamingWorkstream}
        onOpenChange={(open) => !open && setRenamingWorkstream(null)}
        workstream={renamingWorkstream}
        existingWorkstreams={workstreams}
        onSave={handleSaveName}
      />

      {editingWorkstream && (
        <WorkstreamToolsConfig
          open={!!editingWorkstream}
          onOpenChange={(open) => !open && setEditingWorkstream(null)}
          selectedTools={editingTools}
          onSave={handleSaveTools}
        />
      )}

      <AlertDialog
        open={!!deletingWorkstream}
        onOpenChange={(open) => !open && setDeletingWorkstream(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workstream</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingWorkstream?.name}"? This action
              cannot be undone and will remove all associated tool configurations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
