import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Cloud,
  Server,
  Database,
  Key,
  Settings,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Filter,
  Download,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProvisioningStatus, type ProvisioningEvent } from "@/hooks/useProvisioningStatus";
import { provisioningService } from "@/lib/api";
import { isExternalApi } from "@/lib/api/config";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

// Extend with simulated history for demo
interface HistoryJob extends ProvisioningEvent {
  duration?: string;
}

const SIMULATED_HISTORY: HistoryJob[] = [
  {
    id: "hist-1",
    accountId: "acc-demo-001",
    accountName: "Acme Corp Production",
    cloudType: "private",
    status: "completed",
    message: "Dedicated infrastructure ready",
    stackId: "arn:aws:cloudformation:us-east-1:123456789:stack/acc-demo-001-stack/abc123",
    stackName: "acc-demo-001-infrastructure",
    startedAt: new Date(Date.now() - 86400000 * 3),
    completedAt: new Date(Date.now() - 86400000 * 3 + 45000),
    progress: 100,
    duration: "45s",
    resources: [
      { logicalId: "Stack", type: "AWS::CloudFormation::Stack", status: "CREATE_COMPLETE" },
      { logicalId: "DynamoDBTable", type: "AWS::DynamoDB::Table", status: "CREATE_COMPLETE", physicalId: "acc-demo-001-table" },
      { logicalId: "IAMRole", type: "AWS::IAM::Role", status: "CREATE_COMPLETE" },
      { logicalId: "GSIEntity", type: "AWS::DynamoDB::GlobalSecondaryIndex", status: "CREATE_COMPLETE" },
      { logicalId: "SSMParameter", type: "AWS::SSM::Parameter", status: "CREATE_COMPLETE", physicalId: "/platform/accounts/acc-demo-001/table" },
    ],
  },
  {
    id: "hist-2",
    accountId: "acc-demo-002",
    accountName: "GlobalTech Shared",
    cloudType: "public",
    status: "completed",
    message: "Shared infrastructure ready",
    startedAt: new Date(Date.now() - 86400000 * 5),
    completedAt: new Date(Date.now() - 86400000 * 5 + 22000),
    progress: 100,
    duration: "22s",
    resources: [
      { logicalId: "Stack", type: "AWS::CloudFormation::Stack", status: "CREATE_COMPLETE" },
      { logicalId: "DynamoDBTable", type: "AWS::DynamoDB::Table", status: "CREATE_COMPLETE" },
      { logicalId: "IAMRole", type: "AWS::IAM::Role", status: "CREATE_COMPLETE" },
      { logicalId: "SSMParameter", type: "AWS::SSM::Parameter", status: "CREATE_COMPLETE" },
    ],
  },
  {
    id: "hist-3",
    accountId: "acc-demo-003",
    accountName: "FinServ Staging",
    cloudType: "private",
    status: "failed",
    message: "Stack creation failed",
    error: "CREATE_FAILED: Resource limit exceeded for DynamoDB tables in region us-east-1",
    startedAt: new Date(Date.now() - 86400000 * 7),
    completedAt: new Date(Date.now() - 86400000 * 7 + 38000),
    progress: 72,
    duration: "38s",
    resources: [
      { logicalId: "Stack", type: "AWS::CloudFormation::Stack", status: "CREATE_FAILED" },
      { logicalId: "DynamoDBTable", type: "AWS::DynamoDB::Table", status: "CREATE_COMPLETE" },
      { logicalId: "IAMRole", type: "AWS::IAM::Role", status: "CREATE_COMPLETE" },
      { logicalId: "GSIEntity", type: "AWS::DynamoDB::GlobalSecondaryIndex", status: "CREATE_FAILED" },
    ],
  },
  {
    id: "hist-4",
    accountId: "acc-demo-004",
    accountName: "RetailOps Analytics",
    cloudType: "public",
    status: "completed",
    message: "Shared infrastructure ready",
    startedAt: new Date(Date.now() - 86400000 * 10),
    completedAt: new Date(Date.now() - 86400000 * 10 + 19000),
    progress: 100,
    duration: "19s",
    resources: [
      { logicalId: "Stack", type: "AWS::CloudFormation::Stack", status: "CREATE_COMPLETE" },
      { logicalId: "DynamoDBTable", type: "AWS::DynamoDB::Table", status: "CREATE_COMPLETE" },
      { logicalId: "IAMRole", type: "AWS::IAM::Role", status: "CREATE_COMPLETE" },
      { logicalId: "SSMParameter", type: "AWS::SSM::Parameter", status: "CREATE_COMPLETE" },
    ],
  },
];

