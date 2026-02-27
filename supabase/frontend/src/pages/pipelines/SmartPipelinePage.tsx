import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Globe,
  Server,
  Smartphone,
  Building2,
  Database,
  Cloud,
  CheckCircle,
  Loader2,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartPipelineProjectType, SmartPipelineConfig } from "@/types/pipeline";
import { SMART_PIPELINE_TYPES } from "@/constants/pipeline";
import { toast } from "sonner";

const iconMap: Record<string, React.ElementType> = {
  Globe,
  Server,
  Smartphone,
  Building2,
  Database,
  Cloud,
};

const frameworkOptions: Record<SmartPipelineProjectType, string[]> = {
  web_app: ["React", "Vue.js", "Angular", "Next.js", "Svelte"],
  api_microservice: ["Node.js", "Python", "Java Spring", "Go", ".NET Core"],
  mobile: ["React Native", "Flutter", "Swift", "Kotlin", "Ionic"],
  sap_extension: ["CAP", "UI5", "Fiori", "ABAP"],
  data_pipeline: ["Apache Spark", "Airflow", "dbt", "Databricks"],
  infrastructure: ["Terraform", "CloudFormation", "Pulumi", "Ansible"],
};

const deploymentOptions = [
  "Kubernetes",
  "Docker Swarm",
  "AWS ECS",
  "Azure Container Apps",
  "Cloud Foundry",
  "Serverless",
];

