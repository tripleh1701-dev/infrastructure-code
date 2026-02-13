import { useState, useCallback, useRef } from "react";
import { Node, Edge } from "@xyflow/react";

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

interface UseCanvasHistoryOptions {
  maxHistory?: number;
}

export function useCanvasHistory(options: UseCanvasHistoryOptions = {}) {
  const { maxHistory = 50 } = options;
  
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const pushState = useCallback((nodes: Node[], edges: Edge[]) => {
    // Skip if this is an undo/redo action
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    setHistory((prev) => {
      // Remove any future states if we're in the middle of history
      const newHistory = prev.slice(0, currentIndex + 1);
      
      // Add new state
      const newState: HistoryState = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      };
      
      newHistory.push(newState);
      
      // Limit history size
      if (newHistory.length > maxHistory) {
        newHistory.shift();
        return newHistory;
      }
      
      return newHistory;
    });
    
    setCurrentIndex((prev) => Math.min(prev + 1, maxHistory - 1));
  }, [currentIndex, maxHistory]);

  const undo = useCallback((): HistoryState | null => {
    if (!canUndo) return null;
    
    isUndoRedoAction.current = true;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    
    return history[newIndex];
  }, [canUndo, currentIndex, history]);

  const redo = useCallback((): HistoryState | null => {
    if (!canRedo) return null;
    
    isUndoRedoAction.current = true;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    
    return history[newIndex];
  }, [canRedo, currentIndex, history]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return {
    pushState,
    undo,
    redo,
    clear,
    canUndo,
    canRedo,
    historyLength: history.length,
    currentIndex,
  };
}
