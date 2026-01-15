import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { Calendar as CalendarIcon, User, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { usersApi, reviewStagesApi, StageReviewInfo } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface StageAssignmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: number;
  stage: StageReviewInfo | null;
  defaultDeadlineDays?: number;
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export function StageAssignment({
  open,
  onOpenChange,
  formId,
  stage,
  defaultDeadlineDays = 7,
}: StageAssignmentProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedReviewerId, setSelectedReviewerId] = useState<string>('');
  const [deadline, setDeadline] = useState<string>(
    format(addDays(new Date(), defaultDeadlineDays), 'yyyy-MM-dd')
  );

  // Fetch reviewers (admins and reviewers)
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['reviewers'],
    queryFn: async () => {
      const response = await usersApi.list({ is_active: true });
      const users = response.data.data as UserOption[];
      // Filter to only admins and reviewers
      return users.filter((u) => u.role === 'admin' || u.role === 'reviewer');
    },
    enabled: open,
  });

  // Assign reviewer mutation
  const assignMutation = useMutation({
    mutationFn: () =>
      reviewStagesApi.assignReviewer(formId, stage!.stage_id, {
        reviewer_id: selectedReviewerId,
        deadline: deadline || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formReviewProgress', formId] });
      onOpenChange(false);
      resetForm();
      toast({
        title: 'Reviewer assigned',
        description: `Reviewer has been assigned to ${stage?.stage_name}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to assign reviewer',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setSelectedReviewerId('');
    setDeadline(format(addDays(new Date(), defaultDeadlineDays), 'yyyy-MM-dd'));
  };

  const handleClose = (openState: boolean) => {
    if (!openState) {
      resetForm();
    }
    onOpenChange(openState);
  };

  const handleAssign = () => {
    if (!selectedReviewerId) {
      toast({
        title: 'Validation error',
        description: 'Please select a reviewer',
        variant: 'destructive',
      });
      return;
    }
    assignMutation.mutate();
  };

  const reviewers = usersData || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Assign Reviewer
          </DialogTitle>
          <DialogDescription>
            Assign a reviewer to the{' '}
            <strong>{stage?.stage_name || 'review stage'}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Assignment Info */}
          {stage?.reviewer_id && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Currently assigned to:{' '}
                <strong>{stage.reviewer_name || 'Unknown'}</strong>
              </div>
            </div>
          )}

          {/* Reviewer Select */}
          <div className="space-y-2">
            <Label htmlFor="reviewer">Reviewer</Label>
            <Select
              value={selectedReviewerId}
              onValueChange={setSelectedReviewerId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reviewer" />
              </SelectTrigger>
              <SelectContent>
                {usersLoading ? (
                  <SelectItem value="" disabled>
                    Loading reviewers...
                  </SelectItem>
                ) : reviewers.length === 0 ? (
                  <SelectItem value="" disabled>
                    No reviewers available
                  </SelectItem>
                ) : (
                  reviewers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <span>{user.fullName}</span>
                        <span className="text-muted-foreground text-xs">
                          ({user.role})
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Deadline Picker */}
          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline</Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedReviewerId || assignMutation.isPending}
          >
            {assignMutation.isPending ? 'Assigning...' : 'Assign Reviewer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StageCompletionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: number;
  stage: StageReviewInfo | null;
}

export function StageCompletion({
  open,
  onOpenChange,
  formId,
  stage,
}: StageCompletionProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [status, setStatus] = useState<string>('');
  const [comments, setComments] = useState('');

  // Complete stage mutation
  const completeMutation = useMutation({
    mutationFn: () =>
      reviewStagesApi.completeStage(formId, stage!.stage_id, {
        status,
        comments: comments || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formReviewProgress', formId] });
      onOpenChange(false);
      resetForm();
      toast({
        title: 'Stage completed',
        description: `${stage?.stage_name} has been marked as ${status}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to complete stage',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setStatus('');
    setComments('');
  };

  const handleClose = (openState: boolean) => {
    if (!openState) {
      resetForm();
    }
    onOpenChange(openState);
  };

  const handleComplete = () => {
    if (!status) {
      toast({
        title: 'Validation error',
        description: 'Please select a status',
        variant: 'destructive',
      });
      return;
    }
    completeMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5" />
            Complete Stage Review
          </DialogTitle>
          <DialogDescription>
            Submit your decision for{' '}
            <strong>{stage?.stage_name || 'this stage'}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Select */}
          <div className="space-y-2">
            <Label htmlFor="status">Decision</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select your decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Approve
                  </div>
                </SelectItem>
                <SelectItem value="revision_required">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    Request Revision
                  </div>
                </SelectItem>
                <SelectItem value="rejected">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    Reject
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label htmlFor="comments">
              Comments {status !== 'approved' && <span className="text-red-500">*</span>}
            </Label>
            <textarea
              id="comments"
              className="w-full min-h-[100px] p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={
                status === 'approved'
                  ? 'Optional comments...'
                  : 'Please provide feedback...'
              }
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleComplete}
            disabled={
              !status ||
              (status !== 'approved' && !comments) ||
              completeMutation.isPending
            }
            variant={status === 'rejected' ? 'destructive' : 'default'}
          >
            {completeMutation.isPending ? 'Submitting...' : 'Submit Decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StageAssignment;
