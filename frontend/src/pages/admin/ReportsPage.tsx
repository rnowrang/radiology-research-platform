import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  Users,
  FileText,
  FolderKanban,
  CheckSquare,
  Clock,
  TrendingUp,
  Award,
  Building2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { BarChart, PieChart, LineChart } from '@/components/charts';
import { reportsApi } from '@/lib/api';

// Metric Card Component
interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
}

function MetricCard({ title, value, subtitle, icon, trend }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend && (
          <p className={`text-xs mt-1 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.positive ? '+' : ''}{trend.value}% from last month
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Loading skeleton for charts
function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="animate-pulse bg-muted rounded-lg"
      style={{ height: `${height}px` }}
    />
  );
}

export function ReportsPage() {
  const [dateRange, setDateRange] = useState('30');

  // Calculate date range
  const endDate = new Date();
  const startDate = subDays(endDate, parseInt(dateRange, 10));

  // Fetch overview metrics
  const { data: overview, isLoading: isLoadingOverview } = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: async () => {
      const response = await reportsApi.getOverview();
      return response.data.data;
    },
  });

  // Fetch projects by type
  const { data: projectsByType, isLoading: isLoadingProjectsByType } = useQuery({
    queryKey: ['reports', 'projects-by-type'],
    queryFn: async () => {
      const response = await reportsApi.getProjectsByType();
      return response.data.data;
    },
  });

  // Fetch projects by status
  const { data: projectsByStatus, isLoading: isLoadingProjectsByStatus } = useQuery({
    queryKey: ['reports', 'projects-by-status'],
    queryFn: async () => {
      const response = await reportsApi.getProjectsByStatus();
      return response.data.data;
    },
  });

  // Fetch forms by status
  const { data: formsByStatus, isLoading: isLoadingFormsByStatus } = useQuery({
    queryKey: ['reports', 'forms-by-status'],
    queryFn: async () => {
      const response = await reportsApi.getFormsByStatus();
      return response.data.data;
    },
  });

  // Fetch forms by template
  const { data: formsByTemplate, isLoading: isLoadingFormsByTemplate } = useQuery({
    queryKey: ['reports', 'forms-by-template'],
    queryFn: async () => {
      const response = await reportsApi.getFormsByTemplate();
      return response.data.data;
    },
  });

  // Fetch activity trends
  const { data: activityTrends, isLoading: isLoadingActivityTrends } = useQuery({
    queryKey: ['reports', 'activity-trends', dateRange],
    queryFn: async () => {
      const response = await reportsApi.getActivityTrends(
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd'),
        parseInt(dateRange, 10) > 60 ? 'week' : 'day'
      );
      return response.data.data;
    },
  });

  // Fetch top researchers
  const { data: topResearchers, isLoading: isLoadingTopResearchers } = useQuery({
    queryKey: ['reports', 'top-researchers'],
    queryFn: async () => {
      const response = await reportsApi.getTopResearchers(10);
      return response.data.data;
    },
  });

  // Fetch department stats
  const { data: departmentStats, isLoading: isLoadingDepartmentStats } = useQuery({
    queryKey: ['reports', 'department-stats'],
    queryFn: async () => {
      const response = await reportsApi.getDepartmentStats();
      return response.data.data;
    },
  });

  // Fetch review metrics
  const { data: reviewMetrics, isLoading: isLoadingReviewMetrics } = useQuery({
    queryKey: ['reports', 'review-metrics'],
    queryFn: async () => {
      const response = await reportsApi.getReviewMetrics();
      return response.data.data;
    },
  });

  // Fetch monthly submissions
  const { data: monthlySubmissions, isLoading: isLoadingMonthlySubmissions } = useQuery({
    queryKey: ['reports', 'monthly-submissions'],
    queryFn: async () => {
      const response = await reportsApi.getMonthlySubmissions(12);
      return response.data.data;
    },
  });

  // Fetch users by role
  const { data: usersByRole, isLoading: isLoadingUsersByRole } = useQuery({
    queryKey: ['reports', 'users-by-role'],
    queryFn: async () => {
      const response = await reportsApi.getUsersByRole();
      return response.data.data;
    },
  });

  const metrics = overview?.metrics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive insights into platform activity and usage
          </p>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Users"
          value={isLoadingOverview ? '-' : (metrics?.totalUsers || 0)}
          subtitle={isLoadingOverview ? undefined : `${metrics?.activeUsers || 0} active`}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Total Projects"
          value={isLoadingOverview ? '-' : (metrics?.totalProjects || 0)}
          subtitle={isLoadingOverview ? undefined : `${metrics?.activeProjects || 0} active`}
          icon={<FolderKanban className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Total Forms"
          value={isLoadingOverview ? '-' : (metrics?.totalForms || 0)}
          subtitle={isLoadingOverview ? undefined : `${metrics?.formsInReview || 0} in review`}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Total Tasks"
          value={isLoadingOverview ? '-' : (metrics?.totalTasks || 0)}
          subtitle={isLoadingOverview ? undefined : `${metrics?.pendingTasks || 0} pending`}
          icon={<CheckSquare className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Tabs for different report sections */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="forms">Forms</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Users by Role */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Users by Role</CardTitle>
                <CardDescription>Distribution of users across roles</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsersByRole ? (
                  <ChartSkeleton height={250} />
                ) : (
                  <PieChart
                    data={usersByRole || []}
                    height={250}
                    innerRadius={50}
                    outerRadius={80}
                  />
                )}
              </CardContent>
            </Card>

            {/* Projects by Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Projects by Status</CardTitle>
                <CardDescription>Current status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProjectsByStatus ? (
                  <ChartSkeleton height={250} />
                ) : (
                  <BarChart
                    data={projectsByStatus || []}
                    height={250}
                    color="hsl(221, 83%, 53%)"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Review Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Review Performance</CardTitle>
              <CardDescription>Key metrics for the review process</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingReviewMetrics ? (
                <div className="grid gap-4 md:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse bg-muted h-20 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total Reviews</p>
                    <p className="text-2xl font-bold">{reviewMetrics?.totalReviews || 0}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Avg. Review Time</p>
                    <p className="text-2xl font-bold">
                      {reviewMetrics?.avgReviewTimeHours
                        ? `${reviewMetrics.avgReviewTimeHours}h`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Approval Rate</p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold text-green-600">
                        {reviewMetrics?.approvalRate || 0}%
                      </p>
                      <Progress value={reviewMetrics?.approvalRate || 0} className="w-20" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Revision Rate</p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold text-yellow-600">
                        {reviewMetrics?.revisionRate || 0}%
                      </p>
                      <Progress value={reviewMetrics?.revisionRate || 0} className="w-20" />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Projects by Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Projects by Type</CardTitle>
                <CardDescription>Distribution across project types</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProjectsByType ? (
                  <ChartSkeleton height={300} />
                ) : (
                  <PieChart
                    data={projectsByType || []}
                    height={300}
                    innerRadius={60}
                    outerRadius={100}
                  />
                )}
              </CardContent>
            </Card>

            {/* Projects by Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Projects by Status</CardTitle>
                <CardDescription>Current status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProjectsByStatus ? (
                  <ChartSkeleton height={300} />
                ) : (
                  <BarChart
                    data={projectsByStatus || []}
                    height={300}
                    color="hsl(221, 83%, 53%)"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Department Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Building2 className="h-4 w-4" />
                Department Statistics
              </CardTitle>
              <CardDescription>Projects and forms by department</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingDepartmentStats ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-10 bg-muted rounded" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Projects</TableHead>
                      <TableHead className="text-right">Forms</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departmentStats?.map((dept: { department: string; projectsCount: number; formsCount: number }) => (
                      <TableRow key={dept.department}>
                        <TableCell className="font-medium">{dept.department}</TableCell>
                        <TableCell className="text-right">{dept.projectsCount}</TableCell>
                        <TableCell className="text-right">{dept.formsCount}</TableCell>
                      </TableRow>
                    ))}
                    {(!departmentStats || departmentStats.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forms Tab */}
        <TabsContent value="forms" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Forms by Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Forms by Status</CardTitle>
                <CardDescription>Current status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingFormsByStatus ? (
                  <ChartSkeleton height={300} />
                ) : (
                  <BarChart
                    data={formsByStatus || []}
                    height={300}
                    color="hsl(142, 76%, 36%)"
                  />
                )}
              </CardContent>
            </Card>

            {/* Forms by Template */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Forms by Template</CardTitle>
                <CardDescription>Most used templates</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingFormsByTemplate ? (
                  <ChartSkeleton height={300} />
                ) : (
                  <BarChart
                    data={formsByTemplate || []}
                    height={300}
                    horizontal
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Monthly Submissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <TrendingUp className="h-4 w-4" />
                Monthly Submissions
              </CardTitle>
              <CardDescription>Form submissions over the past 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMonthlySubmissions ? (
                <ChartSkeleton height={300} />
              ) : (
                <LineChart
                  data={monthlySubmissions || []}
                  xKey="month"
                  height={300}
                  showLegend
                  lines={[
                    { dataKey: 'submitted', name: 'Submitted', color: 'hsl(221, 83%, 53%)' },
                    { dataKey: 'approved', name: 'Approved', color: 'hsl(142, 76%, 36%)' },
                    { dataKey: 'rejected', name: 'Rejected', color: 'hsl(0, 72%, 51%)' },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          {/* Date Range Selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Time period:</span>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Activity Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Clock className="h-4 w-4" />
                Activity Trends
              </CardTitle>
              <CardDescription>Platform activity over time</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingActivityTrends ? (
                <ChartSkeleton height={350} />
              ) : (
                <LineChart
                  data={activityTrends || []}
                  xKey="date"
                  height={350}
                  showLegend
                  lines={[
                    { dataKey: 'forms', name: 'Forms Created', color: 'hsl(221, 83%, 53%)' },
                    { dataKey: 'reviews', name: 'Review Actions', color: 'hsl(142, 76%, 36%)' },
                    { dataKey: 'logins', name: 'User Logins', color: 'hsl(262, 83%, 58%)' },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          {/* Top Researchers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Award className="h-4 w-4" />
                Top Researchers
              </CardTitle>
              <CardDescription>Most active researchers by forms created</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTopResearchers ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-10 bg-muted rounded" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Researcher</TableHead>
                      <TableHead className="text-right">Forms Created</TableHead>
                      <TableHead className="text-right">Forms Approved</TableHead>
                      <TableHead className="text-right">Projects</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topResearchers?.map((researcher: {
                      userId: string;
                      fullName: string;
                      email: string;
                      formsCreated: number;
                      formsApproved: number;
                      projectsCount: number;
                    }) => (
                      <TableRow key={researcher.userId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{researcher.fullName}</p>
                            <p className="text-sm text-muted-foreground">{researcher.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{researcher.formsCreated}</TableCell>
                        <TableCell className="text-right">{researcher.formsApproved}</TableCell>
                        <TableCell className="text-right">{researcher.projectsCount}</TableCell>
                      </TableRow>
                    ))}
                    {(!topResearchers || topResearchers.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ReportsPage;
