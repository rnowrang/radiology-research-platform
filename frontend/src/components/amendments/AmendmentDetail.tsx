import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileEdit,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  Plus,
  Trash2,
  Edit2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { amendmentsApi } from '@/lib/api';
import { AmendmentDiff } from './AmendmentDiff';
import type { AmendmentWithChanges, AmendmentFieldChange } from '@/types';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; color: string }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: FileEdit, color: 'text-muted-foreground' },
  submitted: { label: 'Submitted', variant: 'default', icon: Clock, color: 'text-blue-500' },
  approved: { label: 'Approved', variant: 'outline', icon: CheckCircle, color: 'text-green-500' },
  rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle, color: 'text-destructive' },
  withdrawn: { label: 'Withdrawn', variant: 'outline', icon: AlertCircle, color: 'text-muted-foreground' },
};

const amendmentTypeLabels: Record<string, string> = {
  protocol_change: 'Protocol Change',
  personnel_change: 'Personnel Change',
  funding_change: 'Funding Change',
  site_change: 'Site Change',
  procedure_change: 'Procedure Change',
  consent_update: 'Consent Update',
  other: 'Other',
};

interface AmendmentDetailProps {
  amendment: AmendmentWithChanges;
  formId: number;
}

export function AmendmentDetail({ amendment, formId }: AmendmentDetailProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [showAddChangeDialog, setShowAddChangeDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState<'approve' | 'reject' | null>(null);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [deleteChangeId, setDeleteChangeId] = useState<number | null>(null);

  // New field change state
  const [newChange, setNewChange] = useState({
    field_id: '',
    field_label: '',
    old_value: '',
    new_value: '',
    justification: '',
  });

  const isReviewer = user?.role === 'admin' || user?.role === 'reviewer';
  const isOwner = user?.id === amendment.created_by_id;
  const isDraft = amendment.status === 'draft';
  const isSubmitted = amendment.status === 'submitted';

  const config = statusConfig[amendment.status] || statusConfig.draft;
  const StatusIcon = config.icon;

  // Mutations
  const submitMutation = useMutation({
    mutationFn: () => amendmentsApi.submit(amendment.id),
    onSuccess: () => {
      toast({ title: 'Amendment submitted for review' });
      queryClient.invalidateQueries({ queryKey: ['amendment', amendment.id] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to submit amendment',
        description: error.response?.data?.message,
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (notes?: string) => amendmentsApi.approve(amendment.id, notes),
    onSuccess: () => {
      toast({ title: 'Amendment approved and changes applied' });
      queryClient.invalidateQueries({ queryKey: ['amendment', amendment.id] });
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
      setShowReviewDialog(null);
      setReviewNotes('');
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to approve amendment' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (notes: string) => amendmentsApi.reject(amendment.id, notes),
    onSuccess: () => {
      toast({ title: 'Amendment rejected' });
      queryClient.invalidateQueries({ queryKey: ['amendment', amendment.id] });
      setShowReviewDialog(null);
      setReviewNotes('');
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to reject amendment' });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => amendmentsApi.withdraw(amendment.id),
    onSuccess: () => {
      toast({ title: 'Amendment withdrawn' });
      queryClient.invalidateQueries({ queryKey: ['amendment', amendment.id] });
      setShowWithdrawDialog(false);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to withdraw amendment' });
    },
  });

  const addChangeMutation = useMutation({
    mutationFn: (data: any) => amendmentsApi.addChange(amendment.id, data),
    onSuccess: () => {
      toast({ title: 'Field change added' });
      queryClient.invalidateQueries({ queryKey: ['amendment', amendment.id] });
      setShowAddChangeDialog(false);
      setNewChange({
        field_id: '',
        field_label: '',
        old_value: '',
        new_value: '',
        justification: '',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to add field change',
        description: error.response?.data?.message,
      });
    },
  });

  const removeChangeMutation = useMutation({
    mutationFn: (changeId: number) => amendmentsApi.removeChange(amendment.id, changeId),
    onSuccess: () => {
      toast({ title: 'Field change removed' });
      queryClient.invalidateQueries({ queryKey: ['amendment', amendment.id] });
      setDeleteChangeId(null);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to remove field change' });
    },
  });

  const handleAddChange = () => {
    if (!newChange.field_id) return;

    addChangeMutation.mutate({
      field_id: newChange.field_id,
      field_label: newChange.field_label || undefined,
      old_value: newChange.old_value || undefined,
      new_value: newChange.new_value || undefined,
      justification: newChange.justification || undefined,
    });
  };

  const handleReviewAction = () => {
    if (showReviewDialog === 'approve') {
      approveMutation.mutate(reviewNotes || undefined);
    } else if (showReviewDialog === 'reject') {
      if (!reviewNotes.trim()) {
        toast({ variant: 'destructive', title: 'Please provide a reason for rejection' });
        return;
      }
      rejectMutation.mutate(reviewNotes);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <StatusIcon className={`h-5 w-5 ${config.color}`} />
                {amendmentTypeLabels[amendment.amendment_type] || amendment.amendment_type}
                <Badge variant={config.variant}>{config.label}</Badge>
              </CardTitle>
              <CardDescription className="mt-2">
                {amendment.description || 'No description provided'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {isDraft && isOwner && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowWithdrawDialog(true)}
                    disabled={withdrawMutation.isPending}
                  >
                    Withdraw
                  </Button>
                  <Button
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending || amendment.field_changes.length === 0}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Review
                  </Button>
                </>
              )}
              {isSubmitted && isOwner && (
                <Button
                  variant="outline"
                  onClick={() => setShowWithdrawDialog(true)}
                  disabled={withdrawMutation.isPending}
                >
                  Withdraw
                </Button>
              )}
              {isSubmitted && isReviewer && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowReviewDialog('reject')}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => setShowReviewDialog('approve')}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">{formatDate(amendment.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Submitted</p>
              <p className="font-medium">{formatDate(amendment.submitted_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Reviewed</p>
              <p className="font-medium">{formatDate(amendment.reviewed_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Field Changes</p>
              <p className="font-medium">{amendment.field_changes.length}</p>
            </div>
          </div>

          {amendment.review_notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-1">Review Notes</p>
              <p className="text-sm bg-muted p-3 rounded">{amendment.review_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Field Changes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Field Changes</CardTitle>
              <CardDescription>
                {amendment.field_changes.length} change{amendment.field_changes.length !== 1 ? 's' : ''} proposed
              </CardDescription>
            </div>
            {isDraft && isOwner && (
              <Button onClick={() => setShowAddChangeDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Change
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {amendment.field_changes.length === 0 ? (
            <div className="text-center py-8">
              <FileEdit className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No changes yet</h3>
              <p className="text-muted-foreground mt-1">
                {isDraft && isOwner
                  ? 'Add field changes to specify what should be modified.'
                  : 'No field changes have been added to this amendment.'}
              </p>
              {isDraft && isOwner && (
                <Button className="mt-4" onClick={() => setShowAddChangeDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field Change
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {amendment.field_changes.map((change) => (
                <div key={change.id} className="relative">
                  <AmendmentDiff changes={[change]} showJustification />
                  {isDraft && isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => setDeleteChangeId(change.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Field Change Dialog */}
      <Dialog open={showAddChangeDialog} onOpenChange={setShowAddChangeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Field Change</DialogTitle>
            <DialogDescription>
              Specify the field you want to change and provide the current and new values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="field_id">Field ID *</Label>
              <Input
                id="field_id"
                placeholder="e.g., principal_investigator"
                value={newChange.field_id}
                onChange={(e) => setNewChange({ ...newChange, field_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field_label">Field Label</Label>
              <Input
                id="field_label"
                placeholder="e.g., Principal Investigator"
                value={newChange.field_label}
                onChange={(e) => setNewChange({ ...newChange, field_label: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="old_value">Current Value</Label>
                <Textarea
                  id="old_value"
                  placeholder="Current value..."
                  value={newChange.old_value}
                  onChange={(e) => setNewChange({ ...newChange, old_value: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_value">New Value</Label>
                <Textarea
                  id="new_value"
                  placeholder="New value..."
                  value={newChange.new_value}
                  onChange={(e) => setNewChange({ ...newChange, new_value: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="justification">Justification</Label>
              <Textarea
                id="justification"
                placeholder="Explain why this change is needed..."
                value={newChange.justification}
                onChange={(e) => setNewChange({ ...newChange, justification: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddChangeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddChange}
              disabled={!newChange.field_id || addChangeMutation.isPending}
            >
              Add Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Action Dialog */}
      <Dialog open={!!showReviewDialog} onOpenChange={() => setShowReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showReviewDialog === 'approve' ? 'Approve Amendment' : 'Reject Amendment'}
            </DialogTitle>
            <DialogDescription>
              {showReviewDialog === 'approve'
                ? 'Approving this amendment will apply all field changes to the form.'
                : 'Please provide a reason for rejecting this amendment.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={showReviewDialog === 'approve' ? 'Optional notes...' : 'Required: Reason for rejection...'}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={showReviewDialog === 'reject' ? 'destructive' : 'default'}
              className={showReviewDialog === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
              onClick={handleReviewAction}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              {showReviewDialog === 'approve' ? 'Approve & Apply Changes' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Confirmation */}
      <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw Amendment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to withdraw this amendment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Change Confirmation */}
      <AlertDialog open={!!deleteChangeId} onOpenChange={() => setDeleteChangeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Field Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this field change from the amendment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteChangeId && removeChangeMutation.mutate(deleteChangeId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
