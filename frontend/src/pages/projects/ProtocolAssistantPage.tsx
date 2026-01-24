import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatPanel } from '@/components/protocol-assistant/ChatPanel';
import { projectsApi } from '@/lib/api';

export function ProtocolAssistantPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // Fetch project details
  const {
    data: projectData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await projectsApi.get(projectId!);
      return response.data.data;
    },
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || !projectData) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load project. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Project
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Protocol Assistant</h1>
            </div>
            <p className="text-muted-foreground">
              AI-powered assistance for {projectData.title}
            </p>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle>How to use Protocol Assistant</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
            <li>Upload your research protocol document (PDF, Word, or text)</li>
            <li>The assistant will analyze it and identify any gaps</li>
            <li>Answer the gap questions to complete your protocol</li>
            <li>Generate IRB-ready documents: abstract, consent form, and full protocol</li>
          </ol>
        </AlertDescription>
      </Alert>

      {/* Chat Panel */}
      <div className="max-w-4xl mx-auto">
        <ChatPanel projectId={projectId!} />
      </div>
    </div>
  );
}
