import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LineConfig {
  dataKey: string;
  name?: string;
  color?: string;
  strokeWidth?: number;
  dot?: boolean;
}

interface LineChartProps {
  data: Array<Record<string, string | number>>;
  xKey?: string;
  yKey?: string;
  title?: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  lines?: LineConfig[];
}

const DEFAULT_COLORS = [
  'hsl(221, 83%, 53%)', // Blue
  'hsl(142, 76%, 36%)', // Green
  'hsl(45, 93%, 47%)',  // Yellow
  'hsl(0, 72%, 51%)',   // Red
  'hsl(262, 83%, 58%)', // Purple
];

export function LineChart({
  data,
  xKey = 'date',
  yKey = 'value',
  title,
  color = DEFAULT_COLORS[0],
  height = 300,
  showGrid = true,
  showLegend = false,
  lines,
}: LineChartProps) {
  // If no lines config provided, use single line with yKey
  const lineConfigs: LineConfig[] = lines || [{ dataKey: yKey, color }];

  const chartContent = (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
        <XAxis
          dataKey={xKey}
          className="text-xs"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => {
            // Format date strings to be more readable
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}$/)) {
              const [year, month] = value.split('-');
              const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              return monthNames[parseInt(month, 10) - 1];
            }
            return value;
          }}
        />
        <YAxis className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          labelFormatter={(value) => {
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
              return new Date(value).toLocaleDateString();
            }
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}$/)) {
              const [year, month] = value.split('-');
              const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
              return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
            }
            return value;
          }}
        />
        {showLegend && (
          <Legend
            iconType="line"
            iconSize={14}
            formatter={(value) => (
              <span className="text-sm text-muted-foreground">{value}</span>
            )}
          />
        )}
        {lineConfigs.map((lineConfig, index) => (
          <Line
            key={lineConfig.dataKey}
            type="monotone"
            dataKey={lineConfig.dataKey}
            name={lineConfig.name || lineConfig.dataKey}
            stroke={lineConfig.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
            strokeWidth={lineConfig.strokeWidth || 2}
            dot={lineConfig.dot !== undefined ? lineConfig.dot : true}
            activeDot={{ r: 6 }}
          />
        ))}
      </RechartsLineChart>
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

export default LineChart;
