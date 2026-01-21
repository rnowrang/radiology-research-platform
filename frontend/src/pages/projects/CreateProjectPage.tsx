import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { projectsApi } from '@/lib/api';

const projectTypes = [
  { value: 'retrospective', label: 'Retrospective Study' },
  { value: 'prospective', label: 'Prospective Study' },
  { value: 'clinical_trial', label: 'Clinical Trial' },
  { value: 'quality_improvement', label: 'Quality Improvement' },
  { value: 'educational', label: 'Educational Research' },
  { value: 'other', label: 'Other' },
];

interface ProjectFormData {
  title: string;
  description: string;
  project_type: string;
  department: string;
  start_date: string;
  end_date: string;
}

interface TaskDefinition {
  id: number;
  task_definition_id: number;
  task_definition_name: string;
  task_definition_description?: string;
  task_type: string;
  is_required: boolean;
  display_order: number;
}

export function CreateProjectPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [formData, setFormData] = useState<ProjectFormData>({
    title: '',
    description: '',
    project_type: '',
    department: '',
    start_date: '',
    end_date: '',
  });

  const [previewTasks, setPreviewTasks] = useState<TaskDefinition[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Fetch tasks when project type changes
  useEffect(() => {
    if (formData.project_type) {
      setLoadingTasks(true);
      projectsApi.getTasksForProjectType(formData.project_type)
        .then((res) => {
          setPreviewTasks(res.data?.data || res.data || []);
        })
        .catch(() => {
          setPreviewTasks([]);
        })
        .finally(() => {
          setLoadingTasks(false);
        });
    } else {
      setPreviewTasks([]);
    }
  }, [formData.project_type]);

  const createMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const payload = {
        title: data.title,
        description: data.description || undefined,
        project_type: data.project_type || undefined,
        department: data.department || undefined,
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
        principal_investigator_id: user?.id,
      };
      return projectsApi.create(payload);
    },
    onSuccess: (response) => {
      toast({
        title: 'Project created',
        description: 'Your project has been created successfully',
      });
      navigate(`/projects/${response.data.data.id}`);
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create project',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Project title is required',
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleChange = (field: keyof ProjectFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Project</h1>
          <p className="text-muted-foreground">
            Set up a new research project
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>
              Enter the basic information about your project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">
                Project Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Enter project title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Describe your project"
                rows={4}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project_type">Project Type</Label>
                <Select
                  value={formData.project_type}
                  onValueChange={(value) => handleChange('project_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => handleChange('department', e.target.value)}
                  placeholder="e.g., Radiology"
                />
              </div>
            </div>

            {/* Task Preview Section */}
            {loadingTasks && (
              <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading tasks...</span>
                </div>
              </div>
            )}
            {!loadingTasks && previewTasks.length > 0 && (
              <div className="mt-4 p-3 border rounded-lg bg-muted/50 text-sm">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tasks that will be created</h4>
                <div className="space-y-1">
                  {previewTasks.map((task) => (
                    <div key={task.id} className="grid grid-cols-[60px_1fr_auto] gap-2 items-center py-1.5 border-b last:border-b-0 border-border/50">
                      <Badge
                        variant={task.task_type === 'form_completion' ? 'default' : task.task_type === 'approval_required' ? 'outline' : 'secondary'}
                        className="justify-center text-[10px] h-5"
                      >
                        {task.task_type === 'form_completion'
                          ? 'Form'
                          : task.task_type === 'document_upload'
                          ? 'Upload'
                          : 'Approval'}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{task.task_definition_name}</p>
                      </div>
                      {task.is_required ? (
                        <span className="text-[10px] text-muted-foreground">Required</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60">Optional</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleChange('start_date', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => handleChange('end_date', e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/projects')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Project
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