export default function ProvisioningHistoryPage() {
  const { events } = useProvisioningStatus();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cloudFilter, setCloudFilter] = useState<string>("all");

  // Merge live events with simulated history
  const allJobs: HistoryJob[] = [
    ...events.map((e) => ({
      ...e,
      duration: e.completedAt
        ? `${Math.round((e.completedAt.getTime() - e.startedAt.getTime()) / 1000)}s`
        : undefined,
    })),
    ...(!isExternalApi() ? SIMULATED_HISTORY : []),
  ].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  // Apply filters
  const filteredJobs = allJobs.filter((job) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !job.accountName.toLowerCase().includes(q) &&
        !job.accountId.toLowerCase().includes(q) &&
        !(job.stackName || "").toLowerCase().includes(q)
      )
        return false;
    }
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    if (cloudFilter !== "all" && job.cloudType !== cloudFilter) return false;
    return true;
  });

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const stats = {
    total: allJobs.length,
    active: allJobs.filter((j) => j.status === "pending" || j.status === "in_progress").length,
    completed: allJobs.filter((j) => j.status === "completed").length,
    failed: allJobs.filter((j) => j.status === "failed").length,
  };

  // ---- Export helpers ----
  const buildExportRows = (jobs: HistoryJob[]) =>
    jobs.map((job) => ({
      "Account Name": job.accountName,
      "Account ID": job.accountId,
      "Cloud Type": job.cloudType,
      Status: job.status,
      "Progress (%)": job.progress,
      "Started At": format(job.startedAt, "yyyy-MM-dd HH:mm:ss"),
      "Completed At": job.completedAt ? format(job.completedAt, "yyyy-MM-dd HH:mm:ss") : "",
      Duration: job.duration || "",
      "Stack Name": job.stackName || "",
      Message: job.message,
      Error: job.error || "",
      Resources: (job.resources || []).map((r) => `${r.logicalId} (${r.status})`).join("; "),
    }));

  const exportCsv = useCallback(() => {
    const rows = buildExportRows(filteredJobs);
    if (rows.length === 0) {
      toast({ title: "No data", description: "No provisioning jobs to export.", variant: "destructive" });
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = String((row as Record<string, unknown>)[h] ?? "");
          return `"${val.replace(/"/g, '""')}"`;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `provisioning-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV Exported", description: `${rows.length} records exported successfully.` });
  }, [filteredJobs]);

  const exportPdf = useCallback(async () => {
    const rows = buildExportRows(filteredJobs);
    if (rows.length === 0) {
      toast({ title: "No data", description: "No provisioning jobs to export.", variant: "destructive" });
      return;
    }
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // Title
    doc.setFontSize(16);
    doc.text("Provisioning History Report", 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")} | Records: ${rows.length}`, 14, 22);
    doc.text(
      `Filters — Status: ${statusFilter === "all" ? "All" : statusFilter} | Cloud: ${cloudFilter === "all" ? "All" : cloudFilter}${searchQuery ? ` | Search: "${searchQuery}"` : ""}`,
      14,
      27
    );

    const headers = ["Account Name", "Account ID", "Cloud Type", "Status", "Progress (%)", "Started At", "Completed At", "Duration", "Stack Name", "Error"];
    const body = rows.map((r) => headers.map((h) => String((r as Record<string, unknown>)[h] ?? "")));

    autoTable(doc, {
      head: [headers],
      body,
      startY: 32,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [1, 113, 236], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 28 },
        9: { cellWidth: 40 },
      },
    });

    // Resources detail page
    const jobsWithResources = filteredJobs.filter((j) => j.resources && j.resources.length > 0);
    if (jobsWithResources.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("Resource-Level Details", 14, 15);

      let yPos = 25;
      for (const job of jobsWithResources) {
        if (yPos > 180) {
          doc.addPage();
          yPos = 15;
        }
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`${job.accountName} (${job.cloudType}) — ${job.status}`, 14, yPos);
        yPos += 5;

        const resHeaders = ["Resource", "Type", "Status", "Physical ID"];
        const resBody = (job.resources || []).map((r) => [r.logicalId, r.type, r.status, r.physicalId || "—"]);

        autoTable(doc, {
          head: [resHeaders],
          body: resBody,
          startY: yPos,
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [100, 116, 139], textColor: 255 },
          margin: { left: 14 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
      }
    }

    doc.save(`provisioning-history-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast({ title: "PDF Exported", description: `${rows.length} records exported successfully.` });
  }, [filteredJobs, statusFilter, cloudFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <Header title="Provisioning History" subtitle="Track infrastructure provisioning jobs and resource-level timelines" />

      <main className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Jobs" value={stats.total} icon={Clock} color="text-foreground" bg="bg-muted" />
          <StatCard label="Active" value={stats.active} icon={Loader2} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-950/30" spin />
          <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-950/30" />
          <StatCard label="Failed" value={stats.failed} icon={XCircle} color="text-destructive" bg="bg-destructive/10" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by account name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cloudFilter} onValueChange={setCloudFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Cloud Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
              <Download className="w-4 h-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportPdf}>
              <FileText className="w-4 h-4" />
              PDF
            </Button>
          </div>
        </div>

        {/* Jobs Table */}
        <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[40px]" />
                <TableHead>Account</TableHead>
                <TableHead>Cloud Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Stack</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No provisioning jobs found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    expanded={expandedRows.has(job.id)}
                    onToggle={() => toggleRow(job.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

// ---- Sub-components ----

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  spin,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
  spin?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex items-center gap-4 p-4 rounded-lg border", bg)}
    >
      <div className={cn("flex items-center justify-center w-10 h-10 rounded-full bg-background/60", color)}>
        <Icon className={cn("w-5 h-5", spin && value > 0 && "animate-spin")} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </motion.div>
  );
}

function JobRow({
  job,
  expanded,
  onToggle,
}: {
  job: HistoryJob;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isActive = job.status === "pending" || job.status === "in_progress";
  const CloudIcon = job.cloudType === "private" ? Server : Cloud;

  return (
    <>
      <TableRow
        className={cn("cursor-pointer transition-colors", expanded && "bg-muted/30")}
        onClick={onToggle}
      >
        <TableCell>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{job.accountName}</span>
            <span className="text-xs text-muted-foreground font-mono">{job.accountId}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="gap-1.5">
            <CloudIcon className="w-3 h-3" />
            {job.cloudType}
          </Badge>
        </TableCell>
        <TableCell>
          <StatusBadge status={job.status} />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2 min-w-[120px]">
            <Progress value={job.progress} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground w-8 text-right">{job.progress}%</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col">
            <span className="text-sm">{format(job.startedAt, "MMM d, yyyy")}</span>
            <span className="text-xs text-muted-foreground">{format(job.startedAt, "HH:mm:ss")}</span>
          </div>
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">
            {job.duration || (isActive ? formatDistanceToNow(job.startedAt, { addSuffix: false }) : "—")}
          </span>
        </TableCell>
        <TableCell>
          {job.stackName ? (
            <span className="text-xs font-mono text-muted-foreground truncate max-w-[180px] block">
              {job.stackName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded resource timeline */}
      <AnimatePresence>
        {expanded && (
          <TableRow>
            <TableCell colSpan={8} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <ResourceTimeline job={job} />
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    pending: {
      label: "Pending",
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      icon: Clock,
    },
    in_progress: {
      label: "In Progress",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      icon: Loader2,
    },
    completed: {
      label: "Completed",
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      icon: CheckCircle2,
    },
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      icon: XCircle,
    },
  };

  const c = config[status] || config.pending;
  const Icon = c.icon;

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", c.className)}>
      <Icon className={cn("w-3 h-3", status === "in_progress" && "animate-spin")} />
      {c.label}
    </span>
  );
}

function ResourceTimeline({ job }: { job: HistoryJob }) {
  const resources = job.resources || [];

  const getResourceIcon = (type: string) => {
    if (type.includes("DynamoDB") || type.includes("GlobalSecondaryIndex")) return Database;
    if (type.includes("IAM")) return Key;
    if (type.includes("SSM")) return Settings;
    if (type.includes("CloudFormation")) return Cloud;
    return Cloud;
  };

  const getResourceStatus = (status: string) => {
    if (status.includes("COMPLETE") && !status.includes("FAILED"))
      return { color: "text-green-600 dark:text-green-400", bg: "bg-green-500", label: "Complete" };
    if (status.includes("IN_PROGRESS"))
      return { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500", label: "In Progress" };
    if (status.includes("FAILED"))
      return { color: "text-red-600 dark:text-red-400", bg: "bg-red-500", label: "Failed" };
    return { color: "text-muted-foreground", bg: "bg-muted-foreground", label: "Pending" };
  };

  return (
    <div className="px-6 py-4 bg-muted/20 border-t">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="text-sm font-semibold text-foreground">Resource Timeline</h4>
        <span className="text-xs text-muted-foreground">({resources.length} resources)</span>
      </div>

      {/* Message */}
      <p className="text-sm text-muted-foreground mb-4">{job.message}</p>

      {/* Error */}
      {job.error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="text-xs text-destructive/80 font-mono mt-1">{job.error}</p>
        </div>
      )}

      {/* Timeline */}
      {resources.length > 0 ? (
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-4">
            {resources.map((resource, idx) => {
              const Icon = getResourceIcon(resource.type);
              const st = getResourceStatus(resource.status);

              return (
                <motion.div
                  key={resource.logicalId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative flex items-start gap-4"
                >
                  {/* Dot */}
                  <div className={cn("absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-background", st.bg)} />

                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className={cn("flex items-center justify-center w-8 h-8 rounded-md bg-muted/60 shrink-0", st.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{resource.logicalId}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", st.color, `${st.bg}/20`)}>{st.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{resource.type}</p>
                      {resource.physicalId && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{resource.physicalId}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No resource details available.</p>
      )}

      {/* Stack ID */}
      {job.stackId && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Stack ARN:</span>{" "}
            <span className="font-mono">{job.stackId}</span>
          </p>
        </div>
      )}
    </div>
  );
}
