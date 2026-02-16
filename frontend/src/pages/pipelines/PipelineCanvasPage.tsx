import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Grid3X3,
  ChevronRight,
  Maximize2,
  Minimize2,
  Workflow,
  PenTool,
} from "lucide-react";
import { WorkflowNodeType, DeploymentType, PipelineMode } from "@/types/pipeline";
import { NODE_LABELS, CATEGORY_COLORS, TEMPLATE_FLOWS } from "@/constants/pipeline";
import { isEnvNode, generateEnvFlowEdges, autoLayoutWithGroups, ENV_GROUP_WIDTH, ENV_GROUP_HEIGHT, ENV_GROUP_SPACING, getOrderedEnvNodes } from "@/components/pipeline/EnvironmentGroupOverlay";
import { EnvironmentGroupNode } from "@/components/pipeline/EnvironmentGroupNode";
import { PipelineNode } from "@/components/pipeline/PipelineNode";
import { PipelineSidebar } from "@/components/pipeline/PipelineSidebar";
import { CanvasCompactSidebar } from "@/components/pipeline/CanvasCompactSidebar";
import { CanvasToolbar, LineStyle } from "@/components/pipeline/CanvasToolbar";
import { CanvasQuickActions } from "@/components/pipeline/CanvasQuickActions";
import { NodeConfigPanel } from "@/components/pipeline/NodeConfigPanel";
import { PipelineHeaderBar } from "@/components/pipeline/PipelineHeaderBar";
import { ConnectionSuggestion } from "@/components/pipeline/ConnectionSuggestion";
import { PipelineFlowView } from "@/components/pipeline/PipelineFlowView";

import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineBuildLinks } from "@/hooks/usePipelineBuildLinks";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { useConnectionSuggestion } from "@/hooks/useConnectionSuggestion";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useLicenses } from "@/hooks/useLicenses";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { PermissionGate, usePermissionCheck } from "@/components/auth/PermissionGate";

// Custom node types
const nodeTypes = {
  pipeline: PipelineNode,
  environmentGroup: EnvironmentGroupNode,
};

