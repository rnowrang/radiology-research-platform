import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { amendmentsApi } from '@/lib/api';
import { AmendmentDetail } from '@/components/amendments/AmendmentDetail';
import type { AmendmentWithChanges } from '@/types';

export function AmendmentDetailPage() {
  const { id, amendmentId } = useParams<{ id: string; amendmentId: string }>();
  const navigate = useNavigate();
  const formId = parseInt(id!, 10);
  const parsedAmendmentId = parseInt(amendmentId!, 10);

  const { data: amendment, isLoading, error } = useQuery({
    queryKey: ['amendment', parsedAmendmentId],
    queryFn: async () => {
      const response = await amendmentsApi.get(parsedAmendmentId);
      return response.data.data as AmendmentWithChanges;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !amendment) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <h2 className="text-xl font-semibold">Amendment not found</h2>
        <p className="text-muted-foreground mt-2">
          The amendment you're looking for doesn't exist or you don't have access to it.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate(`/forms/${formId}/amendments`)}
        >
          Back to Amendments
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/forms/${formId}/amendments`)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Amendment Details</h1>
          <p className="text-muted-foreground">
            Amendment #{amendment.id}
          </p>
        </div>
      </div>

      <AmendmentDetail amendment={amendment} formId={formId} />
    </div>
  );
}
