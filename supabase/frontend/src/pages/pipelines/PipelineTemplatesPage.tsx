import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  Layers,
  Building2,
  Smartphone,
  Tablet,
  Code2,
  Server,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_TEMPLATES } from "@/constants/pipeline";
import { DeploymentType } from "@/types/pipeline";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { toast } from "sonner";

const iconMap: Record<string, React.ElementType> = {
  Layers,
  Building2,
  Smartphone,
  Tablet,
  Code2,
  Server,
};

interface CreateTemplateForm {
  name: string;
  description: string;
  enterpriseId: string;
  entity: string;
  deploymentType: DeploymentType;
}

export default function PipelineTemplatesPage() {
  const navigate = useNavigate();
  const { enterprises } = useEnterpriseContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CreateTemplateForm>({
    name: "",
    description: "",
    enterpriseId: "",
    entity: "",
    deploymentType: "Integration",
  });

  const categories = ["all", ...new Set(PIPELINE_TEMPLATES.map((t) => t.category))];

  const filteredTemplates = PIPELINE_TEMPLATES.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleUseTemplate = (templateId: string) => {
    navigate(`/pipelines/canvas?template=${templateId}&mode=create`);
  };

  const handleCreateTemplate = () => {
    if (!formData.name) {
      toast.error("Please enter a template name");
      return;
    }

    toast.success("Template created successfully");
    setCreateDialogOpen(false);
    navigate(`/pipelines/canvas?mode=create&name=${encodeURIComponent(formData.name)}`);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header
        title="Pipeline Templates"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/pipelines")}
              className="gap-2 text-[#64748b] hover:text-[#0f172a]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </Button>
          </div>
        }
      />

      <div className="p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#f97316] flex items-center justify-center shadow-lg">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#0f172a]">Pipeline Templates</h1>
              <p className="text-[#64748b]">
                Start quickly with pre-configured templates for common scenarios
              </p>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap items-center gap-4 mb-8"
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <Input
              type="search"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white border-[#e2e8f0]"
            />
          </div>

          <div className="flex items-center gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  selectedCategory === category
                    ? "bg-[#f59e0b] hover:bg-[#d97706] text-white"
                    : "bg-white border-[#e2e8f0] hover:bg-[#f1f5f9]"
                )}
              >
                {category === "all" ? "All" : category}
              </Button>
            ))}
          </div>
        </motion.div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTemplates.map((template, index) => {
              const Icon = iconMap[template.icon] || Layers;

              return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden hover:shadow-lg transition-all duration-300 group"
                >
                  {/* Template Header */}
                  <div className="h-2 w-full bg-gradient-to-r from-[#f59e0b] to-[#f97316]" />
                  
                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#f97316] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-[#0f172a] group-hover:text-[#f59e0b] transition-colors">
                          {template.name}
                        </h3>
                        <span className="inline-block px-2 py-0.5 bg-[#f1f5f9] text-[#64748b] text-xs rounded mt-1">
                          {template.category}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-[#64748b] mb-4 line-clamp-2">
                      {template.description}
                    </p>

                    {/* Steps Preview */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-[#0f172a] mb-2">Pipeline Steps:</p>
                      <div className="flex items-center gap-1 overflow-x-auto pb-2">
                        {template.steps.slice(0, 5).map((step, stepIndex) => (
                          <div key={step.id} className="flex items-center">
                            <div className="px-2 py-1 bg-[#f1f5f9] rounded text-xs text-[#475569] whitespace-nowrap">
                              {step.label}
                            </div>
                            {stepIndex < Math.min(template.steps.length - 1, 4) && (
                              <ArrowRight className="w-3 h-3 text-[#94a3b8] mx-1 flex-shrink-0" />
                            )}
                          </div>
                        ))}
                        {template.steps.length > 5 && (
                          <span className="text-xs text-[#64748b] ml-1">
                            +{template.steps.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-4 border-t border-[#e2e8f0]">
                      <Button
                        className="flex-1 gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white"
                        onClick={() => handleUseTemplate(template.id)}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Use Template
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-[#e2e8f0] hover:bg-[#f1f5f9]"
                        onClick={() => navigate(`/pipelines/canvas?template=${template.id}&mode=preview`)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Create New Template Card */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: filteredTemplates.length * 0.05 }}
            onClick={() => setCreateDialogOpen(true)}
            className="bg-white rounded-xl border-2 border-dashed border-[#e2e8f0] p-6 hover:border-[#f59e0b] hover:bg-[#f59e0b]/5 transition-all duration-300 flex flex-col items-center justify-center min-h-[280px] group"
          >
            <div className="w-16 h-16 rounded-full bg-[#f1f5f9] flex items-center justify-center mb-4 group-hover:bg-[#f59e0b]/10 transition-colors">
              <Plus className="w-8 h-8 text-[#64748b] group-hover:text-[#f59e0b] transition-colors" />
            </div>
            <h3 className="font-semibold text-[#0f172a] mb-1">Create New Template</h3>
            <p className="text-sm text-[#64748b] text-center">
              Build a custom template from scratch
            </p>
          </motion.button>
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-12">
            <Layers className="w-12 h-12 text-[#cbd5e1] mx-auto mb-4" />
            <p className="text-[#64748b]">No templates found matching your search</p>
          </div>
        )}
      </div>

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#f59e0b]" />
              Create New Template
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                placeholder="My Custom Pipeline"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this template is for..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Enterprise</Label>
                <Select
                  value={formData.enterpriseId}
                  onValueChange={(v) => setFormData({ ...formData, enterpriseId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select enterprise" />
                  </SelectTrigger>
                  <SelectContent>
                    {enterprises.map((ent) => (
                      <SelectItem key={ent.id} value={ent.id}>
                        {ent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deployment Type</Label>
                <Select
                  value={formData.deploymentType}
                  onValueChange={(v) => setFormData({ ...formData, deploymentType: v as DeploymentType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Integration">Integration</SelectItem>
                    <SelectItem value="Extension">Extension</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-white"
            >
              Create & Open Canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
