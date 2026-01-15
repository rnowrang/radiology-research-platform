import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  FileEdit,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronLeft,
  Eye,
  MoreHorizontal,
  Send,
  Trash2,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { amendmentsApi, formsApi } from '@/lib/api';
import { AmendmentForm } from '@/components/amendments/AmendmentForm';
import type { Amendment, AmendmentType } from '@/types';

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

export function AmendmentsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const formId = parseInt(id!, 10);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  const isReviewer = user?.role === 'admin' || user?.role === 'reviewer';

  // Fetch form data
  const { data: formData } = useQuery({
    queryKey: ['form', formId],
    queryFn: async () => {
      const response = await formsApi.get(formId);
      return response.data.data;
    },
  });

  // Fetch amendments
  const { data: amendments, isLoading } = useQuery({
    queryKey: ['amendments', formId],
    queryFn: async () => {
      const response = await amendmentsApi.list(formId);
      return response.data.data as Amendment[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (amendmentId: number) => amendmentsApi.delete(amendmentId),
    onSuccess: () => {
      toast({ title: 'Amendment deleted' });
      queryClient.invalidateQueries({ queryKey: ['amendments', formId] });
      setDeleteDialogId(null);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to delete amendment' });
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { amendment_type: AmendmentType; description?: string }) =>
      amendmentsApi.create(formId, data),
    onSuccess: (response) => {
      toast({ title: 'Amendment created' });
      queryClient.invalidateQueries({ queryKey: ['amendments', formId] });
      setShowCreateDialog(false);
      // Navigate to the new amendment
      navigate(`/forms/${formId}/amendments/${response.data.data.id}`);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create amendment',
        description: error.response?.data?.message || 'An error occurred',
      });
    },
  });

  const canCreateAmendment = formData?.status === 'approved' || formData?.status === 'locked';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/forms/${formId}/view`)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Amendments</h1>
          <p className="text-muted-foreground">
            {formData?.title}
          </p>
        </div>
        {canCreateAmendment && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Amendment
          </Button>
        )}
      </div>

      {/* Info banner for non-amendable forms */}
      {!canCreateAmendment && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <span className="text-amber-800 dark:text-amber-200">
              Amendments can only be created for approved or locked forms. Current status: {formData?.status}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Amendments List */}
      <Card>
        <CardHeader>
          <CardTitle>All Amendments</CardTitle>
          <CardDescription>
            {amendments?.length || 0} amendment{(amendments?.length || 0) !== 1 ? 's' : ''} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!amendments || amendments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileEdit className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">No amendments yet</h3>
              <p className="mt-1 text-muted-foreground">
                {canCreateAmendment
                  ? 'Create an amendment to propose changes to this form'
                  : 'Amendments will appear here once the form is approved'}
              </p>
              {canCreateAmendment && (
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Amendment
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {amendments.map((amendment) => (
                  <TableRow key={amendment.id}>
                    <TableCell>
                      <Link
                        to={`/forms/${formId}/amendments/${amendment.id}`}
                        className="font-medium hover:underline"
                      >
                        {amendmentTypeLabels[amendment.amendment_type] || amendment.amendment_type}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {amendment.description || '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(amendment.status)}</TableCell>
                    <TableCell>{amendment.field_changes_count || 0}</TableCell>
                    <TableCell>{formatDate(amendment.submitted_at)}</TableCell>
                    <TableCell>{formatDate(amendment.reviewed_at)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/forms/${formId}/amendments/${amendment.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {amendment.status === 'draft' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteDialogId(amendment.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Amendment Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Amendment</DialogTitle>
            <DialogDescription>
              Start a new amendment to propose changes to this form.
            </DialogDescription>
          </DialogHeader>
          <AmendmentForm
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setShowCreateDialog(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialogId} onOpenChange={() => setDeleteDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Amendment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this amendment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialogId && deleteMutation.mutate(deleteDialogId)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
