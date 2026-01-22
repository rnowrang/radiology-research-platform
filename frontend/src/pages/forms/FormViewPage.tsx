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
  XCircle,
  Eye,
  User,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
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
import { PdfPreviewModal } from '@/components/forms/PdfPreviewModal';
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
  const [showAllFields, setShowAllFields] = useState(isReviewer);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['adminReviewQueueCount'] });
      // Invalidate project task queries if form has a project
      const projectId = formData?.project_id || formData?.project?.id;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', projectId] });
      }
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
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['adminReviewQueueCount'] });
      // Invalidate project task queries if form has a project
      const projectId = formData?.project_id || formData?.project?.id;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', projectId] });
      }
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
      queryClient.invalidateQueries({ queryKey: ['reviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['adminReviewQueueCount'] });
      // Invalidate project task queries if form has a project
      const projectId = formData?.project_id || formData?.project?.id;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', projectId] });
      }
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

  const handleSubmitForReview = async () => {
    try {
      await formsApi.submitForReview(formId);
      toast({
        title: 'Submitted for review',
        description: 'Your form has been resubmitted for review',
      });
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
      queryClient.invalidateQueries({ queryKey: ['reviewHistory', formId] });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to submit form for review' });
    }
  };

  if (formLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const form = formData as FormInstance & { data?: Record<string, any>; template?: { schema: any } };
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

  // Helper function to get nested value from object using dot notation path
  const getNestedValue = (obj: any, path: string): any => {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  };

  // Helper function to get fields for a section
  // Handles both nested fields (section.fields) and flat fields array (schema.fields with section_id)
  const getSectionFields = (section: any, schema: any): any[] => {
    // First check if fields are nested inside section
    if (section.fields && section.fields.length > 0) {
      return section.fields.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    }

    // Fall back to flat fields array with section_id
    if (schema?.fields) {
      return schema.fields
        .filter((f: any) => f.section_id === section.id)
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    }

    return [];
  };

  // Calculate completion statistics
  const calculateCompletionStats = () => {
    const schema = form?.template?.schema;
    const savedData = form?.data || {};

    if (!schema?.sections) return { total: 0, filled: 0, requiredMissing: [], percentage: 0 };

    let total = 0;
    let filled = 0;
    const requiredMissing: string[] = [];

    schema.sections.forEach((section: any) => {
      const sectionFields = getSectionFields(section, schema);
      sectionFields.forEach((field: any) => {
        total++;
        const value = getNestedValue(savedData, field.id);
        const hasValue = value !== undefined && value !== null && value !== '';
        if (hasValue) filled++;
        else if (field.required || field.validation?.required) {
          requiredMissing.push(field.label);
        }
      });
    });

    return { total, filled, requiredMissing, percentage: total > 0 ? Math.round((filled / total) * 100) : 0 };
  };

  const completionStats = calculateCompletionStats();

  // Build breadcrumb items based on user role
  const isAdmin = user?.role === 'admin';
  const breadcrumbItems = isAdmin
    ? [
        { label: 'Admin', href: '/admin' },
        { label: 'Forms', href: '/admin/forms' },
        { label: form?.title || 'Form', current: true },
      ]
    : [
        { label: 'Forms', href: '/forms' },
        { label: form?.title || 'Form', current: true },
      ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

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
            {form?.template?.name} v{form?.template?.version} · Version {form?.currentVersionNumber || (form as any)?.current_version_number}
          </p>
          {/* Project and Owner Info */}
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            {(form?.project || (form as any)?.project_name) && (
              <div className="flex items-center gap-1">
                <FolderOpen className="h-4 w-4" />
                <span>Project: </span>
                <span className="font-medium text-foreground">
                  {form?.project?.title || (form as any)?.project_name || (form as any)?.project_id}
                </span>
              </div>
            )}
            {(form?.owner || (form as any)?.owner_name || form?.ownerId || (form as any)?.owner_id) && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>Owner: </span>
                <span className="font-medium text-foreground">
                  {form?.owner?.fullName || (form as any)?.owner?.full_name || (form as any)?.owner_name || form?.ownerId || (form as any)?.owner_id}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => navigate(`/forms/${formId}`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {form?.status === 'needs_changes' && (
            <Button onClick={handleSubmitForReview}>
              <Send className="h-4 w-4 mr-2" />
              Submit for Review
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowPdfPreview(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview PDF
          </Button>
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

        <TabsContent value="details" className="mt-6 space-y-4">
          {/* Completion Summary (for reviewers) */}
          {isReviewer && (
            <Card className={completionStats.requiredMissing.length > 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-green-500 bg-green-50 dark:bg-green-950/20'}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`text-2xl font-bold ${completionStats.percentage === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                        {completionStats.percentage}%
                      </div>
                      <span className="text-sm text-muted-foreground">Complete</span>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="text-sm">
                      <span className="font-medium">{completionStats.filled}</span>
                      <span className="text-muted-foreground"> of {completionStats.total} fields filled</span>
                    </div>
                  </div>
                  {completionStats.requiredMissing.length > 0 && (
                    <div className="text-sm text-amber-700 dark:text-amber-300">
                      <span className="font-medium">{completionStats.requiredMissing.length} required field{completionStats.requiredMissing.length !== 1 ? 's' : ''} missing:</span>
                      <span className="ml-1">{completionStats.requiredMissing.slice(0, 3).join(', ')}{completionStats.requiredMissing.length > 3 ? '...' : ''}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Form Data</CardTitle>
                <CardDescription>
                  {showAllFields ? 'Showing all form fields' : 'Showing filled fields only'}
                </CardDescription>
              </div>
              {isReviewer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllFields(!showAllFields)}
                >
                  {showAllFields ? 'Show Filled Only' : 'Show All Fields'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {form?.template?.schema?.sections?.map((section: any) => {
                  const sectionFields = getSectionFields(section, form?.template?.schema);
                  return (
                    <div key={section.id} className="space-y-3">
                      <h3 className="font-semibold text-lg border-b pb-2">{section.title}</h3>
                      <div className="grid gap-3">
                        {sectionFields.map((field: any) => {
                          const value = getNestedValue(form?.data, field.id);
                          const hasValue = value !== undefined && value !== null && value !== '';
                          const isRequired = field.required || field.validation?.required;

                          // In regular mode, skip empty fields
                          if (!showAllFields && !hasValue) return null;

                          return (
                            <div key={field.id} className="grid grid-cols-3 gap-4 py-2 border-b border-muted last:border-0">
                              <div className="flex items-center gap-2 text-sm">
                                {/* Status indicator */}
                                {hasValue ? (
                                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                ) : isRequired ? (
                                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                )}
                                <span className="text-muted-foreground">
                                  {field.label}
                                  {isRequired && <span className="text-red-500 ml-1">*</span>}
                                </span>
                              </div>
                              <div className="col-span-2 text-sm">
                                {hasValue ? (
                                  Array.isArray(value) ? value.join(', ') : String(value)
                                ) : (
                                  <span className={isRequired ? 'text-red-500 italic' : 'text-muted-foreground italic'}>
                                    Not provided
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }) || (
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

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        formId={formId}
        formTitle={form?.title || 'Form'}
        isOpen={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
      />
    </div>
  );
}
