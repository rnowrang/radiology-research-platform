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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!project || !id) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Button onClick={() => navigate('/projects')} className="mt-4">
          Back to Projects
        </Button>
      </div>
    );
  }

  // Use negative margin to counteract parent p-6 padding and fill available space
  // App header is 64px, main padding is 24px top + 24px bottom = 112px total
  return (
    <div className="flex flex-col -m-6 h-[calc(100vh-64px)]">
      {/* Compact Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/projects/${id}`)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Research Intelligence</h1>
            <p className="text-xs text-muted-foreground leading-tight">{project.title}</p>
          </div>
        </div>
      </div>

      {/* Intelligence Panel - fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <IntelligencePanel projectId={id} />
      </div>
    </div>
  );
}

export default IntelligencePage;
