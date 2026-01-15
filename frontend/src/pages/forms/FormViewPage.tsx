import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Clock,
  AlertCircle,
  CheckCircle,
  Lock,
  Edit,
  Download,
  MessageSquare,
  History,
  ChevronLeft,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { formsApi, reviewApi } from '@/lib/api';
import { ActivityFeed } from '@/components/activity';
import type { FormInstance, CommentThread, ReviewAction } from '@/types';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; color: string }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: FileText, color: 'text-muted-foreground' },
  in_review: { label: 'In Review', variant: 'default', icon: Clock, color: 'text-blue-500' },
  needs_changes: { label: 'Needs Changes', variant: 'destructive', icon: AlertCircle, color: 'text-destructive' },
  approved: { label: 'Approved', variant: 'outline', icon: CheckCircle, color: 'text-green-500' },
  locked: { label: 'Locked', variant: 'outline', icon: Lock, color: 'text-muted-foreground' },
};

export function FormViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const formId = parseInt(id!, 10);

  const [activeTab, setActiveTab] = useState('details');
  const [actionDialog, setActionDialog] = useState<'approve' | 'reject' | 'request_changes' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [newComment, setNewComment] = useState('');
  const [commentFieldId, setCommentFieldId] = useState('');

  const isReviewer = user?.role === 'admin' || user?.role === 'reviewer';

  // Fetch form data
  const { data: formData, isLoading: formLoading } = useQuery({
    queryKey: ['form', formId],
    queryFn: async () => {
      const response = await formsApi.get(formId);
      return response.data.data;
    },
  });

  // Fetch comments
  const { data: commentsData } = useQuery({
    queryKey: ['formComments', formId],
    queryFn: async () => {
      const response = await formsApi.getComments(formId, true);
      return response.data.data as CommentThread[];
    },
  });

  // Fetch review history
  const { data: historyData } = useQuery({
    queryKey: ['reviewHistory', formId],
    queryFn: async () => {
      const response = await formsApi.getReviewHistory(formId);
      return response.data.data as ReviewAction[];
    },
  });

  // Fetch versions
  const { data: versionsData } = useQuery({
    queryKey: ['formVersions', formId],
    queryFn: async () => {
      const response = await formsApi.getVersions(formId);
      return response.data.data;
    },
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (notes?: string) => formsApi.approve(formId, notes),
    onSuccess: () => {
      toast({ title: 'Form approved successfully' });
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
      queryClient.invalidateQueries({ queryKey: ['reviewHistory', formId] });
      setActionDialog(null);
      setActionNotes('');
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to approve form' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (notes: string) => formsApi.reject(formId, notes),
    onSuccess: () => {
      toast({ title: 'Form rejected' });
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
      queryClient.invalidateQueries({ queryKey: ['reviewHistory', formId] });
      setActionDialog(null);
      setActionNotes('');
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to reject form' });
    },
  });

  const requestChangesMutation = useMutation({
    mutationFn: (notes: string) => formsApi.requestChanges(formId, notes),
    onSuccess: () => {
      toast({ title: 'Changes requested' });
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
      queryClient.invalidateQueries({ queryKey: ['reviewHistory', formId] });
      setActionDialog(null);
      setActionNotes('');
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to request changes' });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { content: string; field_id?: string }) =>
      formsApi.addComment(formId, data),
    onSuccess: () => {
      toast({ title: 'Comment added' });
      queryClient.invalidateQueries({ queryKey: ['formComments', formId] });
      setNewComment('');
      setCommentFieldId('');
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to add comment' });
    },
  });

  const resolveThreadMutation = useMutation({
    mutationFn: (threadId: number) => reviewApi.resolveThread(threadId),
    onSuccess: () => {
      toast({ title: 'Thread resolved' });
      queryClient.invalidateQueries({ queryKey: ['formComments', formId] });
    },
  });

  const handleAction = () => {
    if (actionDialog === 'approve') {
      approveMutation.mutate(actionNotes || undefined);
    } else if (actionDialog === 'reject') {
      if (!actionNotes.trim()) {
        toast({ variant: 'destructive', title: 'Please provide a reason for rejection' });
        return;
      }
      rejectMutation.mutate(actionNotes);
    } else if (actionDialog === 'request_changes') {
      if (!actionNotes.trim()) {
        toast({ variant: 'destructive', title: 'Please specify what changes are needed' });
        return;
      }
      requestChangesMutation.mutate(actionNotes);
    }
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addCommentMutation.mutate({
      content: newComment,
      field_id: commentFieldId || undefined,
    });
  };

  const handleDownloadPdf = async () => {
    try {
      const response = await formsApi.downloadPdf(formId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form_${formId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to download PDF' });
    }
  };

  if (formLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const form = formData as FormInstance & { data?: { data: Record<string, any> }; template?: { schema: any } };
  const config = statusConfig[form?.status || 'draft'];
  const StatusIcon = config.icon;
  const comments = commentsData || [];
  const history = historyData || [];
  const versions = versionsData || [];
  const unresolvedCount = comments.filter(t => !t.is_resolved).length;

  const canEdit = form?.status === 'draft' || form?.status === 'needs_changes';
  const canReview = isReviewer && form?.status === 'in_review';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      submit_for_review: 'Submitted for Review',
      request_changes: 'Changes Requested',
      approve: 'Approved',
      reject: 'Rejected',
      return_to_draft: 'Returned to Draft',
    };
    return labels[actionType] || actionType;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{form?.title}</h1>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {form?.template?.name} v{form?.template?.version} · Version {form?.current_version_number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => navigate(`/forms/${formId}`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Review Actions (for reviewers) */}
      {canReview && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Review Actions</CardTitle>
            <CardDescription>Take action on this form submission</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => setActionDialog('approve')} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button variant="outline" onClick={() => setActionDialog('request_changes')}>
              <AlertCircle className="h-4 w-4 mr-2" />
              Request Changes
            </Button>
            <Button variant="destructive" onClick={() => setActionDialog('reject')}>
              Reject
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Unresolved Comments Alert */}
      {unresolvedCount > 0 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <MessageSquare className="h-5 w-5 text-amber-600" />
            <span className="text-amber-800 dark:text-amber-200">
              {unresolvedCount} unresolved comment{unresolvedCount !== 1 ? 's' : ''} on this form
            </span>
            <Button variant="link" className="text-amber-700" onClick={() => setActiveTab('comments')}>
              View Comments
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="comments" className="flex items-center gap-2">
            Comments
            {unresolvedCount > 0 && (
              <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center">
                {unresolvedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Form Data</CardTitle>
              <CardDescription>Current form field values</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {form?.template?.schema?.sections?.map((section: any) => (
                  <div key={section.id} className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">{section.title}</h3>
                    <div className="grid gap-3">
                      {section.fields?.map((field: any) => {
                        const value = form?.data?.data?.[field.id];
                        if (value === undefined || value === null || value === '') return null;
                        return (
                          <div key={field.id} className="grid grid-cols-3 gap-4">
                            <div className="text-sm text-muted-foreground">{field.label}</div>
                            <div className="col-span-2 text-sm">
                              {Array.isArray(value) ? value.join(', ') : String(value)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )) || (
                  <p className="text-muted-foreground">No form data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments" className="mt-6 space-y-4">
          {/* Add Comment */}
          <Card>
            <CardHeader>
              <CardTitle>Add Comment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Write a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
              />
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder="Field ID (optional)"
                  className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={commentFieldId}
                  onChange={(e) => setCommentFieldId(e.target.value)}
                />
                <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Post Comment
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Comment Threads */}
          {comments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No comments yet</h3>
                <p className="text-muted-foreground">Be the first to add a comment</p>
              </CardContent>
            </Card>
          ) : (
            comments.map((thread) => (
              <Card key={thread.id} className={thread.is_resolved ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {thread.field_id && (
                        <Badge variant="outline">{thread.field_id}</Badge>
                      )}
                      <Badge variant={thread.is_resolved ? 'secondary' : 'default'}>
                        {thread.is_resolved ? 'Resolved' : 'Open'}
                      </Badge>
                    </div>
                    {!thread.is_resolved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveThreadMutation.mutate(thread.id)}
                      >
                        Mark Resolved
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {thread.comments?.map((comment) => (
                    <div key={comment.id} className="border-l-2 pl-4 py-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-medium">{comment.author_id?.slice(0, 8)}...</span>
                        <span>·</span>
                        <span>{formatDate(comment.created_at)}</span>
                        {comment.is_edited && <span className="italic">(edited)</span>}
                      </div>
                      <p className="mt-1">{comment.content}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Review History</CardTitle>
              <CardDescription>Timeline of review actions</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No review history yet</p>
              ) : (
                <div className="space-y-4">
                  {history.map((action, index) => (
                    <div key={action.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${
                          action.action_type === 'approve' ? 'bg-green-500' :
                          action.action_type === 'reject' ? 'bg-red-500' :
                          action.action_type === 'request_changes' ? 'bg-amber-500' :
                          'bg-blue-500'
                        }`} />
                        {index < history.length - 1 && (
                          <div className="w-px h-full bg-border" />
                        )}
                      </div>
                      <div className="pb-4">
                        <div className="font-medium">{getActionLabel(action.action_type)}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(action.created_at)}
                        </div>
                        {action.notes && (
                          <p className="mt-2 text-sm bg-muted p-2 rounded">{action.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
              <CardDescription>All saved versions of this form</CardDescription>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No versions yet</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((version: any) => (
                    <div key={version.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">
                          Version {version.version_number}
                          {version.version_label && ` - ${version.version_label}`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(version.created_at)}
                        </div>
                      </div>
                      <Badge variant="outline">{version.status_at_creation}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Form Activity</CardTitle>
              <CardDescription>All activity and field changes on this form</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityFeed
                type="form"
                resourceId={formId}
                title=""
                showFilters
                maxHeight="500px"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog === 'approve' && 'Approve Form'}
              {actionDialog === 'reject' && 'Reject Form'}
              {actionDialog === 'request_changes' && 'Request Changes'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === 'approve' && 'Add optional notes for the approval.'}
              {actionDialog === 'reject' && 'Please provide a reason for rejecting this form.'}
              {actionDialog === 'request_changes' && 'Describe the changes needed before approval.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={actionDialog === 'approve' ? 'Optional notes...' : 'Required notes...'}
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              variant={actionDialog === 'reject' ? 'destructive' : actionDialog === 'approve' ? 'default' : 'outline'}
              className={actionDialog === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {actionDialog === 'approve' && 'Approve'}
              {actionDialog === 'reject' && 'Reject'}
              {actionDialog === 'request_changes' && 'Request Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
