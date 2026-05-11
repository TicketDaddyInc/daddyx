import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart
} from "recharts";

interface SimPoint {
  n: number;
  price: number;
  organizerCumulative: number;
  investorROI: number;
}

interface PriceChartProps {
  data: SimPoint[];
  currentRound?: number;
  title?: string;
  showROI?: boolean;
}

function formatSol(val: number): string {
  if (val < 0.001) return `${(val * 1000).toFixed(2)}m◎`;
  return `${val.toFixed(4)} ◎`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1A1A1A] border border-white/12 rounded-lg p-3 text-xs shadow-lg">
      <div className="text-white/60 mb-2">Purchase #{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-white font-medium">
            {p.dataKey === "price"
              ? formatSol(p.value)
              : p.dataKey === "investorROI"
              ? `+${p.value.toFixed(1)}%`
              : formatSol(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function PriceChart({ data, currentRound, title, showROI = false }: PriceChartProps) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      {title && (
        <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      )}

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {showROI ? (
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="n"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                label={{ value: "Purchase #", position: "insideBottom", fill: "rgba(255,255,255,0.3)", fontSize: 10, dy: 6 }}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `+${v.toFixed(0)}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              {currentRound !== undefined && (
                <ReferenceLine x={currentRound} stroke="#E63946" strokeDasharray="4 4" label={{ value: "Now", fill: "#E63946", fontSize: 10 }} />
              )}
              <Line
                type="monotone"
                dataKey="investorROI"
                name="Investor ROI"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#22c55e" }}
              />
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E63946" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#E63946" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="orgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="n"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v.toFixed(2)}◎`}
              />
              <Tooltip content={<CustomTooltip />} />
              {currentRound !== undefined && (
                <ReferenceLine x={currentRound} stroke="#E63946" strokeDasharray="4 4" />
              )}
              <Area
                type="monotone"
                dataKey="price"
                name="Token Price"
                stroke="#E63946"
                strokeWidth={2}
                fill="url(#priceGradient)"
                dot={false}
                activeDot={{ r: 4, fill: "#E63946" }}
              />
              <Area
                type="monotone"
                dataKey="organizerCumulative"
                name="Organizer Revenue"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#orgGradient)"
                dot={false}
                activeDot={{ r: 4, fill: "#22c55e" }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-4 mt-3 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[#E63946] rounded" />
          <span className="text-[10px] text-white/40">{showROI ? "Investor ROI" : "Token Price"}</span>
        </div>
        {!showROI && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-green-500 rounded" />
            <span className="text-[10px] text-white/40">Organizer Revenue</span>
          </div>
        )}
      </div>
    </div>
  );
}
