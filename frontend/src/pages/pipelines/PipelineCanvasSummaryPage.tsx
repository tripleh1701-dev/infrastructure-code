import { useState, useMemo, useCallback, useEffect } from "react";
import { usePipelineBuildLinks } from "@/hooks/usePipelineBuildLinks";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PermissionGate, usePermissionCheck } from "@/components/auth/PermissionGate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GitBranch,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Eye,
  EyeOff,
  Layers,
  Save,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewToggle } from "@/components/ui/view-toggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import { PipelineCanvasRow, PipelineStatus } from "@/types/pipeline";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useAccountContext } from "@/contexts/AccountContext";
import { usePipelines, Pipeline } from "@/hooks/usePipelines";
import { toast } from "sonner";

const statusConfig: Record<PipelineStatus, { icon: React.ElementType; label: string; className: string }> = {
  active: { icon: CheckCircle, label: "Active", className: "bg-[#dcfce7] text-[#16a34a] border border-[#bbf7d0]" },
  draft: { icon: Clock, label: "Draft", className: "bg-[#fef3c7] text-[#d97706] border border-[#fde68a]" },
  inactive: { icon: AlertCircle, label: "Inactive", className: "bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0]" },
  archived: { icon: EyeOff, label: "Archived", className: "bg-[#fee2e2] text-[#dc2626] border border-[#fecaca]" },
};

type GroupByOption = "none" | "enterprise" | "product" | "services";
type SortColumn = "enterpriseName" | "productName" | "status" | "lastUpdated" | "createdBy";

