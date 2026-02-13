import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Node,
  Edge,
  MarkerType,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { usePipelines } from "@/hooks/usePipelines";
import { PipelineNode } from "@/components/pipeline/PipelineNode";
import { RotateCw, GitBranch } from "lucide-react";

const nodeTypes = { pipelineNode: PipelineNode };

const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;

/** Use dagre to auto-layout nodes left-to-right */
function autoLayoutNodes(rawNodes: Node[], rawEdges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  if (rawNodes.length === 0) return { nodes: rawNodes, edges: rawEdges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });

  rawNodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  rawEdges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutNodes = rawNodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutNodes, edges: rawEdges };
}

/** Generate execution status colors for edges */
function getEdgeStyle(status?: string): Partial<Edge> {
  const base = { type: "smoothstep" as const, animated: false };
  switch (status) {
    case "success":
      return { ...base, style: { stroke: "#10b981", strokeWidth: 2 }, animated: false };
    case "running":
      return { ...base, style: { stroke: "#3b82f6", strokeWidth: 2.5 }, animated: true };
    case "pending":
    default:
      return { ...base, style: { stroke: "#cbd5e1", strokeWidth: 1.5 }, animated: false };
  }
}

interface PipelineCanvasPreviewProps {
  pipelineName: string | null;
  /** When provided, simulates real-time execution flowing through nodes */
  executionStatus?: string;
  /** When provided by parent, overrides the internal stage progression */
  activeStageIndex?: number;
}

export function PipelineCanvasPreview({ pipelineName, executionStatus, activeStageIndex: parentStageIndex }: PipelineCanvasPreviewProps) {
  const { pipelines, isLoading } = usePipelines();
  const [activeNodeIndex, setActiveNodeIndex] = useState(-1);

  const pipeline = useMemo(() => {
    if (!pipelineName) return null;
    return pipelines.find((p) => p.name === pipelineName) || null;
  }, [pipelines, pipelineName]);

  // Parse raw nodes/edges from pipeline
  const rawNodes = useMemo(() => {
    if (!pipeline?.nodes || !Array.isArray(pipeline.nodes)) return [];
    return (pipeline.nodes as any[]).map((n) => ({
      ...n,
      type: n.type || "pipelineNode",
      draggable: false,
      selectable: false,
      connectable: false,
    })) as Node[];
  }, [pipeline]);

  const rawEdges = useMemo(() => {
    if (!pipeline?.edges || !Array.isArray(pipeline.edges)) return [];
    return pipeline.edges as unknown as Edge[];
  }, [pipeline]);

  // Auto-layout with dagre
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => autoLayoutNodes(rawNodes, rawEdges),
    [rawNodes, rawEdges]
  );

  // Build topological order for execution simulation
  const topoOrder = useMemo(() => {
    if (layoutNodes.length === 0) return [];
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    layoutNodes.forEach((n) => {
      adjacency.set(n.id, []);
      inDegree.set(n.id, 0);
    });
    layoutEdges.forEach((e) => {
      adjacency.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });
    const queue = layoutNodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);
    const order: string[] = [];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      order.push(curr);
      for (const next of adjacency.get(curr) || []) {
        inDegree.set(next, (inDegree.get(next) || 0) - 1);
        if (inDegree.get(next) === 0) queue.push(next);
      }
    }
    return order;
  }, [layoutNodes, layoutEdges]);

  // Use parent-driven stage index if provided, otherwise simulate internally
  useEffect(() => {
    if (parentStageIndex !== undefined) {
      setActiveNodeIndex(parentStageIndex);
      return;
    }

    if (executionStatus !== "running" || topoOrder.length === 0) {
      if (executionStatus === "success") setActiveNodeIndex(topoOrder.length);
      else if (executionStatus === "failed") setActiveNodeIndex(Math.max(0, Math.min(topoOrder.length - 1, 2)));
      else setActiveNodeIndex(-1);
      return;
    }

    setActiveNodeIndex(0);
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx >= topoOrder.length) {
        clearInterval(interval);
        setActiveNodeIndex(topoOrder.length);
      } else {
        setActiveNodeIndex(idx);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [executionStatus, topoOrder, parentStageIndex]);

  // Compute final nodes with execution status overlaid
  const displayNodes = useMemo(() => {
    if (activeNodeIndex < 0 || topoOrder.length === 0) return layoutNodes;

    return layoutNodes.map((node) => {
      const orderIdx = topoOrder.indexOf(node.id);
      let status: string | undefined;
      if (orderIdx < activeNodeIndex) status = executionStatus === "failed" && orderIdx === activeNodeIndex - 1 ? "failed" : "success";
      else if (orderIdx === activeNodeIndex && executionStatus === "running") status = "running";
      else if (orderIdx === activeNodeIndex && executionStatus === "failed") status = "failed";
      else status = "pending";

      return {
        ...node,
        data: { ...node.data, status },
      };
    });
  }, [layoutNodes, activeNodeIndex, topoOrder, executionStatus]);

  // Compute edges with execution coloring
  const displayEdges = useMemo(() => {
    return layoutEdges.map((edge) => {
      const sourceIdx = topoOrder.indexOf(edge.source);
      const targetIdx = topoOrder.indexOf(edge.target);
      let status: string;
      if (sourceIdx < activeNodeIndex && targetIdx <= activeNodeIndex) status = "success";
      else if (sourceIdx === activeNodeIndex - 1 && targetIdx === activeNodeIndex && executionStatus === "running") status = "running";
      else status = "pending";

      const edgeStyle = getEdgeStyle(status);
      return {
        ...edge,
        ...edgeStyle,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: edgeStyle.style?.stroke || "#cbd5e1" },
      };
    });
  }, [layoutEdges, activeNodeIndex, topoOrder, executionStatus]);

  if (!pipelineName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
        <GitBranch className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs font-medium">No pipeline assigned</p>
        <p className="text-[10px] mt-0.5">Assign a pipeline to see the canvas view</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-6">
        <RotateCw className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  if (!pipeline || layoutNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
        <GitBranch className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs font-medium">Pipeline: {pipelineName}</p>
        <p className="text-[10px] mt-0.5">No nodes configured yet</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="w-full h-full min-h-[220px] rounded-lg overflow-hidden border border-border bg-muted/30">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="!bg-muted/20" />
          <Controls showInteractive={false} className="!bg-background/80 !border-border !shadow-sm" />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}