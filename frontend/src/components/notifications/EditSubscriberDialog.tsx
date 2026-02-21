import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail,
  Bell,
  AlertTriangle,
  Cloud,
  Server,
  Loader2,
  Pencil,
} from "lucide-react";
import { NotificationSubscriber } from "@/hooks/useNotificationSubscribers";

interface EditSubscriberDialogProps {
  subscriber: NotificationSubscriber | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    id: string,
    updates: Partial<
      Pick<
        NotificationSubscriber,
        "email" | "display_name" | "filter_type" | "cloud_type_filter"
      >
    >
  ) => Promise<boolean>;
}

export function EditSubscriberDialog({
  subscriber,
  open,
  onOpenChange,
  onSave,
}: EditSubscriberDialogProps) {
  const [form, setForm] = useState({
    email: "",
    display_name: "",
    filter_type: "all" as "all" | "failures_only" | "cloud_type",
    cloud_types: { public: true, private: true },
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (subscriber) {
      const cloudFilter = subscriber.cloud_type_filter || [];
      setForm({
        email: subscriber.email,
        display_name: subscriber.display_name || "",
        filter_type: subscriber.filter_type,
        cloud_types: {
          public: cloudFilter.includes("public"),
          private: cloudFilter.includes("private"),
        },
      });
    }
  }, [subscriber]);

  const handleSave = async () => {
    if (!subscriber || !form.email.trim()) return;

    setIsSaving(true);
    const cloudFilter: string[] = [];
    if (form.filter_type === "cloud_type") {
      if (form.cloud_types.public) cloudFilter.push("public");
      if (form.cloud_types.private) cloudFilter.push("private");
    }

    const success = await onSave(subscriber.id, {
      email: form.email.trim(),
      display_name: form.display_name.trim() || null,
      filter_type: form.filter_type,
      cloud_type_filter: cloudFilter,
    });

    setIsSaving(false);
    if (success) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 px-6 py-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-3 text-white text-lg">
              <motion.div
                initial={{ rotate: -15, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Pencil className="w-5 h-5" />
              </motion.div>
              Edit Subscriber
            </DialogTitle>
            <DialogDescription className="text-blue-100">
              Update email, display name, or notification filter preferences.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email Address *</Label>
            <Input
              id="edit-email"
              type="email"
              placeholder="ops-team@example.com"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              The email address that receives SNS notifications.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Display Name</Label>
            <Input
              id="edit-name"
              placeholder="Ops Team (optional)"
              value={form.display_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              A friendly label for this subscriber.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Filter Type</Label>
            <Select
              value={form.filter_type}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  filter_type: v as "all" | "failures_only" | "cloud_type",
                }))
              }
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
              {form.filter_type === "all" &&
                "Receive all provisioning and deprovisioning notifications"}
              {form.filter_type === "failures_only" &&
                "Only receive notifications when provisioning fails"}
              {form.filter_type === "cloud_type" &&
                "Only receive notifications for selected cloud types"}
            </p>
          </div>

          {form.filter_type === "cloud_type" && (
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
                    id="edit-ct-public"
                    checked={form.cloud_types.public}
                    onCheckedChange={(c) =>
                      setForm((f) => ({
                        ...f,
                        cloud_types: { ...f.cloud_types, public: !!c },
                      }))
                    }
                  />
                  <Label
                    htmlFor="edit-ct-public"
                    className="flex items-center gap-1.5 text-sm font-normal cursor-pointer"
                  >
                    <Cloud className="w-4 h-4 text-blue-500" /> Public
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-ct-private"
                    checked={form.cloud_types.private}
                    onCheckedChange={(c) =>
                      setForm((f) => ({
                        ...f,
                        cloud_types: { ...f.cloud_types, private: !!c },
                      }))
                    }
                  />
                  <Label
                    htmlFor="edit-ct-private"
                    className="flex items-center gap-1.5 text-sm font-normal cursor-pointer"
                  >
                    <Server className="w-4 h-4 text-slate-500" /> Private
                  </Label>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <DialogFooter className="px-6 pb-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.email.trim() || isSaving}
            className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-700 hover:to-indigo-600 text-white"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
