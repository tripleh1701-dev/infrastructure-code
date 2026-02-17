 import { useState, useMemo } from "react";
 import { Check, Users, ChevronDown, X, Shield } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import {
   Popover,
   PopoverContent,
   PopoverTrigger,
 } from "@/components/ui/popover";
 import { Input } from "@/components/ui/input";
 import { cn } from "@/lib/utils";
 import { Group, GroupRole } from "@/hooks/useGroups";
 import { GroupRolesPermissionsDisplay } from "./GroupRolesPermissionsDisplay";
 
 interface GroupMultiSelectProps {
   groups: Group[];
   selectedGroupIds: string[];
   onSelectionChange: (groupIds: string[]) => void;
   placeholder?: string;
   className?: string;
 }
 
 export function GroupMultiSelect({
   groups,
   selectedGroupIds,
   onSelectionChange,
   placeholder = "Select groups...",
   className,
 }: GroupMultiSelectProps) {
   const [open, setOpen] = useState(false);
   const [searchQuery, setSearchQuery] = useState("");
 
   const filteredGroups = useMemo(() => {
     if (!searchQuery.trim()) return groups;
     const query = searchQuery.toLowerCase();
     return groups.filter(
       (g) =>
         g.name.toLowerCase().includes(query) ||
         g.description?.toLowerCase().includes(query)
     );
   }, [groups, searchQuery]);
 
   const selectedGroups = useMemo(
     () => groups.filter((g) => selectedGroupIds.includes(g.id)),
     [groups, selectedGroupIds]
   );
 
   // Aggregate all roles from selected groups (deduplicated by roleId)
   const aggregatedRoles = useMemo(() => {
     const roleMap = new Map<string, GroupRole>();
     selectedGroups.forEach((group) => {
       group.roles.forEach((role) => {
         if (!roleMap.has(role.roleId)) {
           roleMap.set(role.roleId, role);
         }
       });
     });
     return Array.from(roleMap.values());
   }, [selectedGroups]);
 
   const toggleGroup = (groupId: string) => {
     if (selectedGroupIds.includes(groupId)) {
       onSelectionChange(selectedGroupIds.filter((id) => id !== groupId));
     } else {
       onSelectionChange([...selectedGroupIds, groupId]);
     }
   };
 
   const removeGroup = (groupId: string, e: React.MouseEvent) => {
     e.stopPropagation();
     onSelectionChange(selectedGroupIds.filter((id) => id !== groupId));
   };
 
   return (
     <div className={cn("space-y-3", className)}>
       <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
           <Button
             variant="outline"
             role="combobox"
             aria-expanded={open}
             className="w-full justify-between h-auto min-h-[44px] py-2"
           >
             <div className="flex flex-wrap gap-1.5 flex-1 text-left">
               {selectedGroups.length === 0 ? (
                 <span className="text-muted-foreground">{placeholder}</span>
               ) : (
                 selectedGroups.map((group) => (
                   <Badge
                     key={group.id}
                     variant="secondary"
                     className="flex items-center gap-1 pr-1"
                   >
                     <Users className="w-3 h-3" />
                     {group.name}
                     <button
                       type="button"
                       onClick={(e) => removeGroup(group.id, e)}
                       className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                     >
                       <X className="w-3 h-3" />
                     </button>
                   </Badge>
                 ))
               )}
             </div>
             <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
           </Button>
         </PopoverTrigger>
         <PopoverContent className="w-[400px] p-0" align="start" sideOffset={4}>
           <div className="p-2 border-b">
             <Input
               placeholder="Search groups..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="h-9"
             />
           </div>
           <div className="max-h-[240px] overflow-y-auto p-1">
             {filteredGroups.length === 0 ? (
               <div className="py-6 text-center text-sm text-muted-foreground">
                 No groups found.
               </div>
             ) : (
               filteredGroups.map((group) => {
                 const isSelected = selectedGroupIds.includes(group.id);
                 return (
                   <div
                     key={group.id}
                     onClick={() => toggleGroup(group.id)}
                     className={cn(
                       "flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors",
                       isSelected
                         ? "bg-primary/10 border border-primary/30"
                         : "hover:bg-muted"
                     )}
                   >
                     <div
                       className={cn(
                         "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                         isSelected
                           ? "bg-primary border-primary text-primary-foreground"
                           : "border-muted-foreground/30"
                       )}
                     >
                       {isSelected && <Check className="w-3.5 h-3.5" />}
                     </div>
                     <div className="flex-1 min-w-0">
                       <p className="font-medium text-sm truncate">{group.name}</p>
                       {group.description && (
                         <p className="text-xs text-muted-foreground truncate">
                           {group.description}
                         </p>
                       )}
                       {group.roles.length > 0 && (
                         <div className="flex items-center gap-1 mt-1">
                           <Shield className="w-3 h-3 text-primary" />
                           <span className="text-xs text-muted-foreground">
                             {group.roles.length} role{group.roles.length !== 1 ? "s" : ""}
                           </span>
                         </div>
                       )}
                     </div>
                   </div>
                 );
               })
             )}
           </div>
         </PopoverContent>
       </Popover>
 
       {/* Display aggregated roles from all selected groups */}
       {aggregatedRoles.length > 0 && (
         <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-violet-500/5 border border-primary/10">
           <GroupRolesPermissionsDisplay roles={aggregatedRoles} />
         </div>
       )}
 
       {selectedGroups.length > 0 && aggregatedRoles.length === 0 && (
         <div className="p-4 rounded-xl border border-dashed border-muted-foreground/30 text-center">
           <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
           <p className="text-sm text-muted-foreground">
             Selected groups have no roles assigned
           </p>
         </div>
       )}
 
       {selectedGroups.length === 0 && (
         <div className="p-4 rounded-xl border border-dashed border-muted-foreground/30 text-center">
           <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
           <p className="text-sm text-muted-foreground">
             Select groups above to view their roles and permissions
           </p>
         </div>
       )}
     </div>
   );
 }