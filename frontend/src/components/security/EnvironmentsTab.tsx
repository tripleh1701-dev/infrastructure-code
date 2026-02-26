import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Eye,
  Layers,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  Loader2,
  Globe,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  ArrowUp,
  ArrowDown,
  ClipboardList,
  Code,
  Hammer,
  FlaskConical,
  Tag,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/components/ui/view-toggle";
import { toast } from "sonner";
import { useEnvironments, type EnvironmentRecord } from "@/hooks/useEnvironments";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { AddEnvironmentDialog } from "./AddEnvironmentDialog";
import { EditEnvironmentDialog } from "./EditEnvironmentDialog";
import { DeleteEnvironmentDialog } from "./DeleteEnvironmentDialog";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { testConnectivity } from "@/lib/testConnectivity";
import type { EnvironmentConnectorRecord } from "@/hooks/useEnvironments";

const CATEGORY_STYLES: Record<string, string> = {
  plan: "bg-sky-100 text-sky-700",
  code: "bg-violet-100 text-violet-700",
  build: "bg-orange-100 text-orange-700",
  test: "bg-teal-100 text-teal-700",
  release: "bg-pink-100 text-pink-700",
  deploy: "bg-indigo-100 text-indigo-700",
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: ClipboardList,
  code: Code,
  build: Hammer,
  test: FlaskConical,
  release: Tag,
  deploy: Rocket,
};

function ConnectorSummaryBadges({ connectors }: { connectors: EnvironmentConnectorRecord[] }) {
  const active = connectors.filter(c => c.connector && c.status !== false);
  if (active.length === 0) return <span className="text-slate-400">—</span>;

  // Group by category
  const byCategory: Record<string, string[]> = {};
  active.forEach(c => {
    const cat = (c.category || "other").toLowerCase();
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(c.connector!);
  });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {Object.entries(byCategory).map(([cat, tools]) => {
        const IconComp = CATEGORY_ICONS[cat] || Layers;
        return (
          <Badge
            key={cat}
            variant="secondary"
            className={cn("text-[10px] px-1.5 py-0 font-medium capitalize gap-0.5", CATEGORY_STYLES[cat] || "bg-slate-100 text-slate-600")}
            title={tools.join(", ")}
          >
            <IconComp className="w-3 h-3" />
            {cat} · {tools.length}
          </Badge>
        );
      })}
      {active.length > 1 && (
        <span className="text-[10px] text-muted-foreground ml-0.5">{active.length} total</span>
      )}
    </div>
  );
}
import { httpClient } from "@/lib/api/http-client";

type ColumnKey = "name" | "description" | "workstream" | "product" | "service" | "connector" | "status" | "actions";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  sortable: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Environment Name", sortable: true },
  { key: "description", label: "Description", sortable: true },
  { key: "workstream", label: "Workstream", sortable: true },
  { key: "product", label: "Product", sortable: true },
  { key: "service", label: "Service", sortable: true },
  { key: "connector", label: "Connector", sortable: true },
  { key: "status", label: "Status", sortable: false },
  { key: "actions", label: "Actions", sortable: false },
];

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
} as const;

interface EnvironmentsTabProps {
  externalAddOpen?: boolean;
  onExternalAddOpenChange?: (open: boolean) => void;
  viewMode?: ViewMode;
}

