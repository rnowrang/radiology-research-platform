import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { reviewApi } from '@/lib/api';
import type { ReviewQueueItem } from '@/types';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  in_review: { label: 'In Review', variant: 'default', icon: Clock },
  needs_changes: { label: 'Needs Changes', variant: 'destructive', icon: AlertCircle },
};

export function ReviewQueuePage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['reviewQueue', statusFilter],
    queryFn: async () => {
      const response = await reviewApi.getQueue(statusFilter === 'all' ? undefined : statusFilter);
      return response.data.data as ReviewQueueItem[];
    },
  });

  const queue = queueData || [];

  const inReviewCount = queue.filter(f => f.status === 'in_review').length;
  const needsChangesCount = queue.filter(f => f.status === 'needs_changes').length;

  const filteredQueue = statusFilter === 'all'
    ? queue
    : queue.filter(f => f.status === statusFilter);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground">
          Review and approve submitted forms
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inReviewCount}</div>
            <p className="text-xs text-muted-foreground">Forms awaiting review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Changes</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{needsChangesCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting resubmission</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total in Queue</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queue.length}</div>
            <p className="text-xs text-muted-foreground">Forms requiring attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="needs_changes">Needs Changes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Queue List */}
      <Card>
        <CardHeader>
          <CardTitle>Forms in Queue</CardTitle>
          <CardDescription>
            Click on a form to review it
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-medium">All caught up!</h3>
              <p className="text-muted-foreground mt-1">
                No forms are currently pending review
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredQueue.map((item) => {
                const config = statusConfig[item.status] || statusConfig.in_review;
                const StatusIcon = config.icon;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => navigate(`/forms/${item.id}/view`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${
                        item.status === 'needs_changes' ? 'bg-destructive/10' : 'bg-primary/10'
                      }`}>
                        <StatusIcon className={`h-5 w-5 ${
                          item.status === 'needs_changes' ? 'text-destructive' : 'text-primary'
                        }`} />
                      </div>
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.template_name} v{item.template_version}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {item.unresolved_comments > 0 && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                          {item.unresolved_comments}
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        Submitted {formatDate(item.submitted_at)}
                      </div>
                      <Badge variant={config.variant}>{config.label}</Badge>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
