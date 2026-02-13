import { Node, Edge } from "@xyflow/react";

/**
 * Deployment order for environment nodes.
 */
export const ENV_DEPLOYMENT_ORDER: string[] = [
  "env_dev",
  "env_qa",
  "env_staging",
  "env_uat",
  "env_prod",
];

/** Check if a node type is an environment node */
export function isEnvNode(nodeType: string): boolean {
  return nodeType.startsWith("env_");
}

/** Get environment group nodes sorted by deployment order */
export function getOrderedEnvNodes(nodes: Node[]): Node[] {
  const envNodes = nodes.filter((n) => isEnvNode(n.data.nodeType as string));
  return envNodes.sort((a, b) => {
    const aIdx = ENV_DEPLOYMENT_ORDER.indexOf(a.data.nodeType as string);
    const bIdx = ENV_DEPLOYMENT_ORDER.indexOf(b.data.nodeType as string);
    const aOrder = aIdx >= 0 ? aIdx : 999;
    const bOrder = bIdx >= 0 ? bIdx : 999;
    return aOrder - bOrder;
  });
}

/**
 * Generate auto-connection edges between environment group nodes in deployment order.
 */
export function generateEnvFlowEdges(
  nodes: Node[],
  existingEdgeIds: Set<string>
) {
  const ordered = getOrderedEnvNodes(nodes);
  if (ordered.length < 2) return [];

  const newEdges: {
    id: string;
    source: string;
    target: string;
    type: string;
    animated: boolean;
    style: Record<string, unknown>;
    markerEnd: { type: string; width: number; height: number; color: string };
  }[] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const edgeId = `env-flow-${ordered[i].id}-${ordered[i + 1].id}`;
    if (!existingEdgeIds.has(edgeId)) {
      newEdges.push({
        id: edgeId,
        source: ordered[i].id,
        target: ordered[i + 1].id,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: "#6366f1",
          strokeWidth: 2.5,
          strokeDasharray: "8,4",
          opacity: 0.8,
        },
        markerEnd: {
          type: "arrowclosed",
          width: 16,
          height: 16,
          color: "#6366f1",
        },
      });
    }
  }
  return newEdges;
}

/** Default dimensions for environment group nodes */
export const ENV_GROUP_WIDTH = 220;
export const ENV_GROUP_HEIGHT = 200;
export const ENV_GROUP_SPACING = 300;

/** Child node dimensions for layout */
const CHILD_NODE_HEIGHT = 55;
const CHILD_VERTICAL_GAP = 20;
const CHILD_TOP_OFFSET = 50;
const CHILD_LEFT_PADDING = 40;

/**
 * Determines which workflow nodes belong to which environment node
 * by walking edges downstream from each env node until another env node is hit.
 */
function assignNodesToEnvGroups(
  nodes: Node[],
  edges: Edge[]
): Map<string, Node[]> {
  const envNodeIds = new Set(
    nodes.filter((n) => isEnvNode(n.data.nodeType as string)).map((n) => n.id)
  );
  const nonEnvNodes = nodes.filter((n) => !isEnvNode(n.data.nodeType as string));

  // Build adjacency list (source → targets)
  const adjacency = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source)!.push(e.target);
  });

  const groupMap = new Map<string, Node[]>();
  const assignedIds = new Set<string>();

  // For each env node, BFS/DFS downstream to find connected workflow nodes
  const orderedEnvs = getOrderedEnvNodes(nodes);
  orderedEnvs.forEach((envNode) => {
    const children: Node[] = [];
    const queue = [envNode.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const targets = adjacency.get(current) || [];
      for (const targetId of targets) {
        if (envNodeIds.has(targetId)) continue; // Stop at next env node
        if (assignedIds.has(targetId)) continue; // Already assigned
        const targetNode = nonEnvNodes.find((n) => n.id === targetId);
        if (targetNode) {
          children.push(targetNode);
          assignedIds.add(targetId);
          queue.push(targetId); // Continue walking from this node
        }
      }
    }

    groupMap.set(envNode.id, children);
  });

  return groupMap;
}

