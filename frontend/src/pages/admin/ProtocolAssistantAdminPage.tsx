import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  Brain,
  BookOpen,
  ToggleLeft,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
} from 'lucide-react';
import { protocolAssistantAdminApi } from '@/lib/protocolAssistantAdminApi';
import { AnalyticsCharts } from '@/components/admin/protocol-assistant/AnalyticsCharts';
import { PromptManagement } from '@/components/admin/protocol-assistant/PromptManagement';
import { KnowledgeBaseManager } from '@/components/admin/protocol-assistant/KnowledgeBaseManager';
import { FeatureFlagPanel } from '@/components/admin/protocol-assistant/FeatureFlagPanel';
import { QualityMonitor } from '@/components/admin/protocol-assistant/QualityMonitor';
import { FeedbackReview } from '@/components/admin/protocol-assistant/FeedbackReview';

export function ProtocolAssistantAdminPage() {
  const [activeTab, setActiveTab] = useState('analytics');

  // Fetch overview stats
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['pa-admin-usage'],
    queryFn: () => protocolAssistantAdminApi.getUsageAnalytics(),
  });

  const { data: qualityData, isLoading: qualityLoading } = useQuery({
    queryKey: ['pa-admin-quality'],
    queryFn: () => protocolAssistantAdminApi.getQualityStatus(),
  });

  const { data: costData, isLoading: costLoading } = useQuery({
    queryKey: ['pa-admin-costs'],
    queryFn: () => protocolAssistantAdminApi.getCostAnalytics(),
  });

  const { data: alertsData } = useQuery({
    queryKey: ['pa-admin-alerts'],
    queryFn: () => protocolAssistantAdminApi.getQualityAlerts(5),
  });

  const isLoading = usageLoading || qualityLoading || costLoading;

  const getQualityStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'degraded':
        return 'bg-orange-100 text-orange-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'improving') {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    } else if (trend === 'declining') {
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    }
    return <Activity className="h-4 w-4 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Protocol Assistant Admin</h1>
          <p className="text-muted-foreground">
            Manage AI features, monitor quality, and analyze usage
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sessions (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : usageData?.data?.summary?.total_sessions ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {usageData?.data?.summary?.unique_users ?? 0} unique users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quality Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {isLoading ? '...' : qualityData?.data?.metrics?.avg_rating?.toFixed(1) ?? 'N/A'}
              </span>
              <Badge className={getQualityStatusColor(qualityData?.data?.metrics?.status)}>
                {qualityData?.data?.metrics?.status ?? 'unknown'}
              </Badge>
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {getTrendIcon(qualityData?.data?.metrics?.trend)}
              <span className="ml-1">{qualityData?.data?.metrics?.trend ?? 'stable'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monthly Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {isLoading ? '...' : `$${costData?.data?.costs?.total_cost?.toFixed(2) ?? '0.00'}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Projected: ${costData?.data?.costs?.projected_monthly?.toFixed(2) ?? '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {alertsData?.data?.alerts?.length ?? 0}
              </span>
              {(alertsData?.data?.alerts?.length ?? 0) > 0 && (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {alertsData?.data?.alerts?.length === 0
                ? 'All systems normal'
                : 'Requires attention'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="prompts" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Prompts</span>
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Knowledge</span>
          </TabsTrigger>
          <TabsTrigger value="flags" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Flags</span>
          </TabsTrigger>
          <TabsTrigger value="quality" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Quality</span>
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Feedback</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-6">
          <AnalyticsCharts />
        </TabsContent>

        <TabsContent value="prompts" className="mt-6">
          <PromptManagement />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6">
          <KnowledgeBaseManager />
        </TabsContent>

        <TabsContent value="flags" className="mt-6">
          <FeatureFlagPanel />
        </TabsContent>

        <TabsContent value="quality" className="mt-6">
          <QualityMonitor />
        </TabsContent>

        <TabsContent value="feedback" className="mt-6">
          <FeedbackReview />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ProtocolAssistantAdminPage;