export default function SmartPipelinePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [config, setConfig] = useState<SmartPipelineConfig>({
    projectType: "web_app",
    projectName: "",
    repository: "",
    framework: "",
    deployment: "",
  });

  const selectedType = SMART_PIPELINE_TYPES.find((t) => t.id === config.projectType);

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    // Simulate AI generation
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    setIsGenerating(false);
    setGenerationComplete(true);
    toast.success("Pipeline generated successfully!");
  };

  const handleOpenCanvas = () => {
    navigate(`/pipelines/canvas?mode=create&name=${encodeURIComponent(config.projectName)}&smart=true`);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header
        title="Smart Pipeline"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pipelines")}
            className="gap-2 text-[#64748b] hover:text-[#0f172a]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Pipelines
          </Button>
        }
      />

      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#0f172a] mb-2">Smart Pipeline</h1>
          <p className="text-[#64748b] max-w-lg mx-auto">
            Let AI generate an optimized CI/CD pipeline based on your project type and requirements
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  step >= s
                    ? "bg-[#8b5cf6] text-white"
                    : "bg-[#f1f5f9] text-[#64748b]"
                )}
              >
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  step >= s ? "text-[#0f172a]" : "text-[#64748b]"
                )}
              >
                {s === 1 ? "Project Type" : s === 2 ? "Details" : "Generate"}
              </span>
              {s < 3 && <div className="w-12 h-0.5 bg-[#e2e8f0]" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-semibold text-[#0f172a] text-center mb-6">
                What type of project are you building?
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {SMART_PIPELINE_TYPES.map((type) => {
                  const Icon = iconMap[type.icon] || Globe;
                  const isSelected = config.projectType === type.id;

                  return (
                    <motion.button
                      key={type.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setConfig({ ...config, projectType: type.id as SmartPipelineProjectType })}
                      className={cn(
                        "p-6 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-[#8b5cf6] bg-[#8b5cf6]/5 shadow-md"
                          : "border-[#e2e8f0] bg-white hover:border-[#8b5cf6]/50 hover:shadow-sm"
                      )}
                    >
                      <div
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors",
                          isSelected
                            ? "bg-[#8b5cf6] text-white"
                            : "bg-[#f1f5f9] text-[#64748b]"
                        )}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="font-semibold text-[#0f172a] mb-1">{type.name}</h3>
                      <p className="text-sm text-[#64748b]">{type.description}</p>
                    </motion.button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => setStep(2)}
                  className="gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[#e2e8f0]">
                  {selectedType && (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center">
                        {(() => {
                          const Icon = iconMap[selectedType.icon] || Globe;
                          return <Icon className="w-6 h-6 text-[#8b5cf6]" />;
                        })()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-[#0f172a]">{selectedType.name}</h3>
                        <p className="text-sm text-[#64748b]">{selectedType.description}</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input
                      id="projectName"
                      placeholder="my-awesome-project"
                      value={config.projectName}
                      onChange={(e) => setConfig({ ...config, projectName: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="repository">Repository URL</Label>
                    <Input
                      id="repository"
                      placeholder="https://github.com/org/repo"
                      value={config.repository}
                      onChange={(e) => setConfig({ ...config, repository: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Framework</Label>
                    <Select
                      value={config.framework}
                      onValueChange={(v) => setConfig({ ...config, framework: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select framework" />
                      </SelectTrigger>
                      <SelectContent>
                        {frameworkOptions[config.projectType]?.map((fw) => (
                          <SelectItem key={fw} value={fw}>
                            {fw}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Deployment Target</Label>
                    <Select
                      value={config.deployment}
                      onValueChange={(v) => setConfig({ ...config, deployment: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select deployment" />
                      </SelectTrigger>
                      <SelectContent>
                        {deploymentOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!config.projectName}
                  className="gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 text-center">
                {!isGenerating && !generationComplete && (
                  <>
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] flex items-center justify-center mx-auto mb-6 shadow-lg">
                      <Wand2 className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-[#0f172a] mb-2">
                      Ready to Generate
                    </h3>
                    <p className="text-[#64748b] mb-6 max-w-md mx-auto">
                      We'll analyze your project requirements and generate an optimized
                      CI/CD pipeline with best practices built in.
                    </p>

                    {/* Summary */}
                    <div className="bg-[#f8fafc] rounded-lg p-4 mb-6 text-left max-w-md mx-auto">
                      <h4 className="text-sm font-medium text-[#0f172a] mb-3">Configuration Summary</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-[#64748b]">Project Type</span>
                          <span className="text-[#0f172a] font-medium">{selectedType?.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748b]">Project Name</span>
                          <span className="text-[#0f172a] font-medium">{config.projectName}</span>
                        </div>
                        {config.framework && (
                          <div className="flex justify-between">
                            <span className="text-[#64748b]">Framework</span>
                            <span className="text-[#0f172a] font-medium">{config.framework}</span>
                          </div>
                        )}
                        {config.deployment && (
                          <div className="flex justify-between">
                            <span className="text-[#64748b]">Deployment</span>
                            <span className="text-[#0f172a] font-medium">{config.deployment}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      size="lg"
                      onClick={handleGenerate}
                      className="gap-2 bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] hover:opacity-90 text-white px-8"
                    >
                      <Sparkles className="w-5 h-5" />
                      Generate Pipeline
                    </Button>
                  </>
                )}

                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] flex items-center justify-center mx-auto mb-6 shadow-lg animate-pulse">
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                    </div>
                    <h3 className="text-xl font-semibold text-[#0f172a] mb-2">
                      Generating Your Pipeline
                    </h3>
                    <p className="text-[#64748b] mb-4">
                      Analyzing requirements and applying best practices...
                    </p>
                    <div className="w-64 h-2 bg-[#f1f5f9] rounded-full mx-auto overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#d946ef]"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 3 }}
                      />
                    </div>
                  </motion.div>
                )}

                {generationComplete && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div className="w-20 h-20 rounded-2xl bg-[#10b981] flex items-center justify-center mx-auto mb-6 shadow-lg">
                      <CheckCircle className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-[#0f172a] mb-2">
                      Pipeline Generated!
                    </h3>
                    <p className="text-[#64748b] mb-6">
                      Your optimized CI/CD pipeline is ready. Open it in the canvas to customize further.
                    </p>
                    <Button
                      size="lg"
                      onClick={handleOpenCanvas}
                      className="gap-2 bg-[#10b981] hover:bg-[#059669] text-white px-8"
                    >
                      Open in Pipeline Canvas
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </motion.div>
                )}
              </div>

              {!isGenerating && !generationComplete && (
                <div className="flex justify-start pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    className="gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
