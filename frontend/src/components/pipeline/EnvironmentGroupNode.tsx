import { memo } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import { Server, Monitor, FlaskConical, Rocket } from "lucide-react";

export interface EnvironmentGroupData {
  label: string;
  nodeType: string;
  category: string;
  isCustomEnvironment?: boolean;
  customEnvColor?: string;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onConfigure?: (id: string) => void;
}

const ENV_THEME: Record<string, { bg: string; border: string; headerBg: string; text: string; icon: typeof Server }> = {
  env_dev: { bg: "rgba(34, 197, 94, 0.04)", border: "#22c55e", headerBg: "#dcfce7", text: "#166534", icon: Monitor },
  env_qa: { bg: "rgba(59, 130, 246, 0.04)", border: "#3b82f6", headerBg: "#dbeafe", text: "#1e40af", icon: FlaskConical },
  env_staging: { bg: "rgba(234, 179, 8, 0.04)", border: "#eab308", headerBg: "#fef9c3", text: "#854d0e", icon: Server },
  env_uat: { bg: "rgba(168, 85, 247, 0.04)", border: "#a855f7", headerBg: "#f3e8ff", text: "#6b21a8", icon: FlaskConical },
  env_prod: { bg: "rgba(14, 165, 133, 0.04)", border: "#0d9488", headerBg: "#ccfbf1", text: "#115e59", icon: Rocket },
};

const DEFAULT_THEME = { bg: "rgba(99, 102, 241, 0.04)", border: "#6366f1", headerBg: "#e0e7ff", text: "#3730a3", icon: Server };

interface EnvironmentGroupNodeProps {
  id: string;
  data: EnvironmentGroupData;
  selected?: boolean;
}

function EnvironmentGroupNodeComponent({ id, data, selected }: EnvironmentGroupNodeProps) {
  const nodeType = data.nodeType as string;
  const theme = ENV_THEME[nodeType] || DEFAULT_THEME;
  const Icon = theme.icon;

  return (
    <>
      {/* Resizer — visible when the group is selected */}
      <NodeResizer
        color={theme.border}
        isVisible={selected}
        minWidth={240}
        minHeight={150}
        lineStyle={{ strokeWidth: 2 }}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: theme.border,
          border: "2px solid white",
        }}
      />

      <div
        className="w-full h-full rounded-xl overflow-hidden"
        style={{
          border: `2px ${selected ? "solid" : "dashed"} ${selected ? theme.border : theme.border + "80"}`,
          backgroundColor: theme.bg,
          minWidth: 240,
          minHeight: 150,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            backgroundColor: theme.headerBg,
            borderBottom: `1px solid ${theme.border}30`,
          }}
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{ backgroundColor: theme.border + "20" }}
          >
            <Icon className="w-3 h-3" style={{ color: theme.text }} />
          </div>
          <span
            className="text-[11px] font-bold tracking-wide uppercase"
            style={{ color: theme.text }}
          >
            {data.label}
          </span>
        </div>

        {/* Body area for child nodes */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-[100px]">
          <p
            className="text-[10px] opacity-30 text-center select-none pointer-events-none"
            style={{ color: theme.text }}
          >
            Drag workflow nodes here
          </p>
        </div>

        {/* Handles for group-to-group connections */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !rounded-full !border-2 !border-white"
          style={{ backgroundColor: theme.border }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !rounded-full !border-2 !border-white"
          style={{ backgroundColor: theme.border }}
        />
      </div>
    </>
  );
}

export const EnvironmentGroupNode = memo(EnvironmentGroupNodeComponent);
