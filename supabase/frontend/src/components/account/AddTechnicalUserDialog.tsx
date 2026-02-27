import { useState, useMemo, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  User,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useGroups } from "@/hooks/useGroups";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { getPasswordRequirementStatus } from "@/lib/validations/account";

const technicalUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  status: z.enum(["active", "inactive"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  assignedGroup: z.string().min(1, "Group is required"),
  assignedRole: z.string().min(1, "Role is required"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

type TechnicalUserFormData = z.infer<typeof technicalUserSchema>;

const passwordRequirements = [
  { key: "length", label: "At least 12 characters" },
  { key: "uppercase", label: "One uppercase letter" },
  { key: "lowercase", label: "One lowercase letter" },
  { key: "number", label: "One number" },
  { key: "special", label: "One special character (!@#$%^&*)" },
] as const;

interface AddTechnicalUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  enterpriseId?: string | null;
  onSuccess?: () => void;
}

export function AddTechnicalUserDialog({
  open,
  onOpenChange,
  accountId,
  accountName,
  enterpriseId,
  onSuccess,
}: AddTechnicalUserDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  const { data: groups = [] } = useGroups(
    selectedAccount?.id || accountId,
    selectedEnterprise?.id || enterpriseId
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TechnicalUserFormData>({
    resolver: zodResolver(technicalUserSchema),
    defaultValues: {
      firstName: "",
      middleName: "",
      lastName: "",
      email: "",
      status: "active",
      startDate: "",
      endDate: "",
      assignedGroup: "",
      assignedRole: "",
      password: "",
    },
  });

  const password = watch("password") || "";
  const passwordStatus = useMemo(() => getPasswordRequirementStatus(password), [password]);

  const selectedGroupName = watch("assignedGroup");
  const selectedGroup = useMemo(
    () => groups.find((g) => g.name === selectedGroupName),
    [groups, selectedGroupName]
  );
  const availableRoles = useMemo(() => selectedGroup?.roles || [], [selectedGroup]);

  const selectedRoleName = watch("assignedRole");
  useEffect(() => {
    if (selectedRoleName && availableRoles.length > 0) {
      const roleExists = availableRoles.some((r) => r.roleName === selectedRoleName);
      if (!roleExists) setValue("assignedRole", "");
    } else if (!selectedGroupName) {
      setValue("assignedRole", "");
    }
  }, [selectedGroupName, availableRoles, selectedRoleName, setValue]);

  useEffect(() => {
    if (open) {
      reset();
      setShowPassword(false);
    }
  }, [open, reset]);

  const onSubmit = async (data: TechnicalUserFormData) => {
    setIsSaving(true);
    try {
      if (isExternalApi()) {
        const payload = {
          accountId,
          enterpriseId: enterpriseId || undefined,
          firstName: data.firstName,
          middleName: data.middleName || undefined,
          lastName: data.lastName,
          email: data.email,
          assignedRole: data.assignedRole,
          assignedGroup: data.assignedGroup,
          startDate: data.startDate,
          endDate: data.endDate || undefined,
          isTechnicalUser: true,
          accountName,
        };
        const { error } = await httpClient.post("/users", payload);
        if (error) throw new Error(error.message);
      } else {
        // Create the technical user in Supabase
        const { data: newUser, error: userError } = await supabase
          .from("account_technical_users")
          .insert({
            account_id: accountId,
            enterprise_id: enterpriseId || null,
            first_name: data.firstName,
            middle_name: data.middleName || null,
            last_name: data.lastName,
            email: data.email,
            status: data.status,
            start_date: data.startDate,
            end_date: data.endDate || null,
            assigned_group: data.assignedGroup,
            assigned_role: data.assignedRole,
            is_technical_user: true,
          })
          .select()
          .single();

        if (userError) throw userError;

        // Assign to group via user_groups junction table
        if (data.assignedGroup && newUser) {
          const { data: groupData } = await supabase
            .from("groups")
            .select("id")
            .eq("name", data.assignedGroup)
            .maybeSingle();

          if (groupData) {
            await supabase.from("user_groups").insert({
              user_id: newUser.id,
              group_id: groupData.id,
            });
          }
        }

        // Create auth user via edge function
        try {
          await supabase.functions.invoke("create-technical-user", {
            body: {
              email: data.email,
              password: data.password,
              firstName: data.firstName,
              lastName: data.lastName,
              middleName: data.middleName || null,
            },
          });
        } catch (authError) {
          console.warn("Auth user creation failed, user record still created:", authError);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(`Technical user "${data.firstName} ${data.lastName}" added to ${accountName}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add technical user");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            Add Technical User
          </DialogTitle>
          <DialogDescription>
            Add a new technical user to <span className="font-medium">{accountName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
          {/* Personal Info */}
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium text-foreground">Personal Information</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">First Name <span className="text-destructive">*</span></Label>
                <Input
                  {...register("firstName")}
                  placeholder="First name"
                  className={cn("h-10", errors.firstName && "border-destructive")}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Middle Name</Label>
                <Input {...register("middleName")} placeholder="Middle name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Last Name <span className="text-destructive">*</span></Label>
                <Input
                  {...register("lastName")}
                  placeholder="Last name"
                  className={cn("h-10", errors.lastName && "border-destructive")}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-sm">Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  {...register("email")}
                  placeholder="email@example.com"
                  className={cn("h-10", errors.email && "border-destructive")}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background">
                      <span className="text-sm">{field.value === "active" ? "Active" : "Inactive"}</span>
                      <Switch
                        checked={field.value === "active"}
                        onCheckedChange={(checked) => field.onChange(checked ? "active" : "inactive")}
                      />
                    </div>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Dates & Access */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card">
              <span className="text-sm font-medium text-foreground mb-3 block">Validity Period</span>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Start Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    {...register("startDate")}
                    className={cn("h-10", errors.startDate && "border-destructive")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">End Date</Label>
                  <Input type="date" {...register("endDate")} className="h-10" />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card">
              <span className="text-sm font-medium text-foreground mb-3 block">Access Control</span>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Group <span className="text-destructive">*</span></Label>
                  <Controller
                    name="assignedGroup"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className={cn("h-10", errors.assignedGroup && "border-destructive")}>
                          <SelectValue placeholder="Select group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={group.name}>{group.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Role <span className="text-destructive">*</span></Label>
                  <Controller
                    name="assignedRole"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!selectedGroupName || availableRoles.length === 0}
                      >
                        <SelectTrigger className={cn("h-10", errors.assignedRole && "border-destructive")}>
                          <SelectValue
                            placeholder={
                              !selectedGroupName
                                ? "Select a group first"
                                : availableRoles.length === 0
                                ? "No roles available"
                                : "Select role"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((role) => (
                            <SelectItem key={role.roleId} value={role.roleName}>{role.roleName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="p-4 rounded-xl border border-border bg-card">
            <span className="text-sm font-medium text-foreground mb-3 block">Security Credentials</span>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Password <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                    placeholder="Enter a strong password"
                    className={cn("h-10 pr-10", errors.password && "border-destructive")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Password Requirements</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {passwordRequirements.map((req) => {
                    const isValid = passwordStatus[req.key as keyof typeof passwordStatus];
                    return (
                      <div key={req.key} className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors",
                            isValid ? "bg-success" : "bg-muted"
                          )}
                        >
                          {isValid ? (
                            <Check className="w-2 h-2 text-success-foreground" />
                          ) : (
                            <X className="w-2 h-2 text-muted-foreground" />
                          )}
                        </div>
                        <span className={cn("text-xs", isValid ? "text-success" : "text-muted-foreground")}>
                          {req.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Technical User
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
