import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { name: "Mon", builds: 12, success: 10, failed: 2 },
  { name: "Tue", builds: 19, success: 17, failed: 2 },
  { name: "Wed", builds: 15, success: 14, failed: 1 },
  { name: "Thu", builds: 25, success: 22, failed: 3 },
  { name: "Fri", builds: 22, success: 20, failed: 2 },
  { name: "Sat", builds: 8, success: 8, failed: 0 },
  { name: "Sun", builds: 5, success: 5, failed: 0 },
];

export function ActivityChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card p-5"
    >
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Build Activity</h3>
        <p className="text-sm text-muted-foreground">Weekly pipeline execution overview</p>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="buildsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(213, 97%, 47%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(213, 97%, 47%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(220, 13%, 91%)"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid hsl(220, 13%, 91%)",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
              labelStyle={{ color: "hsl(222, 47%, 11%)", fontWeight: 600 }}
              itemStyle={{ color: "hsl(215, 16%, 47%)" }}
            />
            <Area
              type="monotone"
              dataKey="builds"
              stroke="hsl(213, 97%, 47%)"
              strokeWidth={2}
              fill="url(#buildsGradient)"
              name="Total Builds"
            />
            <Area
              type="monotone"
              dataKey="success"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              fill="url(#successGradient)"
              name="Successful"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm text-muted-foreground">Total Builds</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-success" />
          <span className="text-sm text-muted-foreground">Successful</span>
        </div>
      </div>
    </motion.div>
  );
}
