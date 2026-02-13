import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ViewToggle, ViewMode } from "@/components/ui/view-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Filter,
  ArrowUpDown,
  Columns3,
  Layers,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const columnLabels: Record<string, string> = {
  connector_name: "Job Name",
  description: "Description",
  entity: "Workstream",
  pipeline: "Pipeline Name",
  status: "Status",
  scope: "Artifacts",
  builds: "Builds",
};

const sortableColumns = ["connector_name", "description", "entity", "pipeline"];
const groupByOptions = [
  { value: null, label: "None" },
  { value: "connector_name", label: "Job Name" },
  { value: "description", label: "Description" },
  { value: "entity", label: "Workstream" },
  { value: "pipeline", label: "Pipeline" },
];

interface BuildsToolbarProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  activeTab: string;
  onTabChange: (v: string) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  onSortChange: (col: string, dir: "asc" | "desc") => void;
  onClearSort: () => void;
  groupBy: string | null;
  onGroupByChange: (v: string | null) => void;
  visibleColumns: string[];
  onVisibleColumnsChange: (cols: string[]) => void;
  allColumns: string[];
}

export function BuildsToolbar({
  searchTerm,
  onSearchChange,
  activeTab,
  onTabChange,
  view,
  onViewChange,
  sortColumn,
  sortDirection,
  onSortChange,
  onClearSort,
  groupBy,
  onGroupByChange,
  visibleColumns,
  onVisibleColumnsChange,
  allColumns,
}: BuildsToolbarProps) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      {/* Top row: Tabs + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="bg-card border border-border p-1 h-auto">
            <TabsTrigger value="all" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground px-4 py-2">
              All Jobs
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground px-4 py-2">
              Active
            </TabsTrigger>
            <TabsTrigger value="inactive" className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground px-4 py-2">
              Inactive
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 w-64 bg-card"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Sort
                {sortColumn && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {columnLabels[sortColumn]}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sort by column</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sortableColumns.map((col) => (
                <DropdownMenuItem
                  key={col}
                  onClick={() =>
                    onSortChange(col, sortColumn === col && sortDirection === "asc" ? "desc" : "asc")
                  }
                  className={cn(sortColumn === col && "bg-primary/5 text-primary")}
                >
                  {columnLabels[col]}
                  {sortColumn === col && (
                    <span className="ml-auto text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </DropdownMenuItem>
              ))}
              {sortColumn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onClearSort} className="text-destructive">
                    Clear Sort
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Group By */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Layers className="w-4 h-4" />
                Group
                {groupBy && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {columnLabels[groupBy]}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Group by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {groupByOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.label}
                  onClick={() => onGroupByChange(opt.value)}
                  className={cn(groupBy === opt.value && "bg-primary/5 text-primary")}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Columns */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Columns3 className="w-4 h-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Show/Hide Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={visibleColumns.includes(col)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onVisibleColumnsChange([...visibleColumns, col]);
                    } else {
                      onVisibleColumnsChange(visibleColumns.filter((c) => c !== col));
                    }
                  }}
                >
                  {columnLabels[col]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onVisibleColumnsChange(allColumns)}>
                Show All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ViewToggle view={view} onViewChange={onViewChange} />
        </div>
      </div>
    </div>
  );
}