export default function PipelineCanvasSummaryPage() {
  const navigate = useNavigate();
  const { selectedEnterprise } = useEnterpriseContext();
  const { selectedAccount } = useAccountContext();
  const { canCreate, canEdit, canDelete } = usePermissionCheck("pipelines");
  
  // Use database hook
  const { pipelines, isLoading, deletePipeline, isDeleting, refetch } = usePipelines();
  const { isPipelineLinked, getLinkedBuildJobs } = usePipelineBuildLinks();
  
  const [view, setView] = useViewPreference("pipeline-summary", "table");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PipelineStatus>("all");
  const [groupBy, setGroupBy] = useState<GroupByOption>("none");
  const [sortColumn, setSortColumn] = useState<SortColumn>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Transform database pipelines to PipelineCanvasRow format
  const rows: PipelineCanvasRow[] = useMemo(() => {
    return pipelines.map((p) => ({
      id: p.id,
      enterpriseId: p.enterprise_id,
      enterpriseName: selectedEnterprise?.name || "Unknown Enterprise",
      productId: p.product_id || "",
      productName: p.name, // Using pipeline name as product name for now
      serviceIds: p.service_ids || [],
      serviceNames: [], // Would need to fetch service names
      status: p.status as PipelineStatus,
      lastUpdated: p.updated_at,
      createdBy: p.created_by || "Unknown",
    }));
  }, [pipelines, selectedEnterprise]);

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let result = [...rows];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (row) =>
          row.enterpriseName.toLowerCase().includes(query) ||
          row.productName.toLowerCase().includes(query) ||
          row.serviceNames.some((s) => s.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((row) => row.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case "enterpriseName":
          comparison = a.enterpriseName.localeCompare(b.enterpriseName);
          break;
        case "productName":
          comparison = a.productName.localeCompare(b.productName);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "lastUpdated":
          comparison = new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
          break;
        case "createdBy":
          comparison = a.createdBy.localeCompare(b.createdBy);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [rows, searchQuery, statusFilter, sortColumn, sortDirection]);

  // Group rows
  const groupedRows = useMemo(() => {
    if (groupBy === "none") return { "": filteredRows };

    return filteredRows.reduce((acc, row) => {
      let key = "";
      switch (groupBy) {
        case "enterprise":
          key = row.enterpriseName;
          break;
        case "product":
          key = row.productName;
          break;
        case "services":
          key = row.serviceNames.join(", ");
          break;
      }
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {} as Record<string, PipelineCanvasRow[]>);
  }, [filteredRows, groupBy]);

  const handleAddRow = useCallback(() => {
    // Navigate to create new pipeline
    navigate("/pipelines/canvas?mode=create");
  }, [navigate]);

  const handleDeleteRow = useCallback(async (id: string) => {
    // Find pipeline name for link check
    const pipeline = pipelines.find(p => p.id === id);
    if (pipeline && isPipelineLinked(pipeline.name)) {
      const linkedJobs = getLinkedBuildJobs(pipeline.name);
      toast.warning(
        `This pipeline is linked to ${linkedJobs.length} build job(s): ${linkedJobs.join(", ")}. Unlink it from existing builds before deleting.`,
        { duration: 5000 }
      );
      return;
    }
    try {
      await deletePipeline(id);
      refetch();
    } catch (error) {
      console.error("Error deleting pipeline:", error);
    }
  }, [deletePipeline, refetch, pipelines, isPipelineLinked, getLinkedBuildJobs]);

  const handleOpenCanvas = useCallback((row: PipelineCanvasRow) => {
    // Always allow opening — modifications are blocked inside the canvas
    navigate(`/pipelines/canvas?id=${row.id}&mode=edit`);
  }, [navigate]);

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }, [sortColumn]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setGroupBy("none");
  }, []);

  const hasActiveFilters = searchQuery || statusFilter !== "all" || groupBy !== "none";

  return (
    <PermissionGate menuKey="pipelines">
      <div className="min-h-screen bg-[#f8fafc]">
        <Header
          title="Pipeline Canvas"
          subtitle="Manage your pipeline configurations and enterprise-product-service linkups"
          actions={
            <div className="flex items-center gap-2">
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-sm font-medium"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </motion.div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2 bg-card border-border text-foreground hover:bg-muted"
              >
                <Save className="w-4 h-4" />
                Refresh
              </Button>
              {canCreate && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Plus className="w-4 h-4" />
                      Add
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleAddRow}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add New Row
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/pipelines/templates")}>
                      <Layers className="w-4 h-4 mr-2" />
                      Add from Template
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
        />

      <div className="p-6">

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        >
          {[
            { label: "Total Pipelines", value: rows.length, color: "#0171EC" },
            { label: "Active", value: rows.filter((r) => r.status === "active").length, color: "#16a34a" },
            { label: "Draft", value: rows.filter((r) => r.status === "draft").length, color: "#d97706" },
            { label: "Inactive", value: rows.filter((r) => r.status === "inactive").length, color: "#64748b" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl border border-[#e2e8f0] p-4 hover:shadow-md transition-shadow"
            >
              <p className="text-sm text-[#64748b] mb-1">{stat.label}</p>
              <p className="text-2xl font-bold" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </div>
          ))}
        </motion.div>

        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center gap-3 mb-6 bg-white rounded-xl border border-[#e2e8f0] p-4"
        >
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <Input
              type="search"
              placeholder="Search pipelines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white border-[#e2e8f0] text-[#0f172a] placeholder:text-[#94a3b8]"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[140px] bg-white border-[#e2e8f0]">
              <Filter className="w-4 h-4 mr-2 text-[#64748b]" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          {/* Group By */}
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByOption)}>
            <SelectTrigger className="w-[140px] bg-white border-[#e2e8f0]">
              <Layers className="w-4 h-4 mr-2 text-[#64748b]" />
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="services">Services</SelectItem>
            </SelectContent>
          </Select>

          {/* View Toggle */}
          <ViewToggle view={view} onViewChange={setView} />

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-[#64748b] hover:text-[#0f172a]"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </motion.div>

        {/* Table View */}
        {view === "table" ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden"
          >
            {Object.entries(groupedRows).map(([groupName, groupRows]) => (
              <div key={groupName || "all"}>
                {groupBy !== "none" && groupName && (
                  <div className="px-5 py-3 bg-[#f8fafc] border-b border-[#e2e8f0]">
                    <h3 className="font-semibold text-[#0f172a]">{groupName}</h3>
                  </div>
                )}
                <table className="w-full">
                  {(!groupName || groupBy === "none") && (
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                        <th
                          className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider cursor-pointer hover:text-[#0f172a]"
                          onClick={() => handleSort("enterpriseName")}
                        >
                          <div className="flex items-center gap-1">
                            Pipeline Name
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th
                          className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider cursor-pointer hover:text-[#0f172a]"
                          onClick={() => handleSort("productName")}
                        >
                          <div className="flex items-center gap-1">
                            Details (Product)
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">
                          Services
                        </th>
                        <th
                          className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider cursor-pointer hover:text-[#0f172a]"
                          onClick={() => handleSort("status")}
                        >
                          <div className="flex items-center gap-1">
                            Status
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th
                          className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider cursor-pointer hover:text-[#0f172a]"
                          onClick={() => handleSort("lastUpdated")}
                        >
                          <div className="flex items-center gap-1">
                            Last Updated
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th
                          className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider cursor-pointer hover:text-[#0f172a]"
                          onClick={() => handleSort("createdBy")}
                        >
                          <div className="flex items-center gap-1">
                            Created By
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {groupRows.map((row, index) => {
                        const status = statusConfig[row.status];
                        const StatusIcon = status.icon;

                        return (
                          <motion.tr
                            key={row.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ delay: index * 0.03 }}
                            className={cn(
                              "border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors group",
                              row.isNew && "bg-[#eff6ff]",
                              row.isModified && "bg-[#fefce8]"
                            )}
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#0171EC]/10 flex items-center justify-center">
                                  <GitBranch className="w-4 h-4 text-[#0171EC]" />
                                </div>
                                <span className="font-medium text-[#0f172a]">{row.enterpriseName || "—"}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className="px-2 py-0.5 bg-[#f1f5f9] rounded text-xs text-[#334155]">
                                {row.productName || "—"}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap gap-1">
                                {row.serviceNames.length > 0 ? (
                                  row.serviceNames.map((service) => (
                                    <span
                                      key={service}
                                      className="px-2 py-0.5 bg-[#e0f2fe] text-[#0369a1] rounded text-xs"
                                    >
                                      {service}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[#94a3b8]">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                  status.className
                                )}
                              >
                                <StatusIcon className="w-3 h-3" />
                                {status.label}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm text-[#64748b]">
                              {new Date(row.lastUpdated).toLocaleDateString()}
                            </td>
                            <td className="px-5 py-4 text-sm text-[#64748b]">{row.createdBy}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-[#64748b] hover:text-[#0171EC] hover:bg-[#0171EC]/10"
                                  onClick={() => handleOpenCanvas(row)}
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-[#64748b] hover:text-[#dc2626] hover:bg-[#fee2e2]"
                                    onClick={() => handleDeleteRow(row.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            ))}

            {filteredRows.length === 0 && (
              <div className="text-center py-12">
                <GitBranch className="w-12 h-12 text-[#cbd5e1] mx-auto mb-4" />
                <p className="text-[#64748b]">No pipelines found</p>
                <Button
                  variant="link"
                  className="text-[#0171EC] mt-2"
                  onClick={handleAddRow}
                >
                  Add your first pipeline
                </Button>
              </div>
            )}
          </motion.div>
        ) : (
          /* Card View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredRows.map((row, index) => {
                const status = statusConfig[row.status];
                const StatusIcon = status.icon;

                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "bg-white rounded-xl border border-[#e2e8f0] p-5 hover:shadow-lg transition-all duration-200 cursor-pointer group",
                      row.isNew && "border-[#3b82f6] bg-[#eff6ff]"
                    )}
                    onClick={() => handleOpenCanvas(row)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#0171EC]/10 flex items-center justify-center">
                          <GitBranch className="w-5 h-5 text-[#0171EC]" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-[#0f172a] group-hover:text-[#0171EC] transition-colors">
                            {row.enterpriseName || "New Pipeline"}
                          </h3>
                          <p className="text-xs text-[#64748b]">{row.productName || "—"}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenCanvas(row); }}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open Canvas
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {canDelete && (
                            <DropdownMenuItem
                              className="text-[#dc2626]"
                              onClick={(e) => { e.stopPropagation(); handleDeleteRow(row.id); }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-4">
                      {row.serviceNames.map((service) => (
                        <span
                          key={service}
                          className="px-2 py-0.5 bg-[#e0f2fe] text-[#0369a1] rounded text-xs"
                        >
                          {service}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#e2e8f0]">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                          status.className
                        )}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                      <span className="text-xs text-[#64748b]">
                        {new Date(row.lastUpdated).toLocaleDateString()}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        </div>
      </div>
    </PermissionGate>
  );
}
