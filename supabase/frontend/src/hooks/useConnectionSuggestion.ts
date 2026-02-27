import { useState, useCallback, useRef, useEffect } from "react";
import { Node, Edge } from "@xyflow/react";

interface ConnectionSuggestion {
  sourceNode: Node;
  targetNode: Node;
  position: { x: number; y: number };
}

interface UseConnectionSuggestionOptions {
  maxDistance?: number;
  enabled?: boolean;
}

export function useConnectionSuggestion(
  nodes: Node[],
  edges: Edge[],
  options: UseConnectionSuggestionOptions = {}
) {
  const { maxDistance = 300, enabled = true } = options;
  const [suggestion, setSuggestion] = useState<ConnectionSuggestion | null>(null);
  const pendingNodeRef = useRef<Node | null>(null);

  // Check if connection already exists
  const connectionExists = useCallback(
    (sourceId: string, targetId: string, currentEdges: Edge[]): boolean => {
      return currentEdges.some(
        (edge) =>
          (edge.source === sourceId && edge.target === targetId) ||
          (edge.source === targetId && edge.target === sourceId)
      );
    },
    []
  );

  // Find the nearest node to connect to
  const findNearestNode = useCallback(
    (newNode: Node, allNodes: Node[]): Node | null => {
      if (!enabled || allNodes.length === 0) return null;

      // Filter out the new node itself
      const otherNodes = allNodes.filter((n) => n.id !== newNode.id);
      if (otherNodes.length === 0) return null;

      let nearestNode: Node | null = null;
      let minDistance = Infinity;

      otherNodes.forEach((node) => {
        // Calculate distance between nodes
        const dx = node.position.x - newNode.position.x;
        const dy = node.position.y - newNode.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance && distance <= maxDistance) {
          minDistance = distance;
          nearestNode = node;
        }
      });

      return nearestNode;
    },
    [enabled, maxDistance]
  );

  // Determine if source should be the existing node or new node based on position
  const determineConnectionDirection = useCallback(
    (existingNode: Node, newNode: Node): { source: Node; target: Node } => {
      // If new node is to the right of existing node, existing -> new
      // Otherwise, new -> existing
      if (newNode.position.x > existingNode.position.x) {
        return { source: existingNode, target: newNode };
      } else {
        return { source: newNode, target: existingNode };
      }
    },
    []
  );

  // Process pending node when nodes state updates
  useEffect(() => {
    if (!pendingNodeRef.current || !enabled) return;

    const pendingNode = pendingNodeRef.current;
    
    // Find the pending node in current nodes to confirm it's been added
    const nodeInState = nodes.find(n => n.id === pendingNode.id);
    if (!nodeInState) return;

    // Clear pending node
    pendingNodeRef.current = null;

    const nearestNode = findNearestNode(pendingNode, nodes);
    if (!nearestNode) {
      setSuggestion(null);
      return;
    }

    const { source, target } = determineConnectionDirection(nearestNode, pendingNode);

    // Don't suggest if connection already exists
    if (connectionExists(source.id, target.id, edges)) {
      setSuggestion(null);
      return;
    }

    // Position the suggestion popup near the new node
    setSuggestion({
      sourceNode: source,
      targetNode: target,
      position: {
        x: pendingNode.position.x + 70,
        y: pendingNode.position.y - 10,
      },
    });
  }, [nodes, edges, enabled, findNearestNode, determineConnectionDirection, connectionExists]);

  // Queue a node for suggestion processing
  const suggestConnection = useCallback(
    (newNode: Node) => {
      if (!enabled) return;
      pendingNodeRef.current = newNode;
    },
    [enabled]
  );

  // Clear the suggestion
  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
    pendingNodeRef.current = null;
  }, []);

  return {
    suggestion,
    suggestConnection,
    clearSuggestion,
  };
}