export function EnvironmentsTab({ externalAddOpen, onExternalAddOpenChange, viewMode = "table" }: EnvironmentsTabProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  const { environments, isLoading, updateEnvironment, deleteEnvironment } =
    useEnvironments(accountId, enterpriseId);
  const { workstreams } = useWorkstreams(accountId, enterpriseId);

  // Products & Services for display
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchMeta = async () => {
      if (isExternalApi()) {
        const [pRes, sRes] = await Promise.all([
          httpClient.get<any[]>("/products"),
          httpClient.get<any[]>("/services"),
        ]);
        setProducts((pRes.data || []).map((p: any) => ({ id: p.id, name: p.name })));
        setServices((sRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
      } else {
        const [pRes, sRes] = await Promise.all([
          supabase.from("products").select("id, name"),
          supabase.from("services").select("id, name"),
        ]);
        setProducts((pRes.data || []) as { id: string; name: string }[]);
        setServices((sRes.data || []) as { id: string; name: string }[]);
      }
    };
    fetchMeta();
  }, []);

  // Dialog state
  const [addOpenInternal, setAddOpenInternal] = useState(false);
  const addOpen = externalAddOpen ?? addOpenInternal;
  const setAddOpen = (open: boolean) => {
    if (onExternalAddOpenChange) onExternalAddOpenChange(open);
    setAddOpenInternal(open);
  };
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<EnvironmentRecord | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Toolbar state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<ColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS.map(c => c.key)));
  const [groupBy, setGroupBy] = useState<string>("none");
  const [columnSearch, setColumnSearch] = useState("");

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterDescription, setFilterDescription] = useState("");
  const [filterWorkstream, setFilterWorkstream] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterService, setFilterService] = useState("all");

  // Resolve names
  const enrichedEnvironments = useMemo(() => {
    return environments.map(env => ({
      ...env,
      workstream: env.workstream || workstreams.find(w => w.id === env.workstream_id) || null,
      product: env.product || products.find(p => p.id === env.product_id) || null,
      service: env.service || services.find(s => s.id === env.service_id) || null,
    }));
  }, [environments, workstreams, products, services]);

  // Filtering
  const filteredEnvironments = useMemo(() => {
    return enrichedEnvironments.filter(env => {
      const sl = searchQuery.toLowerCase();
      const matchesSearch = !sl ||
        env.name.toLowerCase().includes(sl) ||
        (env.description || "").toLowerCase().includes(sl) ||
        (env.workstream?.name || "").toLowerCase().includes(sl) ||
        (env.product?.name || "").toLowerCase().includes(sl) ||
        (env.service?.name || "").toLowerCase().includes(sl);

      const matchesFilterName = !filterName || env.name.toLowerCase().includes(filterName.toLowerCase());
      const matchesFilterDesc = !filterDescription || (env.description || "").toLowerCase().includes(filterDescription.toLowerCase());
      const matchesFilterWs = filterWorkstream === "all" || env.workstream_id === filterWorkstream;
      const matchesFilterProd = filterProduct === "all" || env.product_id === filterProduct;
      const matchesFilterSvc = filterService === "all" || env.service_id === filterService;

      return matchesSearch && matchesFilterName && matchesFilterDesc && matchesFilterWs && matchesFilterProd && matchesFilterSvc;
    });
  }, [enrichedEnvironments, searchQuery, filterName, filterDescription, filterWorkstream, filterProduct, filterService]);

  // Sorting
  const sortedEnvironments = useMemo(() => {
    if (!sortColumn) return filteredEnvironments;
    return [...filteredEnvironments].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      switch (sortColumn) {
        case "name": aVal = a.name; bVal = b.name; break;
        case "description": aVal = a.description || ""; bVal = b.description || ""; break;
        case "workstream": aVal = a.workstream?.name || ""; bVal = b.workstream?.name || ""; break;
        case "product": aVal = a.product?.name || ""; bVal = b.product?.name || ""; break;
        case "service": aVal = a.service?.name || ""; bVal = b.service?.name || ""; break;
        case "connector": aVal = a.connector_name || ""; bVal = b.connector_name || ""; break;
        default: return 0;
      }
      const cmp = aVal.localeCompare(bVal);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredEnvironments, sortColumn, sortDirection]);

  // Grouping
  const groupedEnvironments = useMemo(() => {
    if (groupBy === "none") return { "": sortedEnvironments };
    const groups: Record<string, typeof sortedEnvironments> = {};
    sortedEnvironments.forEach(env => {
      let key = "";
      switch (groupBy) {
        case "name": key = env.name; break;
        case "description": key = env.description || "(none)"; break;
        case "workstream": key = env.workstream?.name || "(none)"; break;
        case "product": key = env.product?.name || "(none)"; break;
        case "service": key = env.service?.name || "(none)"; break;
        default: key = "";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(env);
    });
    return groups;
  }, [sortedEnvironments, groupBy]);

  // Handlers
  const handleSort = (col: ColumnKey) => {
    if (sortColumn === col) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearAllFilters = () => {
    setFilterName("");
    setFilterDescription("");
    setFilterWorkstream("all");
    setFilterProduct("all");
    setFilterService("all");
    setFilterOpen(false);
  };

  const hasActiveFilters = filterName || filterDescription || filterWorkstream !== "all" || filterProduct !== "all" || filterService !== "all";

  const handleEdit = (env: EnvironmentRecord) => {
    setSelectedEnv(env);
    setEditOpen(true);
  };

  const handleEditSave = async (id: string, data: Record<string, any>) => {
    await updateEnvironment.mutateAsync({ id, ...data });
    toast.success("Environment updated");
  };

  const handleDelete = (env: EnvironmentRecord) => {
    setSelectedEnv(env);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedEnv) return;
    await deleteEnvironment.mutateAsync(selectedEnv.id);
    setDeleteOpen(false);
    setSelectedEnv(null);
  };

  const handleTestConnectivity = async (env: EnvironmentRecord) => {
    // New multi-connector model: test the first active connector that has enough info
    const activeConnectors = (env.connectors || []).filter(c => c.status !== false && c.connector);
    
    if (activeConnectors.length === 0 && !env.connector_name) {
      toast.error("No connector configured for this environment");
      return;
    }

    setTestingId(env.id);
    try {
      let overallSuccess = true;
      let lastMessage = "";

      // If we have new-style connectors, test each
      if (activeConnectors.length > 0) {
        for (const conn of activeConnectors) {
          const isCloudFoundry = conn.connector === "Cloud Foundry";
          
          // For Cloud Foundry: use hostUrl + look up credential by iflowCredentialName
          // For others: use url + look up credential by credentialName
          let testUrl = "";
          let credentialId = "";
          let credentialName = "";

          if (isCloudFoundry) {
            testUrl = conn.hostUrl || conn.apiUrl || "";
            credentialName = conn.iflowCredentialName || conn.apiCredentialName || "";
          } else {
            testUrl = conn.url || "";
            credentialName = conn.credentialName || "";
          }

          // Look up credential by name to get credentialId
          if (credentialName && !isExternalApi()) {
            const { data: creds } = await (supabase as any)
              .from("credentials")
              .select("id")
              .eq("name", credentialName)
              .eq("account_id", accountId!)
              .eq("enterprise_id", enterpriseId!)
              .limit(1);
            if (creds && creds.length > 0) {
              credentialId = creds[0].id;
            }
          }

          if (!testUrl) {
            lastMessage = `No URL configured for ${conn.connector}`;
            overallSuccess = false;
            continue;
          }

          if (!credentialId && !isExternalApi()) {
            lastMessage = `Credential "${credentialName}" not found for ${conn.connector}`;
            overallSuccess = false;
            continue;
          }

          const connectorKey = (conn.connector || "").toLowerCase().replace(/\s+/g, "_");

          const result = await testConnectivity({
            connector: connectorKey,
            url: testUrl,
            credentialId,
            credentialName,
          });

          if (!result?.success) {
            overallSuccess = false;
            lastMessage = result?.message || `Connection failed for ${conn.connector}`;
          } else {
            lastMessage = result?.message || `Connected to ${conn.connector}`;
          }
        }
      } else {
        // Fallback: legacy connector_name approach
        const toolKey = env.connector_name!;
        let connectorUrl = "";
        let credentialId = "";

        if (!isExternalApi()) {
          const { data: connectors } = await (supabase as any)
            .from("connectors")
            .select("url, credential_id, connector_tool")
            .eq("connector_tool", toolKey)
            .eq("account_id", accountId!)
            .eq("enterprise_id", enterpriseId!)
            .limit(1);
          if (connectors && connectors.length > 0) {
            connectorUrl = connectors[0].url || "";
            credentialId = connectors[0].credential_id || "";
          }
        }

        if (!connectorUrl && !credentialId) {
          toast.info("No matching connector found to test connectivity.");
          setTestingId(null);
          return;
        }

        const result = await testConnectivity({
          connector: toolKey.toLowerCase().replace(/\s+/g, "_"),
          url: connectorUrl,
          credentialId,
        });

        overallSuccess = !!result?.success;
        lastMessage = result?.message || "";
      }

      const newStatus = overallSuccess ? "healthy" : "failed";
      await updateEnvironment.mutateAsync({ id: env.id, connectivity_status: newStatus });
      if (overallSuccess) {
        toast.success(lastMessage || "Connection successful");
      } else {
        toast.error(lastMessage || "Connection failed");
      }
    } catch {
      await updateEnvironment.mutateAsync({ id: env.id, connectivity_status: "failed" });
      toast.error("Connectivity test failed");
    } finally {
      setTestingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return <Badge className="gap-1 bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3" />Healthy</Badge>;
      case "failed":
        return <Badge className="gap-1 bg-red-100 text-red-700"><XCircle className="w-3 h-3" />Failed</Badge>;
      default:
        return <Badge className="gap-1 bg-slate-100 text-slate-600"><AlertTriangle className="w-3 h-3" />Unknown</Badge>;
    }
  };

  const filteredColumns = ALL_COLUMNS.filter(c => {
    if (!columnSearch) return true;
    return c.label.toLowerCase().includes(columnSearch.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-2">
        {/* Create New – opens modal */}
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white">
          <Plus className="w-4 h-4" /> Create New
        </Button>

        {/* Global Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search environments..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 w-56 h-9 bg-white/80 text-sm"
          />
        </div>

        {/* Filter */}
        <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1.5", hasActiveFilters && "border-primary text-primary")}>
              <Filter className="w-3.5 h-3.5" /> Filter
              {hasActiveFilters && <span className="ml-1 w-2 h-2 rounded-full bg-primary" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 p-3 space-y-3">
            <DropdownMenuLabel>Filter Environments</DropdownMenuLabel>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Environment Name</label>
              <Input value={filterName} onChange={e => setFilterName(e.target.value)} placeholder="Filter by name" className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={filterDescription} onChange={e => setFilterDescription(e.target.value)} placeholder="Filter by description" className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Workstream</label>
              <Select value={filterWorkstream} onValueChange={setFilterWorkstream}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {workstreams.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Product</label>
              <Select value={filterProduct} onValueChange={setFilterProduct}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Service</label>
              <Select value={filterService} onValueChange={setFilterService}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DropdownMenuSeparator />
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>Clear All</Button>
              <Button size="sm" onClick={() => setFilterOpen(false)}>Apply</Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5" /> Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {ALL_COLUMNS.filter(c => c.sortable).map(col => (
              <DropdownMenuItem key={col.key} onClick={() => handleSort(col.key)} className="gap-2">
                {col.label}
                {sortColumn === col.key && (sortDirection === "asc" ? <ArrowUp className="w-3 h-3 ml-auto" /> : <ArrowDown className="w-3 h-3 ml-auto" />)}
              </DropdownMenuItem>
            ))}
            {sortColumn && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setSortColumn(null); setSortDirection("asc"); }}>Clear Sort</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Show/Hide */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <div className="p-2">
              <Input placeholder="Search columns..." value={columnSearch} onChange={e => setColumnSearch(e.target.value)} className="h-8 text-sm" />
            </div>
            <DropdownMenuSeparator />
            {filteredColumns.map(col => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={visibleColumns.has(col.key)}
                onCheckedChange={() => toggleColumn(col.key)}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Group by */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1.5", groupBy !== "none" && "border-primary text-primary")}>
              <Layers className="w-3.5 h-3.5" /> Group
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Group by</DropdownMenuLabel>
            {[
              { value: "none", label: "None" },
              { value: "name", label: "Environment Name" },
              { value: "workstream", label: "Workstream" },
              { value: "product", label: "Product" },
              { value: "service", label: "Service" },
            ].map(opt => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setGroupBy(opt.value)}
                className={cn(groupBy === opt.value && "font-semibold")}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      {/* Active filters indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active filters:</span>
          {filterName && <Badge variant="secondary" className="gap-1 text-xs">{`Name: ${filterName}`}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilterName("")} /></Badge>}
          {filterDescription && <Badge variant="secondary" className="gap-1 text-xs">{`Desc: ${filterDescription}`}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilterDescription("")} /></Badge>}
          {filterWorkstream !== "all" && <Badge variant="secondary" className="gap-1 text-xs">{`WS: ${workstreams.find(w => w.id === filterWorkstream)?.name}`}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilterWorkstream("all")} /></Badge>}
          {filterProduct !== "all" && <Badge variant="secondary" className="gap-1 text-xs">{`Prod: ${products.find(p => p.id === filterProduct)?.name}`}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilterProduct("all")} /></Badge>}
          {filterService !== "all" && <Badge variant="secondary" className="gap-1 text-xs">{`Svc: ${services.find(s => s.id === filterService)?.name}`}<X className="w-3 h-3 cursor-pointer" onClick={() => setFilterService("all")} /></Badge>}
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-6">Clear All</Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <motion.div variants={itemVariants} className="flex items-center justify-center py-12 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading environments...</span>
        </motion.div>
      ) : sortedEnvironments.length === 0 ? (
        <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-12 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60">
          <Globe className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-lg font-medium text-slate-600">No environments found</h3>
          <p className="text-sm text-slate-400 mt-1">
            {searchQuery || hasActiveFilters ? "Try adjusting your filters" : "Create your first environment"}
          </p>
          {!searchQuery && !hasActiveFilters && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Create Environment
            </Button>
          )}
        </motion.div>
      ) : (
        viewMode === "table" ? (
        Object.entries(groupedEnvironments).map(([groupKey, envs]) => (
          <div key={groupKey || "__all"}>
            {groupBy !== "none" && groupKey && (
              <div className="flex items-center gap-2 mb-2 px-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm text-slate-700">{groupKey}</span>
                <Badge variant="secondary" className="text-xs">{envs.length}</Badge>
              </div>
            )}
            <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-lg shadow-slate-200/30 overflow-hidden mb-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    {visibleColumns.has("name") && (
                      <TableHead className="font-semibold cursor-pointer select-none" onClick={() => handleSort("name")}>
                        <div className="flex items-center gap-1">Environment Name {sortColumn === "name" && (sortDirection === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div>
                      </TableHead>
                    )}
                    {visibleColumns.has("description") && <TableHead className="font-semibold cursor-pointer select-none" onClick={() => handleSort("description")}><div className="flex items-center gap-1">Description {sortColumn === "description" && (sortDirection === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div></TableHead>}
                    {visibleColumns.has("workstream") && <TableHead className="font-semibold cursor-pointer select-none" onClick={() => handleSort("workstream")}><div className="flex items-center gap-1">Workstream {sortColumn === "workstream" && (sortDirection === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div></TableHead>}
                    {visibleColumns.has("product") && <TableHead className="font-semibold cursor-pointer select-none" onClick={() => handleSort("product")}><div className="flex items-center gap-1">Product {sortColumn === "product" && (sortDirection === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div></TableHead>}
                    {visibleColumns.has("service") && <TableHead className="font-semibold cursor-pointer select-none" onClick={() => handleSort("service")}><div className="flex items-center gap-1">Service {sortColumn === "service" && (sortDirection === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</div></TableHead>}
                    {visibleColumns.has("connector") && <TableHead className="font-semibold">Connector</TableHead>}
                    {visibleColumns.has("status") && <TableHead className="font-semibold">Status</TableHead>}
                    {visibleColumns.has("actions") && <TableHead className="w-20">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {envs.map((env, index) => (
                      <motion.tr
                        key={env.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="group hover:bg-blue-50/50 transition-colors"
                      >
                        {visibleColumns.has("name") && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-teal-500 flex-shrink-0" />
                              <span className="font-medium text-slate-800">{env.name}</span>
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.has("description") && (
                          <TableCell className="text-slate-600 text-sm max-w-[200px] truncate">{env.description || "—"}</TableCell>
                        )}
                        {visibleColumns.has("workstream") && (
                          <TableCell>
                            {env.workstream ? (
                              <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-xs">{env.workstream.name}</Badge>
                            ) : <span className="text-slate-400">—</span>}
                          </TableCell>
                        )}
                        {visibleColumns.has("product") && (
                          <TableCell>
                            {env.product ? (
                              <Badge variant="secondary" className="bg-purple-50 text-purple-700 text-xs">{env.product.name}</Badge>
                            ) : <span className="text-slate-400">—</span>}
                          </TableCell>
                        )}
                        {visibleColumns.has("service") && (
                          <TableCell>
                            {env.service ? (
                              <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-xs">{env.service.name}</Badge>
                            ) : <span className="text-slate-400">—</span>}
                          </TableCell>
                        )}
                        {visibleColumns.has("connector") && (
                          <TableCell>
                            {env.connectors && env.connectors.length > 0 ? (
                              <ConnectorSummaryBadges connectors={env.connectors} />
                            ) : env.connector_name ? (
                              <Badge variant="outline" className="text-xs">{env.connector_name}</Badge>
                            ) : <span className="text-slate-400">—</span>}
                          </TableCell>
                        )}
                        {visibleColumns.has("status") && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(env.connectivity_status)}
                              {(env.connector_name || (env.connectors && env.connectors.length > 0)) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => handleTestConnectivity(env)}
                                  disabled={testingId === env.id}
                                >
                                  {testingId === env.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.has("actions") && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => handleEdit(env)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => handleDelete(env)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </motion.div>
          </div>
        ))
        ) : (
          <motion.div 
            className="responsive-grid-lg"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            <AnimatePresence mode="popLayout">
              {sortedEnvironments.map((env) => (
                <motion.div
                  key={env.id}
                  variants={{
                    rest: { scale: 1, y: 0 },
                    hover: { scale: 1.02, y: -4, transition: { type: "spring", stiffness: 400, damping: 17 } }
                  }}
                  initial="rest"
                  whileHover="hover"
                  layout
                  className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 cursor-pointer shadow-lg shadow-slate-200/30 overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-4">
                    <motion.div 
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      className={cn(
                        "w-14 h-14 rounded-xl flex items-center justify-center shadow-sm",
                        env.connectivity_status === "healthy" 
                          ? "bg-gradient-to-br from-emerald-100 to-emerald-200" 
                          : env.connectivity_status === "failed"
                          ? "bg-gradient-to-br from-red-100 to-red-200"
                          : "bg-gradient-to-br from-slate-100 to-slate-200"
                      )}
                    >
                      <Globe className={cn(
                        "w-7 h-7",
                        env.connectivity_status === "healthy" ? "text-emerald-600" : 
                        env.connectivity_status === "failed" ? "text-red-500" : "text-slate-400"
                      )} />
                    </motion.div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem className="gap-2" onClick={() => handleEdit(env)}>
                          <Pencil className="w-4 h-4" />
                          Edit
                        </DropdownMenuItem>
                        {(env.connector_name || (env.connectors && env.connectors.length > 0)) && (
                          <DropdownMenuItem 
                            className="gap-2" 
                            onClick={() => handleTestConnectivity(env)}
                            disabled={testingId === env.id}
                          >
                            {testingId === env.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Zap className="w-4 h-4" />
                            )}
                            {testingId === env.id ? "Testing..." : "Test Connection"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="gap-2 text-destructive" onClick={() => handleDelete(env)}>
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  <div className="mb-3">
                    <h3 className="font-semibold text-slate-800 text-lg">{env.name}</h3>
                    {env.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{env.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {getStatusBadge(env.connectivity_status)}
                    {env.connectors && env.connectors.length > 0 ? (
                      <ConnectorSummaryBadges connectors={env.connectors} />
                    ) : env.connector_name ? (
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                        {env.connector_name}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    {env.workstream && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Workstream</span>
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-xs">{env.workstream.name}</Badge>
                      </div>
                    )}
                    {env.product && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Product</span>
                        <Badge variant="secondary" className="bg-purple-50 text-purple-700 text-xs">{env.product.name}</Badge>
                      </div>
                    )}
                    {env.service && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Service</span>
                        <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-xs">{env.service.name}</Badge>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )
      )}

      {/* Add Environment Dialog */}
      <AddEnvironmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingEnvironments={environments.map(e => ({
          name: e.name,
          workstream_id: e.workstream_id,
          product_id: e.product_id,
          service_id: e.service_id,
        }))}
      />

      {/* Edit Dialog */}
      <EditEnvironmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        environment={selectedEnv}
        onSave={handleEditSave}
      />

      {/* Delete Dialog */}
      <DeleteEnvironmentDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        environmentName={selectedEnv?.name || ""}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
