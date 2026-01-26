import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { protocolAssistantAdminApi } from '@/lib/protocolAssistantAdminApi';

export function AnalyticsCharts() {
  const [dateRange, setDateRange] = useState('30');

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['pa-trends', startDate, endDate],
    queryFn: () => protocolAssistantAdminApi.getDailyTrends(startDate, endDate),
  });

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['pa-usage', startDate, endDate],
    queryFn: () => protocolAssistantAdminApi.getUsageAnalytics(startDate, endDate),
  });

  const { data: costData, isLoading: costLoading } = useQuery({
    queryKey: ['pa-costs', startDate, endDate],
    queryFn: () => protocolAssistantAdminApi.getCostAnalytics(startDate, endDate),
  });

  const isLoading = trendsLoading || usageLoading || costLoading;
  const trends = trendsData?.data?.trends ?? [];

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex justify-end">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Usage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {isLoading ? '...' : usageData?.data?.summary?.total_sessions ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">
              Avg duration: {usageData?.data?.summary?.avg_session_duration_minutes?.toFixed(1) ?? 0} min
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {isLoading ? '...' : usageData?.data?.summary?.total_messages ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">
              Avg per session:{' '}
              {usageData?.data?.summary?.total_sessions
                ? (usageData.data.summary.total_messages / usageData.data.summary.total_sessions).toFixed(1)
                : 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Documents Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {isLoading ? '...' : usageData?.data?.summary?.total_generations ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">
              Unique users: {usageData?.data?.summary?.unique_users ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trends Chart (Simple table view - could be replaced with Recharts) */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Trends</CardTitle>
          <CardDescription>Usage and quality metrics over time</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">Loading...</div>
          ) : trends.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              No data available for this period
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-right py-2 px-2">Sessions</th>
                    <th className="text-right py-2 px-2">Messages</th>
                    <th className="text-right py-2 px-2">Generations</th>
                    <th className="text-right py-2 px-2">Avg Rating</th>
                    <th className="text-right py-2 px-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.slice(-10).map((day) => (
                    <tr key={day.date} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-2">{day.date}</td>
                      <td className="text-right py-2 px-2">{day.sessions}</td>
                      <td className="text-right py-2 px-2">{day.messages}</td>
                      <td className="text-right py-2 px-2">{day.generations}</td>
                      <td className="text-right py-2 px-2">{day.avg_rating?.toFixed(1) ?? '-'}</td>
                      <td className="text-right py-2 px-2">${day.cost?.toFixed(2) ?? '0.00'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cost by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-32 flex items-center justify-center">Loading...</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(costData?.data?.costs?.by_provider ?? {}).map(([provider, cost]) => (
                  <div key={provider} className="flex justify-between items-center">
                    <span className="capitalize">{provider}</span>
                    <span className="font-mono">${(cost as number).toFixed(2)}</span>
                  </div>
                ))}
                {Object.keys(costData?.data?.costs?.by_provider ?? {}).length === 0 && (
                  <p className="text-muted-foreground">No cost data available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost by Task Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-32 flex items-center justify-center">Loading...</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(costData?.data?.costs?.by_task ?? {}).map(([task, cost]) => (
                  <div key={task} className="flex justify-between items-center">
                    <span className="capitalize">{task.replace(/_/g, ' ')}</span>
                    <span className="font-mono">${(cost as number).toFixed(2)}</span>
                  </div>
                ))}
                {Object.keys(costData?.data?.costs?.by_task ?? {}).length === 0 && (
                  <p className="text-muted-foreground">No cost data available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsCharts;