// Initial nodes and edges
const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function PipelineCanvasContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();
  const loadedPipelineIdRef = useRef<string | null>(null);

  // Pipeline persistence hook
  const { 
    fetchPipeline, 
    createPipeline, 
    updatePipeline, 
    isCreating, 
    isUpdating,
    selectedAccountId,
    selectedEnterpriseId 
  } = usePipelines();

  // Pipeline-build link check
  const { isPipelineLinked, getLinkedBuildJobs } = usePipelineBuildLinks();

  // Workstreams hook
  const { workstreams } = useWorkstreams(selectedAccountId || undefined, selectedEnterpriseId || undefined);

  // Licenses hook for products/services
  const { licenses } = useLicenses(selectedAccountId || undefined);

  // Filter products and services from active licenses for this enterprise
  const availableProducts = useMemo(() => {
    if (!selectedEnterpriseId) return [];
    const now = new Date();
    const activeForEnterprise = licenses.filter(
      (l) => l.enterprise_id === selectedEnterpriseId && new Date(l.end_date) >= now
    );
    const uniqueProducts = new Map<string, { id: string; name: string }>();
    activeForEnterprise.forEach((l) => {
      if (l.product && !uniqueProducts.has(l.product.id)) {
        uniqueProducts.set(l.product.id, l.product);
      }
    });
    return Array.from(uniqueProducts.values());
  }, [licenses, selectedEnterpriseId]);

  const availableServices = useMemo(() => {
    if (!selectedEnterpriseId) return [];
    const now = new Date();
    const activeForEnterprise = licenses.filter(
      (l) => l.enterprise_id === selectedEnterpriseId && new Date(l.end_date) >= now
    );
    const uniqueServices = new Map<string, { id: string; name: string }>();
    activeForEnterprise.forEach((l) => {
      if (l.service && !uniqueServices.has(l.service.id)) {
        uniqueServices.set(l.service.id, l.service);
      }
    });
    return Array.from(uniqueServices.values());
  }, [licenses, selectedEnterpriseId]);

  // History hook for undo/redo
  const { pushState, undo, redo, canUndo, canRedo } = useCanvasHistory();

  // URL params
  const pipelineId = searchParams.get("id");
  const templateId = searchParams.get("template");
  const mode = (searchParams.get("mode") as PipelineMode) || (pipelineId ? "edit" : "create");
  const initialName = searchParams.get("name") || `New Pipeline ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  // State
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Start collapsed for more canvas space
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [deploymentType, setDeploymentType] = useState<DeploymentType>("Integration");
  const [backgroundType, setBackgroundType] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pipelineName, setPipelineName] = useState(initialName);
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(pipelineId);
  const [isLoadingPipeline, setIsLoadingPipeline] = useState(false);
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState<string | undefined>();
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [lineStyle, setLineStyle] = useState<LineStyle>({
    type: "smoothstep",
    pattern: "solid",
    thickness: 2,
    arrow: "end",
    animated: true,
    color: "#64748b",
  });
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [viewMode, setViewMode] = useState<"canvas" | "flow">("canvas");
  const [pipelineStatus, setPipelineStatus] = useState<"draft" | "active" | "inactive" | "archived">("draft");

  // Auto-select first workstream if none selected
  useEffect(() => {
    if (workstreams.length > 0 && !selectedWorkstreamId) {
      setSelectedWorkstreamId(workstreams[0].id);
    }
  }, [workstreams, selectedWorkstreamId]);

  // Auto-select first product if none selected
  useEffect(() => {
    if (availableProducts.length > 0 && !selectedProductId) {
      setSelectedProductId(availableProducts[0].id);
    }
  }, [availableProducts, selectedProductId]);

  // Auto-select first service if none selected
  useEffect(() => {
    if (availableServices.length > 0 && selectedServiceIds.length === 0) {
      setSelectedServiceIds([availableServices[0].id]);
    }
  }, [availableServices, selectedServiceIds]);

  // Connection suggestion hook
  const { suggestion, suggestConnection, clearSuggestion } = useConnectionSuggestion(
    nodes,
    edges,
    { maxDistance: 400, enabled: true }
  );
  const AUTOSAVE_DELAY = 3000; // 3 seconds debounce

  // Track selected nodes/edges
  const selectedNodes = useMemo(() => nodes.filter(n => n.selected), [nodes]);
  const selectedEdges = useMemo(() => edges.filter(e => e.selected), [edges]);
  const hasSelection = selectedNodes.length > 0 || selectedEdges.length > 0;

  // Delete single node - defined early for use in nodesWithHandlers
  const handleDeleteNode = useCallback((nodeId: string) => {
    if (isPipelineLinked(pipelineName)) {
      const jobs = getLinkedBuildJobs(pipelineName);
      toast.warning(`Cannot delete — this pipeline is linked to build job(s): ${jobs.join(", ")}. Unlink it first.`);
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setHasUnsavedChanges(true);
    toast.success("Node deleted");
  }, [setNodes, setEdges, isPipelineLinked, getLinkedBuildJobs, pipelineName]);

  // Duplicate single node - defined early for use in nodesWithHandlers
  const handleDuplicateNode = useCallback((nodeId: string) => {
    if (isPipelineLinked(pipelineName)) {
      toast.warning(`Cannot modify — this pipeline is linked to build jobs. Unlink it first.`);
      return;
    }
    setNodes((nds) => {
      const node = nds.find((n) => n.id === nodeId);
      if (!node) return nds;
      const newNode: Node = {
        ...node,
        id: `${node.data.nodeType}-${Date.now()}`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
      };
      return [...nds, newNode];
    });
    setHasUnsavedChanges(true);
    toast.success("Node duplicated");
  }, [setNodes, isPipelineLinked, pipelineName]);

  // Add node action handlers to nodes
  const nodesWithHandlers = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onDelete: handleDeleteNode,
        onDuplicate: handleDuplicateNode,
        onConfigure: (id: string) => {
          const targetNode = nodes.find(n => n.id === id);
          if (targetNode) {
            setSelectedNode(targetNode);
            setConfigPanelOpen(true);
          }
        },
      },
    }));
  }, [nodes, handleDeleteNode, handleDuplicateNode]);

  // Load existing pipeline if editing
  useEffect(() => {
    const loadPipeline = async () => {
      if (!pipelineId) return;

      // Prevent re-loading the same pipeline on every render
      if (loadedPipelineIdRef.current === pipelineId) return;
      loadedPipelineIdRef.current = pipelineId;

      setIsLoadingPipeline(true);
      try {
        const pipeline = await fetchPipeline(pipelineId);
        if (pipeline) {
          setPipelineName(pipeline.name);
          setDeploymentType(pipeline.deployment_type as DeploymentType);
          setCurrentPipelineId(pipeline.id);
          setPipelineStatus((pipeline.status as "draft" | "active" | "inactive" | "archived") || "draft");
          
          // Restore context selections
          if (pipeline.product_id) {
            setSelectedProductId(pipeline.product_id);
          }
          if (pipeline.service_ids && pipeline.service_ids.length > 0) {
            setSelectedServiceIds(pipeline.service_ids);
          }

          const storedNodes = pipeline.nodes as unknown as Array<{
            id: string;
            type: string;
            position: { x: number; y: number };
            data: Record<string, unknown>;
          }>;
          const storedEdges = pipeline.edges as unknown as Edge[];

          if (Array.isArray(storedNodes)) {
            setNodes(
              storedNodes.map((n: any) => ({
                id: n.id,
                type: n.type || "pipeline",
                position: n.position,
                data: n.data,
                ...(n.parentId ? { parentId: n.parentId, extent: "parent" as const } : {}),
                ...(n.style ? { style: n.style } : {}),
              }))
            );
          }

          if (Array.isArray(storedEdges)) {
            setEdges(storedEdges);
          }

          setHasUnsavedChanges(false);
        }
      } catch (error) {
        console.error("Error loading pipeline:", error);
        toast.error("Failed to load pipeline");
      } finally {
        setIsLoadingPipeline(false);
      }
    };

    loadPipeline();
  }, [pipelineId, fetchPipeline, setNodes, setEdges]);

  // Load template if specified
  useMemo(() => {
    if (templateId && TEMPLATE_FLOWS[templateId]) {
      const templateSteps = TEMPLATE_FLOWS[templateId];
      const newNodes: Node[] = templateSteps.map((step) => ({
        id: step.id,
        type: "pipeline",
        position: step.position,
        data: {
          label: step.label,
          nodeType: step.type,
          category: step.type.split("_")[0],
        },
      }));

      const newEdges: Edge[] = templateSteps.slice(1).map((step, index) => ({
        id: `e${templateSteps[index].id}-${step.id}`,
        source: templateSteps[index].id,
        target: step.id,
        type: "smoothstep",
        animated: true,
      }));

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [templateId, setNodes, setEdges]);
  // Track previous state to avoid duplicate pushes
  const prevNodesRef = useRef<string>("");
  const prevEdgesRef = useRef<string>("");

  // Push to history when nodes/edges change (debounced to avoid infinite loops)
  useEffect(() => {
    const nodesStr = JSON.stringify(nodes.map(n => ({ id: n.id, position: n.position })));
    const edgesStr = JSON.stringify(edges.map(e => ({ id: e.id, source: e.source, target: e.target })));
    
    // Only push if actually changed
    if (nodesStr !== prevNodesRef.current || edgesStr !== prevEdgesRef.current) {
      prevNodesRef.current = nodesStr;
      prevEdgesRef.current = edgesStr;
      
      if (nodes.length > 0 || edges.length > 0) {
        pushState(nodes, edges);
      }
    }
  }, [nodes, edges, pushState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected nodes/edges
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          handleDeleteSelected();
        }
      }
      
      // Undo (Ctrl+Z)
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      
      // Redo (Ctrl+Y or Ctrl+Shift+Z)
      if ((e.ctrlKey && e.key === "y") || (e.ctrlKey && e.shiftKey && e.key === "z")) {
        e.preventDefault();
        handleRedo();
      }
      
      // Duplicate (Ctrl+D)
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        handleDuplicateSelected();
      }
      
      // Save (Ctrl+S)
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      }

      // Fullscreen (F)
      if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          setIsFullscreen((prev) => !prev);
        }
      }

      // Toggle Sidebar (P)
      if (e.key === "p" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          setSidebarOpen((prev) => !prev);
        }
      }

      // Toggle Minimap (M)
      if (e.key === "m" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          setMinimapVisible((prev) => !prev);
        }
      }

      // Auto Layout (L)
      if (e.key === "l" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          handleAutoLayout();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodes, selectedEdges, nodes, edges]);

  // Convert line style to edge style properties
  const getEdgeStyle = useCallback((style: LineStyle) => {
    const strokeDasharray = style.pattern === "dashed" ? "5,5" : style.pattern === "dotted" ? "2,2" : undefined;
    return {
      stroke: style.color,
      strokeWidth: style.thickness,
      strokeDasharray,
    };
  }, []);

  // Calculate next node position
  const getNextNodePosition = useCallback(() => {
    if (nodes.length === 0) {
      return { x: 250, y: 150 };
    }
    
    const rightmostNode = nodes.reduce((prev, current) => 
      (prev.position.x > current.position.x) ? prev : current
    );
    
    return {
      x: rightmostNode.position.x + 200,
      y: rightmostNode.position.y,
    };
  }, [nodes]);

  // Add node via click
  const handleAddNode = useCallback((nodeType: WorkflowNodeType, customLabel?: string) => {
    if (isPipelineLinked(pipelineName)) {
      toast.warning(`Cannot add nodes — this pipeline is linked to build jobs. Unlink it first.`);
      return;
    }
    const isCustomEnv = nodeType.startsWith("env_custom_");
    const isEnvironment = isEnvNode(nodeType);
    const category = isCustomEnv ? "environment" : nodeType.split("_")[0];
    const label = customLabel || NODE_LABELS[nodeType] || nodeType;

    if (isEnvironment) {
      // Create as a group container node
      const envGroups = nodes.filter((n) => isEnvNode(n.data.nodeType as string));
      const groupX = 100 + envGroups.length * ENV_GROUP_SPACING;
      
      const newNode: Node = {
        id: `${nodeType}-${Date.now()}`,
        type: "environmentGroup",
        position: { x: groupX, y: 100 },
        data: {
          label,
          nodeType,
          category,
          isCustomEnvironment: isCustomEnv,
        },
        style: { width: ENV_GROUP_WIDTH, height: ENV_GROUP_HEIGHT },
      };

      setNodes((nds) => {
        const updatedNodes = nds.concat(newNode);
        const existingEdgeIds = new Set(edges.map(e => e.id));
        const envEdges = generateEnvFlowEdges(updatedNodes, existingEdgeIds);
        if (envEdges.length > 0) {
          setEdges((eds) => [...eds.filter(e => !e.id.startsWith("env-flow-")), ...envEdges as any]);
        }
        return updatedNodes;
      });
    } else {
      // Regular workflow node
      const position = getNextNodePosition();
      const newNode: Node = {
        id: `${nodeType}-${Date.now()}`,
        type: "pipeline",
        position,
        data: {
          label,
          nodeType,
          category,
          isCustomEnvironment: isCustomEnv,
        },
      };

      setNodes((nds) => nds.concat(newNode));
      suggestConnection(newNode);
    }
    setHasUnsavedChanges(true);
    toast.success(`Added ${label} node`);
  }, [setNodes, setEdges, edges, nodes, getNextNodePosition, suggestConnection]);

  // Handle accepting a connection suggestion
  const handleAcceptConnectionSuggestion = useCallback(() => {
    if (!suggestion) return;
    
    const edgeStyle = getEdgeStyle(lineStyle);
    const newEdge: Edge = {
      id: `e${suggestion.sourceNode.id}-${suggestion.targetNode.id}`,
      source: suggestion.sourceNode.id,
      target: suggestion.targetNode.id,
      type: lineStyle.type === "straight" ? "straight" : lineStyle.type === "bezier" ? "bezier" : "smoothstep",
      animated: lineStyle.animated,
      style: edgeStyle,
      markerEnd: lineStyle.arrow === "end" || lineStyle.arrow === "both" 
        ? { type: "arrowclosed" as const, color: lineStyle.color } 
        : undefined,
      markerStart: lineStyle.arrow === "start" || lineStyle.arrow === "both" 
        ? { type: "arrowclosed" as const, color: lineStyle.color } 
        : undefined,
    };
    
    setEdges((eds) => [...eds, newEdge]);
    clearSuggestion();
    setHasUnsavedChanges(true);
    toast.success("Nodes connected");
  }, [suggestion, lineStyle, setEdges, clearSuggestion, getEdgeStyle]);

  // Delete selected nodes/edges
  const handleDeleteSelected = useCallback(() => {
    if (isPipelineLinked(pipelineName)) {
      toast.warning(`Cannot delete — this pipeline is linked to build jobs. Unlink it first.`);
      return;
    }
    if (selectedNodes.length > 0) {
      const selectedIds = selectedNodes.map(n => n.id);
      setNodes((nds) => nds.filter((n) => !selectedIds.includes(n.id)));
      setEdges((eds) => eds.filter((e) => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)));
    }
    if (selectedEdges.length > 0) {
      const selectedIds = selectedEdges.map(e => e.id);
      setEdges((eds) => eds.filter((e) => !selectedIds.includes(e.id)));
    }
    setHasUnsavedChanges(true);
    toast.success("Deleted selected items");
  }, [selectedNodes, selectedEdges, setNodes, setEdges, isPipelineLinked, pipelineName]);

  // Duplicate selected nodes
  const handleDuplicateSelected = useCallback(() => {
    if (selectedNodes.length === 0) return;

    const newNodes = selectedNodes.map((node) => ({
      ...node,
      id: `${node.data.nodeType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50,
      },
      selected: false,
    }));

    setNodes((nds) => [...nds, ...newNodes]);
    setHasUnsavedChanges(true);
    toast.success(`Duplicated ${newNodes.length} node(s)`);
  }, [selectedNodes, setNodes]);

  // Undo/Redo
  const handleUndo = useCallback(() => {
    const state = undo();
    if (state) {
      setNodes(state.nodes);
      setEdges(state.edges);
      toast.info("Undo");
    }
  }, [undo, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    const state = redo();
    if (state) {
      setNodes(state.nodes);
      setEdges(state.edges);
      toast.info("Redo");
    }
  }, [redo, setNodes, setEdges]);

  // Auto-layout nodes
  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;

    // Detect env nodes by nodeType (works for both new environmentGroup nodes and existing flat pipeline nodes)
    const hasEnvNodes = nodes.some((n) => isEnvNode(n.data.nodeType as string));
    
    if (hasEnvNodes) {
      // Use group-aware structured layout (auto-detects and converts flat env nodes to groups)
      const { layoutedNodes, childEdges } = autoLayoutWithGroups(nodes, edges);
      setNodes(layoutedNodes);
      // Regenerate env flow edges + child edges, removing old inter-node edges that are now internal to groups
      const envNodeIds = new Set(layoutedNodes.filter(n => n.type === "environmentGroup").map(n => n.id));
      const parentedIds = new Set(layoutedNodes.filter(n => n.parentId).map(n => n.id));
      // Keep only edges that aren't between env→child or child→child within same group (those are replaced by child-flow edges)
      const keptEdges = edges.filter(e => {
        // Remove old env-flow and child-flow edges
        if (e.id.startsWith("env-flow-") || e.id.startsWith("child-flow-")) return false;
        // Remove edges from env nodes to their children (now internal)
        if (envNodeIds.has(e.source) && parentedIds.has(e.target)) return false;
        // Remove edges between two parented nodes in the same group
        const sourceNode = layoutedNodes.find(n => n.id === e.source);
        const targetNode = layoutedNodes.find(n => n.id === e.target);
        if (sourceNode?.parentId && targetNode?.parentId && sourceNode.parentId === targetNode.parentId) return false;
        return true;
      });
      const existingEdgeIds = new Set(keptEdges.map(e => e.id));
      const envEdges = generateEnvFlowEdges(layoutedNodes, existingEdgeIds);
      setEdges([
        ...keptEdges,
        ...envEdges as any,
        ...childEdges,
      ]);
    } else {
      // Original linear layout
      const spacing = { x: 200, y: 100 };
      const startPos = { x: 100, y: 100 };
      const sortedNodes = [...nodes].sort((a, b) => {
        const aTime = parseInt(a.id.split("-").pop() || "0");
        const bTime = parseInt(b.id.split("-").pop() || "0");
        return aTime - bTime;
      });
      const layoutedNodes = sortedNodes.map((node, index) => ({
        ...node,
        position: {
          x: startPos.x + (index * spacing.x),
          y: startPos.y + ((index % 2) * spacing.y),
        },
      }));
      setNodes(layoutedNodes);
    }

    setHasUnsavedChanges(true);
    reactFlowInstance.fitView({ padding: 0.2 });
    toast.success("Auto-layout applied");
  }, [nodes, edges, setNodes, setEdges, reactFlowInstance]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn();
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut();
  }, [reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  // Update node data
  const handleUpdateNode = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      )
    );
    setHasUnsavedChanges(true);
  }, [setNodes]);

  // Connection handler - applies current line style
  const onConnect = useCallback(
    (params: Connection) => {
      if (isPipelineLinked(pipelineName)) {
        toast.warning(`Cannot connect nodes — this pipeline is linked to build jobs. Unlink it first.`);
        return;
      }
      const edgeStyle = getEdgeStyle(lineStyle);
      setEdges((eds) =>
        addEdge({
          ...params,
          type: lineStyle.type === "straight" ? "straight" : lineStyle.type === "bezier" ? "bezier" : "smoothstep",
          animated: lineStyle.animated,
          style: edgeStyle,
          markerEnd: lineStyle.arrow === "end" || lineStyle.arrow === "both" ? { type: "arrowclosed" as const, color: lineStyle.color } : undefined,
          markerStart: lineStyle.arrow === "start" || lineStyle.arrow === "both" ? { type: "arrowclosed" as const, color: lineStyle.color } : undefined,
        }, eds)
      );
      setHasUnsavedChanges(true);
    },
    [setEdges, lineStyle, getEdgeStyle]
  );

  // Update all existing edges when line style changes
  const handleLineStyleChange = useCallback((newStyle: LineStyle) => {
    setLineStyle(newStyle);
    const edgeStyle = getEdgeStyle(newStyle);
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        type: newStyle.type === "straight" ? "straight" : newStyle.type === "bezier" ? "bezier" : "smoothstep",
        animated: newStyle.animated,
        style: edgeStyle,
        markerEnd: newStyle.arrow === "end" || newStyle.arrow === "both" ? { type: "arrowclosed" as const, color: newStyle.color } : undefined,
        markerStart: newStyle.arrow === "start" || newStyle.arrow === "both" ? { type: "arrowclosed" as const, color: newStyle.color } : undefined,
      }))
    );
    setHasUnsavedChanges(true);
  }, [setEdges, getEdgeStyle]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isPipelineLinked(pipelineName)) {
        toast.warning(`Cannot add nodes — this pipeline is linked to build jobs. Unlink it first.`);
        return;
      }

      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;

      // Handle custom label format: "nodeType::customLabel"
      const [type, customLabel] = rawData.split("::") as [WorkflowNodeType, string | undefined];
      if (!type) return;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const isCustomEnv = type.startsWith("env_custom_");
      const isEnvironment = isEnvNode(type);
      const category = isCustomEnv ? "environment" : type.split("_")[0];
      const label = customLabel || NODE_LABELS[type] || type;

      if (isEnvironment) {
        // Create as group container
        const newNode: Node = {
          id: `${type}-${Date.now()}`,
          type: "environmentGroup",
          position,
          data: { label, nodeType: type, category, isCustomEnvironment: isCustomEnv },
          style: { width: ENV_GROUP_WIDTH, height: ENV_GROUP_HEIGHT },
        };
        setNodes((nds) => {
          const updatedNodes = nds.concat(newNode);
          const existingEdgeIds = new Set(edges.map(e => e.id));
          const envEdges = generateEnvFlowEdges(updatedNodes, existingEdgeIds);
          if (envEdges.length > 0) {
            setEdges((eds) => [...eds.filter(e => !e.id.startsWith("env-flow-")), ...envEdges as any]);
          }
          return updatedNodes;
        });
      } else {
        // Check if dropped inside an environment group
        const envGroups = nodes.filter((n) => n.type === "environmentGroup");
        let parentGroup: Node | null = null;
        for (const group of envGroups) {
          const gw = (group.style?.width as number) || ENV_GROUP_WIDTH;
          const gh = (group.style?.height as number) || ENV_GROUP_HEIGHT;
          if (
            position.x >= group.position.x &&
            position.x <= group.position.x + gw &&
            position.y >= group.position.y &&
            position.y <= group.position.y + gh
          ) {
            parentGroup = group;
            break;
          }
        }

        const newNode: Node = {
          id: `${type}-${Date.now()}`,
          type: "pipeline",
          position: parentGroup
            ? { x: position.x - parentGroup.position.x, y: position.y - parentGroup.position.y }
            : position,
          data: { label, nodeType: type, category, isCustomEnvironment: isCustomEnv },
          ...(parentGroup ? { parentId: parentGroup.id, extent: "parent" as const } : {}),
        };

        setNodes((nds) => nds.concat(newNode));
        suggestConnection(newNode);
      }
      setHasUnsavedChanges(true);
      toast.success(`Added ${label} node`);
    },
    [setNodes, setEdges, edges, nodes, reactFlowInstance, suggestConnection]
  );

  // Handle reparenting when a node is dragged into/out of an env group
  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (draggedNode.type === "environmentGroup") return; // Don't reparent groups

    const envGroups = nodes.filter((n) => n.type === "environmentGroup" && n.id !== draggedNode.id);
    
    // Calculate the absolute position of the dragged node
    let absX = draggedNode.position.x;
    let absY = draggedNode.position.y;
    if (draggedNode.parentId) {
      const parent = nodes.find((n) => n.id === draggedNode.parentId);
      if (parent) {
        absX += parent.position.x;
        absY += parent.position.y;
      }
    }

    // Check if the node is inside any env group
    let targetGroup: Node | null = null;
    for (const group of envGroups) {
      const gw = (group.style?.width as number) || ENV_GROUP_WIDTH;
      const gh = (group.style?.height as number) || ENV_GROUP_HEIGHT;
      if (
        absX >= group.position.x &&
        absX <= group.position.x + gw &&
        absY >= group.position.y &&
        absY <= group.position.y + gh
      ) {
        targetGroup = group;
        break;
      }
    }

    const currentParent = draggedNode.parentId as string | undefined;

    if (targetGroup && currentParent !== targetGroup.id) {
      // Reparent to new group
      setNodes((nds) =>
        nds.map((n) =>
          n.id === draggedNode.id
            ? {
                ...n,
                parentId: targetGroup!.id,
                extent: "parent" as const,
                position: {
                  x: absX - targetGroup!.position.x,
                  y: absY - targetGroup!.position.y,
                },
              }
            : n
        )
      );
      setHasUnsavedChanges(true);
    } else if (!targetGroup && currentParent) {
      // Remove from group
      setNodes((nds) =>
        nds.map((n) =>
          n.id === draggedNode.id
            ? {
                ...n,
                parentId: undefined,
                extent: undefined,
                position: { x: absX, y: absY },
              }
            : n
        )
      );
      setHasUnsavedChanges(true);
    }
  }, [nodes, setNodes]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // Generate YAML content
  const generateYamlContent = useCallback(() => {
    return `# Pipeline: ${pipelineName}
# Account: ${selectedAccountId}
# Enterprise: ${selectedEnterpriseId}
# Generated by Pipeline Canvas
# Updated: ${new Date().toISOString()}

stages:
${nodes.map((n) => `  - name: ${n.data.label}
    type: ${n.data.nodeType}
    category: ${n.data.category}${n.data.description ? `\n    description: ${n.data.description}` : ""}${n.data.continueOnError ? `\n    continueOnError: true` : ""}${n.data.parallel ? `\n    parallel: true` : ""}${n.data.timeout ? `\n    timeout: ${n.data.timeout}` : ""}${n.data.retries ? `\n    retries: ${n.data.retries}` : ""}`).join("\n")}

connections:
${edges.map((e) => `  - source: ${e.source}
    target: ${e.target}`).join("\n")}
`;
  }, [nodes, edges, pipelineName, selectedAccountId, selectedEnterpriseId]);



  const handleSave = useCallback(async () => {
    // Block save if pipeline is linked to build jobs
    if (isPipelineLinked(pipelineName)) {
      toast.error("This pipeline is linked to build jobs. Unlink it from existing builds before editing.");
      return;
    }

    if (!selectedAccountId || !selectedEnterpriseId) {
      toast.error("Please select an Account and Enterprise from the header");
      return;
    }

    const yamlContent = generateYamlContent();
    
    const nodesForStorage = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      ...(n.style ? { style: n.style } : {}),
      data: {
        label: n.data.label,
        nodeType: n.data.nodeType,
        category: n.data.category,
        description: n.data.description,
        status: n.data.status,
        continueOnError: n.data.continueOnError,
        parallel: n.data.parallel,
        timeout: n.data.timeout,
        retries: n.data.retries,
      },
    })) as unknown as Json;

    const edgesForStorage = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      animated: e.animated,
      ...(e.style ? { style: e.style } : {}),
      ...(e.markerEnd ? { markerEnd: e.markerEnd } : {}),
    })) as unknown as Json;

    try {
      if (currentPipelineId) {
        await updatePipeline({
          id: currentPipelineId,
          name: pipelineName,
          deployment_type: deploymentType,
          nodes: nodesForStorage,
          edges: edgesForStorage,
          yaml_content: yamlContent,
          product_id: selectedProductId,
          service_ids: selectedServiceIds,
        });
      } else {
        const newPipeline = await createPipeline({
          name: pipelineName,
          deployment_type: deploymentType,
          nodes: nodesForStorage,
          edges: edgesForStorage,
          yaml_content: yamlContent,
          product_id: selectedProductId,
          service_ids: selectedServiceIds,
        });
        setCurrentPipelineId(newPipeline.id);
        navigate(`/pipelines/canvas?id=${newPipeline.id}&mode=edit`, { replace: true });
      }
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Error saving pipeline:", error);
    }
  }, [nodes, edges, pipelineName, deploymentType, currentPipelineId, selectedAccountId, selectedEnterpriseId, selectedProductId, selectedServiceIds, generateYamlContent, createPipeline, updatePipeline, navigate]);

  // Autosave function (silent save without toasts)
  const handleAutoSave = useCallback(async () => {
    if (!selectedAccountId || !selectedEnterpriseId || !currentPipelineId || isPipelineLinked(pipelineName)) {
      return; // Only autosave existing pipelines with valid context, skip if linked to builds
    }

    if (!hasUnsavedChanges || isAutoSaving) {
      return;
    }

    setIsAutoSaving(true);

    const yamlContent = generateYamlContent();
    
    const nodesForStorage = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      ...(n.parentId ? { parentId: n.parentId } : {}),
      ...(n.style ? { style: n.style } : {}),
      data: {
        label: n.data.label,
        nodeType: n.data.nodeType,
        category: n.data.category,
        description: n.data.description,
        status: n.data.status,
        continueOnError: n.data.continueOnError,
        parallel: n.data.parallel,
        timeout: n.data.timeout,
        retries: n.data.retries,
      },
    })) as unknown as Json;

    const edgesForStorage = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      animated: e.animated,
      ...(e.style ? { style: e.style } : {}),
      ...(e.markerEnd ? { markerEnd: e.markerEnd } : {}),
    })) as unknown as Json;

    try {
      await updatePipeline({
        id: currentPipelineId,
        name: pipelineName,
        deployment_type: deploymentType,
        nodes: nodesForStorage,
        edges: edgesForStorage,
        yaml_content: yamlContent,
        product_id: selectedProductId,
        service_ids: selectedServiceIds,
      });
      setHasUnsavedChanges(false);
      setLastAutoSaved(new Date());
    } catch (error) {
      console.error("Autosave failed:", error);
      // Silent fail - user can still manually save
    } finally {
      setIsAutoSaving(false);
    }
  }, [nodes, edges, pipelineName, deploymentType, currentPipelineId, selectedAccountId, selectedEnterpriseId, selectedProductId, selectedServiceIds, hasUnsavedChanges, isAutoSaving, generateYamlContent, updatePipeline]);

  // Debounced autosave effect
  useEffect(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only schedule autosave if there are unsaved changes and we have a pipeline ID
    if (hasUnsavedChanges && currentPipelineId && selectedAccountId && selectedEnterpriseId) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleAutoSave();
      }, AUTOSAVE_DELAY);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, currentPipelineId, selectedAccountId, selectedEnterpriseId, nodes, edges, handleAutoSave]);

  const handleExport = useCallback(() => {
    const yamlContent = generateYamlContent();
    
    const blob = new Blob([yamlContent], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pipelineName.toLowerCase().replace(/\s+/g, "-")}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Pipeline exported as YAML");
  }, [generateYamlContent, pipelineName]);

  // Show loading state when account/enterprise context isn't ready
  if (!selectedAccountId || !selectedEnterpriseId) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full border-[3px] border-muted animate-spin" style={{ borderTopColor: '#0171EC' }} />
          <div>
            <p className="text-sm font-semibold text-foreground">Loading context...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Waiting for Account and Enterprise selection. Please ensure they are selected in the header.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/pipelines")}>
            Back to Pipelines
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className={cn(
        "h-screen flex flex-col bg-background relative overflow-hidden",
        "transition-all duration-300"
      )}
      animate={{ 
        backgroundColor: isFullscreen ? "hsl(var(--background))" : "hsl(var(--muted)/0.3)"
      }}
    >
      {/* Header Bar - Hide in fullscreen */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.div
            initial={{ opacity: 0, y: -56 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -56 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <PipelineHeaderBar
              pipelineName={pipelineName}
              onNameChange={(name) => {
                setPipelineName(name);
                setHasUnsavedChanges(true);
              }}
              deploymentType={deploymentType}
              onDeploymentTypeChange={(type) => {
                setDeploymentType(type);
                setHasUnsavedChanges(true);
              }}
              nodeCount={nodes.length}
              edgeCount={edges.length}
              hasUnsavedChanges={hasUnsavedChanges}
              isSaving={isCreating || isUpdating}
              isAutoSaving={isAutoSaving}
              lastAutoSaved={lastAutoSaved}
              mode={mode}
              pipelineStatus={pipelineStatus}
              onStatusChange={async (status) => {
                if (currentPipelineId) {
                  try {
                    await updatePipeline({ id: currentPipelineId, status });
                    setPipelineStatus(status);
                    toast.success(`Pipeline status changed to ${status}`);
                  } catch (e) {
                    toast.error("Failed to update status");
                  }
                }
              }}
              onSave={handleSave}
              onBack={() => navigate("/pipelines")}
              workstreams={workstreams.map(w => ({ id: w.id, name: w.name }))}
              products={availableProducts}
              services={availableServices}
              selectedWorkstreamId={selectedWorkstreamId}
              selectedProductId={selectedProductId}
              selectedServiceIds={selectedServiceIds}
              onWorkstreamChange={(id) => {
                setSelectedWorkstreamId(id);
                setHasUnsavedChanges(true);
              }}
              onProductChange={(id) => {
                setSelectedProductId(id);
                setHasUnsavedChanges(true);
              }}
              onServiceChange={(ids) => {
                setSelectedServiceIds(ids);
                setHasUnsavedChanges(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* No permanent banner — warning shown only on modification attempts */}

      {/* Fullscreen Exit Button */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-4 right-4 z-50"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(false)}
              className="gap-2 bg-background/90 backdrop-blur-sm shadow-lg border-border/50"
            >
              <Minimize2 className="w-4 h-4" />
              Exit Fullscreen
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex relative">
        {/* Expanded Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex-none border-r border-border bg-background overflow-hidden shadow-lg z-20"
            >
              <PipelineSidebar onClose={() => setSidebarOpen(false)} onAddNode={handleAddNode} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compact Sidebar (when main sidebar is closed) */}
        {!sidebarOpen && (
          <CanvasCompactSidebar
            isExpanded={sidebarOpen}
            onExpandChange={setSidebarOpen}
            onAddNode={handleAddNode}
          />
        )}
        {/* View Mode Toggle - right center of screen with animation */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1 bg-background/90 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg p-1"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "canvas" ? "default" : "ghost"}
                size="icon"
                onClick={() => setViewMode("canvas")}
                className="h-8 w-8"
              >
                <PenTool className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><span>Canvas</span></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === "flow" ? "default" : "ghost"}
                size="icon"
                onClick={() => setViewMode("flow")}
                className="h-8 w-8"
              >
                <Workflow className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left"><span>Flow View</span></TooltipContent>
          </Tooltip>
        </motion.div>

        {/* Canvas / Flow View */}
        <div 
          ref={reactFlowWrapper} 
          className={cn(
            "flex-1 relative transition-all duration-300 overflow-hidden",
            !sidebarOpen && "ml-[52px]"
          )}
        >
          {viewMode === "flow" ? (
            <PipelineFlowView nodes={nodes} edges={edges} onUpdateNode={handleUpdateNode} />
          ) : (
            <>
              <ReactFlow
                nodes={nodesWithHandlers}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onNodeClick={onNodeClick}
                onNodeDragStop={onNodeDragStop}
                nodeTypes={nodeTypes}
                defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
                fitView
                fitViewOptions={{ padding: 0.3, maxZoom: 1, minZoom: 0.5 }}
                snapToGrid
                snapGrid={[15, 15]}
                deleteKeyCode={["Delete", "Backspace"]}
                defaultEdgeOptions={{
                  type: lineStyle.type === "straight" ? "straight" : lineStyle.type === "bezier" ? "bezier" : "smoothstep",
                  animated: lineStyle.animated,
                  style: getEdgeStyle(lineStyle),
                  markerEnd: lineStyle.arrow === "end" || lineStyle.arrow === "both" ? { type: "arrowclosed" as const, color: lineStyle.color } : undefined,
                }}
              >
                <Background variant={backgroundType} gap={20} size={1} className="bg-muted/30" />
                <Controls className="bg-background border border-border rounded-lg shadow-sm" />

                {/* Toggleable MiniMap */}
                <AnimatePresence>
                  {minimapVisible && (
                    <MiniMap
                      className="bg-background border border-border rounded-lg shadow-md !opacity-90"
                      nodeColor={(node) => CATEGORY_COLORS[node.data.category as string] || "#64748b"}
                      maskColor="rgba(0, 0, 0, 0.1)"
                      style={{ 
                        transition: "opacity 0.3s ease-in-out",
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* Canvas Toolbar */}
                <CanvasToolbar
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onFitView={handleFitView}
                  onAutoLayout={handleAutoLayout}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onCopySelection={handleDuplicateSelected}
                  onSavePipeline={handleSave}
                  onExportPipeline={handleExport}
                  onBackgroundChange={setBackgroundType}
                  onLineStyleChange={handleLineStyleChange}
                  backgroundType={backgroundType}
                  lineStyle={lineStyle}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  hasSelection={hasSelection}
                  isSaving={isCreating || isUpdating}
                  nodeCount={nodes.length}
                />

                {/* Empty State */}
                {nodes.length === 0 && (
                  <Panel position="top-center" className="mt-20">
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="text-center p-8 bg-background/95 backdrop-blur-md rounded-2xl border border-border shadow-xl"
                    >
                      <motion.div 
                        className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4"
                        animate={{ 
                          boxShadow: ["0 0 0 0 rgba(1, 113, 236, 0.2)", "0 0 0 20px rgba(1, 113, 236, 0)", "0 0 0 0 rgba(1, 113, 236, 0.2)"]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Grid3X3 className="w-8 h-8 text-primary" />
                      </motion.div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Start Building Your Pipeline</h3>
                      <p className="text-muted-foreground mb-4 max-w-md">
                        Use the sidebar icons or press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">P</kbd> to open the palette.
                        Drag nodes onto the canvas to begin.
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setSidebarOpen(true)}
                          className="gap-2"
                        >
                          Open Palette
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsFullscreen(true)}
                          className="gap-1.5 text-muted-foreground"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          Fullscreen
                        </Button>
                      </div>
                    </motion.div>
                  </Panel>
                )}
              </ReactFlow>

              {/* Connection Suggestion Popup */}
              {suggestion && (() => {
                const screenPos = reactFlowInstance.flowToScreenPosition(suggestion.position);
                const bounds = reactFlowWrapper.current?.getBoundingClientRect();
                const adjustedPos = bounds ? {
                  x: screenPos.x - bounds.left,
                  y: screenPos.y - bounds.top,
                } : screenPos;
                return (
                  <ConnectionSuggestion
                    sourceNodeLabel={suggestion.sourceNode.data.label as string}
                    targetNodeLabel={suggestion.targetNode.data.label as string}
                    sourceCategory={suggestion.sourceNode.data.category as string}
                    targetCategory={suggestion.targetNode.data.category as string}
                    position={adjustedPos}
                    onAccept={handleAcceptConnectionSuggestion}
                    onDismiss={clearSuggestion}
                  />
                );
              })()}

              {/* Quick Actions FAB */}
              <CanvasQuickActions
                onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
                onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
                onToggleMinimap={() => setMinimapVisible((prev) => !prev)}
                onAutoLayout={handleAutoLayout}
                sidebarOpen={sidebarOpen}
                isFullscreen={isFullscreen}
                minimapVisible={minimapVisible}
                nodeCount={nodes.length}
              />
            </>
          )}
        </div>

        {/* Node Configuration Panel */}
        <NodeConfigPanel
          open={configPanelOpen}
          onOpenChange={setConfigPanelOpen}
          node={selectedNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onDuplicateNode={handleDuplicateNode}
        />
      </div>
    </motion.div>
  );
}

export default function PipelineCanvasPage() {
  return (
    <PermissionGate menuKey="pipelines">
      <ReactFlowProvider>
        <PipelineCanvasContent />
      </ReactFlowProvider>
    </PermissionGate>
  );
}
