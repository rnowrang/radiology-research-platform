import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ProjectQuestionnaire } from '@/components/questionnaire';
import { projectsApi } from '@/lib/api';

export function QuestionnairePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

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

  const handleComplete = () => {
    navigate(`/projects/${projectId}/tasks`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
    <div className="flex flex-col h-[calc(100vh-7rem)] overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between py-1 px-1 shrink-0 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h1 className="text-lg font-semibold">Project Questionnaire</h1>
            <span className="text-sm text-muted-foreground hidden sm:inline">
              — {projectData.title}
            </span>
          </div>
        </div>
      </div>

      {/* Questionnaire - Fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ProjectQuestionnaire
          projectId={projectId!}
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}
