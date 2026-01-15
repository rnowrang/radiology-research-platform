import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BarChartProps {
  data: Array<{ name: string; value: number; [key: string]: string | number }>;
  xKey?: string;
  yKey?: string;
  title?: string;
  color?: string;
  colors?: string[];
  height?: number;
  showGrid?: boolean;
  horizontal?: boolean;
}

const DEFAULT_COLORS = [
  'hsl(221, 83%, 53%)', // Blue
  'hsl(142, 76%, 36%)', // Green
  'hsl(45, 93%, 47%)',  // Yellow
  'hsl(0, 72%, 51%)',   // Red
  'hsl(262, 83%, 58%)', // Purple
  'hsl(199, 89%, 48%)', // Cyan
  'hsl(24, 95%, 53%)',  // Orange
  'hsl(340, 82%, 52%)', // Pink
];

export function BarChart({
  data,
  xKey = 'name',
  yKey = 'value',
  title,
  color,
  colors = DEFAULT_COLORS,
  height = 300,
  showGrid = true,
  horizontal = false,
}: BarChartProps) {
  const chartContent = (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{
          top: 5,
          right: 30,
          left: horizontal ? 80 : 20,
          bottom: 5,
        }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
        {horizontal ? (
          <>
            <XAxis type="number" className="text-xs" />
            <YAxis
              type="category"
              dataKey={xKey}
              className="text-xs"
              width={70}
              tick={{ fontSize: 12 }}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              className="text-xs"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis className="text-xs" />
          </>
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
        />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={color || colors[index % colors.length]}
            />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );

  if (title) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>{chartContent}</CardContent>
      </Card>
    );
  }

  return chartContent;
}

export default BarChart;