/**
 * Smart auto-layout that works on BOTH:
 * 1. New pipelines with environmentGroup nodes (already grouped)
 * 2. Existing flat pipelines where env nodes are type "pipeline" (auto-detects and converts)
 *
 * Returns layouted nodes (with env nodes converted to environmentGroup type,
 * workflow nodes re-parented) and child edges connecting steps within each group.
 */
export function autoLayoutWithGroups(
  nodes: Node[],
  edges: Edge[]
): { layoutedNodes: Node[]; childEdges: Edge[] } {
  const envNodes = nodes.filter((n) => isEnvNode(n.data.nodeType as string));
  const nonEnvNodes = nodes.filter((n) => !isEnvNode(n.data.nodeType as string));

  if (envNodes.length === 0) return { layoutedNodes: nodes, childEdges: [] };

  // Determine child assignments: prefer existing parentId, fall back to edge-walking
  const hasParentIds = nonEnvNodes.some((n) => n.parentId);
  let groupChildMap: Map<string, Node[]>;

  if (hasParentIds) {
    // Use existing parent assignments
    groupChildMap = new Map<string, Node[]>();
    envNodes.forEach((env) => groupChildMap.set(env.id, []));
    nonEnvNodes.forEach((node) => {
      const parentId = node.parentId as string | undefined;
      if (parentId && groupChildMap.has(parentId)) {
        groupChildMap.get(parentId)!.push(node);
      }
    });
  } else {
    // Auto-detect groups from edge connections
    groupChildMap = assignNodesToEnvGroups(nodes, edges);
  }

  const layoutedNodes: Node[] = [];
  const childEdges: Edge[] = [];
  const startX = 100;
  const startY = 100;
  let currentX = startX;

  // Sort env nodes by deployment order
  const orderedEnvs = getOrderedEnvNodes(nodes);

  orderedEnvs.forEach((group) => {
    const children = groupChildMap.get(group.id) || [];
    const childCount = Math.max(children.length, 1);
    const groupHeight =
      CHILD_TOP_OFFSET +
      childCount * (CHILD_NODE_HEIGHT + CHILD_VERTICAL_GAP) +
      20;
    const groupWidth = ENV_GROUP_WIDTH;

    // Convert env node to environmentGroup type
    layoutedNodes.push({
      ...group,
      type: "environmentGroup",
      position: { x: currentX, y: startY },
      style: { ...group.style, width: groupWidth, height: groupHeight },
    });

    // Position children vertically inside group
    children.forEach((child, cIdx) => {
      layoutedNodes.push({
        ...child,
        type: "pipeline",
        position: {
          x: CHILD_LEFT_PADDING,
          y: CHILD_TOP_OFFSET + cIdx * (CHILD_NODE_HEIGHT + CHILD_VERTICAL_GAP),
        },
        parentId: group.id,
        extent: "parent" as const,
      });

      // Connect children sequentially within the group
      if (cIdx > 0) {
        const prevChild = children[cIdx - 1];
        const edgeId = `child-flow-${prevChild.id}-${child.id}`;
        childEdges.push({
          id: edgeId,
          source: prevChild.id,
          target: child.id,
          type: "smoothstep",
          animated: false,
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
          markerEnd: {
            type: "arrowclosed" as any,
            width: 10,
            height: 10,
            color: "#94a3b8",
          },
        } as Edge);
      }
    });

    currentX += groupWidth + 80;
  });

  // Non-parented non-env orphan nodes: place after all groups
  const assignedIds = new Set(
    Array.from(groupChildMap.values())
      .flat()
      .map((n) => n.id)
  );
  const orphanNodes = nonEnvNodes.filter(
    (n) => !assignedIds.has(n.id) && !n.parentId
  );
  orphanNodes.forEach((node, idx) => {
    layoutedNodes.push({
      ...node,
      position: {
        x: currentX + idx * 180,
        y: startY + (idx % 2) * 80,
      },
    });
  });

  return { layoutedNodes, childEdges };
}
