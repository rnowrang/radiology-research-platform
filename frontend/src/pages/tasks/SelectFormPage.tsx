import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/useToast';
import { templatesApi, tasksApi } from '@/lib/api';

interface Template {
  id: number;
  name: string;
  description?: string;
  version: string;
  is_published: boolean;
}

export function SelectFormPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch available templates
  const {
    data: templatesResponse,
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  });

  // Fetch task details
  const { data: taskResponse, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(Number(taskId)),
    enabled: !!taskId,
  });

  // Mutation to create form
  const createForm = useMutation({
    mutationFn: (templateId: number) =>
      tasksApi.createFormForTask(Number(taskId), templateId),
    onSuccess: (response) => {
      toast({
        title: 'Form created',
        description: 'Your form has been created successfully',
      });
      // Redirect to form editor
      const formId = response.data?.data?.form_instance_id || response.data?.form_instance_id;
      if (formId) {
        navigate(`/forms/${formId}`);
      } else {
        // Fallback to tasks page if we can't get the form ID
        navigate('/tasks');
      }
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create form',
      });
    },
  });

  const templates: Template[] = templatesResponse?.data?.data || templatesResponse?.data || [];
  const task = taskResponse?.data?.data || taskResponse?.data;

  // If task already has a form, redirect to it
  useEffect(() => {
    if (task?.form_instance_id) {
      navigate(`/forms/${task.form_instance_id}`, { replace: true });
    }
  }, [task, navigate]);

  // Filter to only show published templates
  const publishedTemplates = templates.filter((t) => t.is_published !== false);

  if (templatesLoading || taskLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templatesError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Error</h1>
        </div>
        <p className="text-muted-foreground">Failed to load templates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Select Form Template</h1>
          {task && (
            <p className="text-muted-foreground">
              Choose a form template to complete: {task.title}
            </p>
          )}
        </div>
      </div>

      {publishedTemplates.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No templates available</CardTitle>
            <CardDescription>
              There are no published form templates available. Please contact an
              administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {publishedTemplates.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer transition-colors hover:border-primary hover:bg-muted/50"
              onClick={() => !createForm.isPending && createForm.mutate(template.id)}
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Version {template.version}
                    </p>
                  </div>
                </div>
                {createForm.isPending && createForm.variables === template.id && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating form...
                  </div>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default SelectFormPage;
