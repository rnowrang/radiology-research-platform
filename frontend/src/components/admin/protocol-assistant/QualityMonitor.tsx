import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  RefreshCw,
  Undo2,
  XCircle,
} from 'lucide-react';
import { protocolAssistantAdminApi, QualityStatus } from '@/lib/protocolAssistantAdminApi';
import { toast } from 'sonner';

const statusConfig = {
  healthy: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Healthy' },
  warning: { color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle, label: 'Warning' },
  degraded: { color: 'bg-orange-100 text-orange-800', icon: ArrowDown, label: 'Degraded' },
  critical: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Critical' },
};

export function QualityMonitor() {
  const queryClient = useQueryClient();
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [promptToRollback, setPromptToRollback] = useState<string | null>(null);

  // Fetch prompt keys for selection
  const { data: keysData } = useQuery({
    queryKey: ['pa-prompt-keys'],
    queryFn: () => protocolAssistantAdminApi.getPromptKeys(),
  });

  // Fetch quality status
  const { data: qualityData, isLoading: qualityLoading, refetch } = useQuery({
    queryKey: ['pa-quality-status', selectedPrompt],
    queryFn: () => protocolAssistantAdminApi.getQualityStatus(selectedPrompt || undefined),
  });

  // Fetch quality trends
  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['pa-quality-trends', selectedPrompt],
    queryFn: () => protocolAssistantAdminApi.getQualityTrends(selectedPrompt || undefined),
  });

  // Fetch alerts
  const { data: alertsData } = useQuery({
    queryKey: ['pa-quality-alerts'],
    queryFn: () => protocolAssistantAdminApi.getQualityAlerts(10),
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: (promptKey: string) =>
      protocolAssistantAdminApi.manualRollback(promptKey, 'Manual rollback from admin UI'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pa-quality'] });
      queryClient.invalidateQueries({ queryKey: ['pa-prompt-versions'] });
      setRollbackDialogOpen(false);
      setPromptToRollback(null);
      toast.success('Prompt rolled back successfully');
    },
    onError: () => {
      toast.error('Failed to rollback prompt');
    },
  });

  // Auto-check mutation
  const autoCheckMutation = useMutation({
    mutationFn: (promptKey: string) => protocolAssistantAdminApi.checkAndRollback(promptKey),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pa-quality'] });
      if (data.data?.status === 'rollback_triggered') {
        toast.warning('Auto-rollback was triggered due to quality degradation');
      } else {
        toast.success('Quality check passed - no action needed');
      }
    },
    onError: () => {
      toast.error('Failed to run quality check');
    },
  });

  const promptKeys = keysData?.data?.prompt_keys ?? [];
  const quality = qualityData?.data?.metrics;
  const trends = trendsData?.data?.trends ?? [];
  const alerts = alertsData?.data?.alerts ?? [];

  const handleRollback = (promptKey: string) => {
    setPromptToRollback(promptKey);
    setRollbackDialogOpen(true);
  };

  const StatusIcon = quality?.status
    ? statusConfig[quality.status]?.icon || Activity
    : Activity;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={selectedPrompt} onValueChange={setSelectedPrompt}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All prompts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All prompts</SelectItem>
              {promptKeys.map((key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {selectedPrompt && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => autoCheckMutation.mutate(selectedPrompt)}
                disabled={autoCheckMutation.isPending}
              >
                <Activity className="h-4 w-4 mr-2" />
                Check Quality
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRollback(selectedPrompt)}
              >
                <Undo2 className="h-4 w-4 mr-2" />
                Rollback
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Quality Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quality Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusIcon
                className={`h-6 w-6 ${
                  quality?.status === 'healthy'
                    ? 'text-green-600'
                    : quality?.status === 'critical'
                    ? 'text-red-600'
                    : 'text-yellow-600'
                }`}
              />
              <Badge className={statusConfig[quality?.status ?? 'healthy']?.color}>
                {statusConfig[quality?.status ?? 'healthy']?.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {quality?.deviation_percentage > 0
                ? `${quality.deviation_percentage}% below baseline`
                : 'At or above baseline'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Average Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {qualityLoading ? '...' : quality?.avg_rating?.toFixed(1) ?? 'N/A'}
            </div>
            <p className="text-sm text-muted-foreground">
              Baseline: {quality?.baseline_rating?.toFixed(1) ?? 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {qualityLoading ? '...' : `${quality?.success_rate ?? 0}%`}
            </div>
            <p className="text-sm text-muted-foreground">
              {quality?.rating_count ?? 0} total ratings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {quality?.trend === 'improving' ? (
                <ArrowUp className="h-6 w-6 text-green-600" />
              ) : quality?.trend === 'declining' ? (
                <ArrowDown className="h-6 w-6 text-red-600" />
              ) : (
                <Activity className="h-6 w-6 text-gray-400" />
              )}
              <span className="text-lg capitalize">{quality?.trend ?? 'stable'}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {quality?.low_rating_count ?? 0} low ratings (24h)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trends Table */}
      <Card>
        <CardHeader>
          <CardTitle>Quality Trends (7 days)</CardTitle>
          <CardDescription>Daily quality metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {trendsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading trends...</div>
          ) : trends.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No trend data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-right py-2 px-2">Avg Rating</th>
                    <th className="text-right py-2 px-2">Feedback Count</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((day) => (
                    <tr key={day.date} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-2">{day.date}</td>
                      <td className="text-right py-2 px-2">
                        <span
                          className={
                            day.avg_rating >= 4
                              ? 'text-green-600'
                              : day.avg_rating >= 3
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }
                        >
                          {day.avg_rating.toFixed(1)}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">{day.feedback_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
          <CardDescription>Quality and cost alerts</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
              No active alerts
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    alert.severity === 'critical' || alert.severity === 'error'
                      ? 'border-red-200 bg-red-50'
                      : alert.severity === 'warning'
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 ${
                            alert.severity === 'critical' || alert.severity === 'error'
                              ? 'text-red-600'
                              : 'text-yellow-600'
                          }`}
                        />
                        <span className="font-medium">{alert.type}</span>
                        {alert.prompt_key && (
                          <Badge variant="outline">{alert.prompt_key}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rollback Confirmation */}
      <AlertDialog open={rollbackDialogOpen} onOpenChange={setRollbackDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback Prompt Version</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to rollback "{promptToRollback}" to the previous version? This
              will deactivate the current version and activate the previous one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => promptToRollback && rollbackMutation.mutate(promptToRollback)}
              disabled={rollbackMutation.isPending}
            >
              {rollbackMutation.isPending ? 'Rolling back...' : 'Confirm Rollback'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default QualityMonitor;
