import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Star, ThumbsDown, MessageSquare, TrendingDown, RefreshCw } from 'lucide-react';
import { protocolAssistantAdminApi } from '@/lib/protocolAssistantAdminApi';

const ratingColors = {
  1: 'bg-red-100 text-red-800',
  2: 'bg-orange-100 text-orange-800',
  3: 'bg-yellow-100 text-yellow-800',
  4: 'bg-green-100 text-green-800',
  5: 'bg-green-200 text-green-900',
};

export function FeedbackReview() {
  const [ratingThreshold, setRatingThreshold] = useState('2');
  const [days, setDays] = useState('30');

  // Fetch feedback summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['pa-feedback-summary', days],
    queryFn: () => protocolAssistantAdminApi.getFeedbackSummary(parseInt(days)),
  });

  // Fetch low-rated outputs
  const {
    data: lowRatedData,
    isLoading: lowRatedLoading,
    refetch: refetchLowRated,
  } = useQuery({
    queryKey: ['pa-low-rated', ratingThreshold, days],
    queryFn: () =>
      protocolAssistantAdminApi.getLowRatedOutputs(parseInt(ratingThreshold), parseInt(days), 50),
  });

  // Fetch common issues
  const { data: issuesData, isLoading: issuesLoading } = useQuery({
    queryKey: ['pa-common-issues', days],
    queryFn: () => protocolAssistantAdminApi.getCommonIssues(parseInt(days)),
  });

  const summary = summaryData?.data ?? {};
  const lowRated = lowRatedData?.data?.feedbacks ?? [];
  const issues = issuesData?.data?.issues ?? [];

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Time Period</label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">Rating Threshold</label>
            <Select value={ratingThreshold} onValueChange={setRatingThreshold}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 star only</SelectItem>
                <SelectItem value="2">2 stars or below</SelectItem>
                <SelectItem value="3">3 stars or below</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchLowRated()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryLoading ? '...' : summary.total_count ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Average Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {summaryLoading ? '...' : summary.avg_rating?.toFixed(1) ?? 'N/A'}
              </span>
              {summary.avg_rating && renderStars(Math.round(summary.avg_rating))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Low Ratings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ThumbsDown className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{lowRated.length}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Rating {ratingThreshold} or below
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Issue Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issues.length}</div>
            <p className="text-sm text-muted-foreground">Recurring patterns</p>
          </CardContent>
        </Card>
      </div>

      {/* Rating Distribution */}
      {summary.distribution && (
        <Card>
          <CardHeader>
            <CardTitle>Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = summary.distribution?.[rating] ?? 0;
                const total = summary.total_count ?? 1;
                const percentage = total > 0 ? (count / total) * 100 : 0;

                return (
                  <div key={rating} className="flex items-center gap-3">
                    <div className="w-12 text-sm text-muted-foreground">{rating} star</div>
                    <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          rating >= 4 ? 'bg-green-500' : rating === 3 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="w-16 text-sm text-right">
                      {count} ({percentage.toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Common Issues */}
      <Card>
        <CardHeader>
          <CardTitle>Common Issues</CardTitle>
          <CardDescription>Recurring problems identified from feedback</CardDescription>
        </CardHeader>
        <CardContent>
          {issuesLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading issues...</div>
          ) : issues.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No recurring issues found
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      <span className="font-medium capitalize">
                        {issue.category?.replace(/_/g, ' ') ?? 'Unknown'}
                      </span>
                    </div>
                    <Badge variant="secondary">{issue.count} occurrences</Badge>
                  </div>
                  {issue.examples && issue.examples.length > 0 && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      <p className="font-medium mb-1">Examples:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {issue.examples.slice(0, 3).map((example, i) => (
                          <li key={i} className="line-clamp-1">
                            {example}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Low-Rated Outputs */}
      <Card>
        <CardHeader>
          <CardTitle>Low-Rated Outputs</CardTitle>
          <CardDescription>Review outputs with ratings of {ratingThreshold} or below</CardDescription>
        </CardHeader>
        <CardContent>
          {lowRatedLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading feedback...</div>
          ) : lowRated.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-green-600" />
              No low-rated outputs found
            </div>
          ) : (
            <div className="space-y-4">
              {lowRated.map((feedback) => (
                <div key={feedback.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {renderStars(feedback.rating)}
                        <Badge
                          className={ratingColors[feedback.rating as keyof typeof ratingColors]}
                        >
                          {feedback.rating}/5
                        </Badge>
                        {feedback.feedback_type && (
                          <Badge variant="outline">{feedback.feedback_type}</Badge>
                        )}
                        {feedback.issue_category && (
                          <Badge variant="secondary" className="capitalize">
                            {feedback.issue_category.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                      {feedback.comment && (
                        <p className="text-sm mt-2 text-muted-foreground">{feedback.comment}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(feedback.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default FeedbackReview;
