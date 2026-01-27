/**
 * Intelligence Page - Unified AI Assistant for Research Projects
 *
 * Combines Chat, Guided Questionnaire, Document Editing, and Review modes
 * into a single cohesive interface.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntelligencePanel } from '@/components/intelligence';
import { projectsApi } from '@/lib/api';

interface ProjectResponse {
  id: string;
  title: string;
  status: string;
}

export function IntelligencePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await projectsApi.get(id!);
      return response.data.data as ProjectResponse;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!project || !id) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)]">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Button onClick={() => navigate('/projects')} className="mt-4">
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-background">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${id}`)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Research Intelligence</h1>
            <p className="text-sm text-muted-foreground">{project.title}</p>
          </div>
        </div>
      </div>

      {/* Intelligence Panel */}
      <div className="flex-1 overflow-hidden">
        <IntelligencePanel projectId={id} />
      </div>
    </div>
  );
}

export default IntelligencePage;
