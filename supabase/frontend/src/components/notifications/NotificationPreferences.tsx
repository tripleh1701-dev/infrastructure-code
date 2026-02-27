import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EditSubscriberDialog } from "./EditSubscriberDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Plus,
  Trash2,
  Bell,
  BellOff,
  Cloud,
  Server,
  AlertTriangle,
  Loader2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationSubscribers, CreateSubscriberInput, NotificationSubscriber } from "@/hooks/useNotificationSubscribers";
import { useAccountContext } from "@/contexts/AccountContext";
import { Skeleton } from "@/components/ui/skeleton";

const FILTER_LABELS: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  all: { label: "All Events", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Bell },
  failures_only: { label: "Failures Only", color: "bg-red-100 text-red-700 border-red-200", icon: AlertTriangle },
  cloud_type: { label: "Cloud Filter", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Cloud },
};

export function NotificationPreferences() {
  const { selectedAccount } = useAccountContext();
  const {
    subscribers,
    isLoading,
    addSubscriber,
    deleteSubscriber,
    toggleActive,
    updateSubscriber,
  } = useNotificationSubscribers(selectedAccount?.id);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<NotificationSubscriber | null>(null);
  const [addForm, setAddForm] = useState<{
    email: string;
    display_name: string;
    filter_type: 'all' | 'failures_only' | 'cloud_type';
    cloud_types: { public: boolean; private: boolean };
  }>({
    email: "",
    display_name: "",
    filter_type: "all",
    cloud_types: { public: true, private: true },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!selectedAccount?.id || !addForm.email.trim()) return;

    setIsSubmitting(true);
    const cloudFilter: string[] = [];
    if (addForm.filter_type === "cloud_type") {
      if (addForm.cloud_types.public) cloudFilter.push("public");
      if (addForm.cloud_types.private) cloudFilter.push("private");
    }

    const input: CreateSubscriberInput = {
      account_id: selectedAccount.id,
      email: addForm.email.trim(),
      display_name: addForm.display_name.trim() || undefined,
      filter_type: addForm.filter_type,
      cloud_type_filter: cloudFilter,
    };

    const success = await addSubscriber(input);
    setIsSubmitting(false);

    if (success) {
      setShowAddDialog(false);
      setAddForm({ email: "", display_name: "", filter_type: "all", cloud_types: { public: true, private: true } });
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await deleteSubscriber(id);
    setDeletingId(null);
  };

  const handleFilterChange = async (sub: NotificationSubscriber, newFilter: string) => {
    const filter = newFilter as 'all' | 'failures_only' | 'cloud_type';
    const updates: any = { filter_type: filter };
    if (filter === 'cloud_type' && (!sub.cloud_type_filter || sub.cloud_type_filter.length === 0)) {
      updates.cloud_type_filter = ['public', 'private'];
    }
    await updateSubscriber(sub.id, updates);
  };

  if (!selectedAccount) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-8 text-center">
        <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Select an account to manage notification preferences</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-violet-50/50 to-transparent">
        <div className="flex items-center gap-4">
          <motion.div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-200/50"
            whileHover={{ rotate: 15, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Mail className="w-6 h-6 text-white" />
          </motion.div>
          <div>
            <h3 className="font-semibold text-foreground text-lg">Provisioning Notifications</h3>
            <p className="text-sm text-muted-foreground">
              Manage email subscribers for provisioning events (SNS)
            </p>
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            size="sm"
            className="gap-2 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white shadow-lg shadow-violet-200/50"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Add Subscriber
          </Button>
        </motion.div>
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : subscribers.length === 0 ? (
          <div className="text-center py-12">
            <BellOff className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No subscribers configured</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Add email subscribers to receive provisioning event notifications
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold text-foreground">Subscriber</TableHead>
                  <TableHead className="font-semibold text-foreground">Filter</TableHead>
                  <TableHead className="font-semibold text-foreground">Cloud Types</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Active</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {subscribers.map((sub) => {
                    const filterInfo = FILTER_LABELS[sub.filter_type] || FILTER_LABELS.all;
                    return (
                      <motion.tr
                        key={sub.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="group hover:bg-slate-50/50 transition-colors"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold",
                              sub.is_active
                                ? "bg-gradient-to-br from-violet-500 to-violet-600"
                                : "bg-slate-300"
                            )}>
                              {(sub.display_name || sub.email)[0].toUpperCase()}
                            </div>
                            <div>
                              {sub.display_name && (
                                <p className="font-medium text-foreground text-sm">{sub.display_name}</p>
                              )}
                              <p className={cn("text-sm", sub.display_name ? "text-muted-foreground" : "font-medium text-foreground")}>
                                {sub.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={sub.filter_type}
                            onValueChange={(v) => handleFilterChange(sub, v)}
                          >
                            <SelectTrigger className="w-[150px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Events</SelectItem>
                              <SelectItem value="failures_only">Failures Only</SelectItem>
                              <SelectItem value="cloud_type">Cloud Type</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {sub.filter_type === "cloud_type" ? (
                            <div className="flex gap-1.5">
                              {(sub.cloud_type_filter || []).map((ct) => (
                                <Badge
                                  key={ct}
                                  variant="outline"
                                  className={cn(
                                    "text-xs",
                                    ct === "public"
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-slate-100 text-slate-700 border-slate-200"
                                  )}
                                >
                                  {ct === "public" ? <Cloud className="w-3 h-3 mr-1" /> : <Server className="w-3 h-3 mr-1" />}
                                  {ct}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={sub.is_active}
                            onCheckedChange={() => toggleActive(sub.id, sub.is_active)}
                            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-violet-500 data-[state=checked]:to-violet-600"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => setEditingSub(sub)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(sub.id)}
                              disabled={deletingId === sub.id}
                            >
                              {deletingId === sub.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add Subscriber Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-violet-500" />
              Add Notification Subscriber
            </DialogTitle>
            <DialogDescription>
              Add an email address to receive provisioning event notifications via SNS.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sub-email">Email Address *</Label>
              <Input
                id="sub-email"
                type="email"
                placeholder="ops-team@example.com"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sub-name">Display Name</Label>
              <Input
                id="sub-name"
                placeholder="Ops Team (optional)"
                value={addForm.display_name}
                onChange={(e) => setAddForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Filter Type</Label>
              <Select
                value={addForm.filter_type}
                onValueChange={(v) => setAddForm((f) => ({ ...f, filter_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-emerald-500" />
                      All Events
                    </div>
                  </SelectItem>
                  <SelectItem value="failures_only">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Failures Only
                    </div>
                  </SelectItem>
                  <SelectItem value="cloud_type">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-blue-500" />
                      By Cloud Type
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {addForm.filter_type === "all" && "Receive all provisioning and deprovisioning notifications"}
                {addForm.filter_type === "failures_only" && "Only receive notifications when provisioning fails"}
                {addForm.filter_type === "cloud_type" && "Only receive notifications for selected cloud types"}
              </p>
            </div>

            {addForm.filter_type === "cloud_type" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 pl-1"
              >
                <Label>Cloud Types</Label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ct-public"
                      checked={addForm.cloud_types.public}
                      onCheckedChange={(c) =>
                        setAddForm((f) => ({ ...f, cloud_types: { ...f.cloud_types, public: !!c } }))
                      }
                    />
                    <Label htmlFor="ct-public" className="flex items-center gap-1.5 text-sm font-normal cursor-pointer">
                      <Cloud className="w-4 h-4 text-blue-500" /> Public
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ct-private"
                      checked={addForm.cloud_types.private}
                      onCheckedChange={(c) =>
                        setAddForm((f) => ({ ...f, cloud_types: { ...f.cloud_types, private: !!c } }))
                      }
                    />
                    <Label htmlFor="ct-private" className="flex items-center gap-1.5 text-sm font-normal cursor-pointer">
                      <Server className="w-4 h-4 text-slate-500" /> Private
                    </Label>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!addForm.email.trim() || isSubmitting}
              className="gap-2 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Subscriber
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subscriber Dialog */}
      <EditSubscriberDialog
        subscriber={editingSub}
        open={!!editingSub}
        onOpenChange={(open) => { if (!open) setEditingSub(null); }}
        onSave={async (id, updates) => updateSubscriber(id, updates)}
      />
    </motion.div>
  );
}
