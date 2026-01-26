import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Pause, Plus, GitCompare, CheckCircle, XCircle } from 'lucide-react';
import { protocolAssistantAdminApi, PromptVersion } from '@/lib/protocolAssistantAdminApi';
import { toast } from '@/hooks/useToast';

export function PromptManagement() {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState({
    name: '',
    content: '',
    description: '',
  });
  const [abTestPercentage, setAbTestPercentage] = useState(50);

  // Fetch prompt keys
  const { data: keysData } = useQuery({
    queryKey: ['pa-prompt-keys'],
    queryFn: () => protocolAssistantAdminApi.getPromptKeys(),
  });

  // Fetch versions for selected key
  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ['pa-prompt-versions', selectedKey],
    queryFn: () => protocolAssistantAdminApi.getPromptVersions(selectedKey),
    enabled: !!selectedKey,
  });

  // Mutations
  const activateMutation = useMutation({
    mutationFn: ({ versionId, percentage }: { versionId: number; percentage: number }) =>
      protocolAssistantAdminApi.activatePrompt(versionId, percentage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pa-prompt-versions', selectedKey] });
      toast({ title: 'Success', description: 'Prompt version activated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to activate prompt', variant: 'destructive' });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (versionId: number) => protocolAssistantAdminApi.deactivatePrompt(versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pa-prompt-versions', selectedKey] });
      toast({ title: 'Success', description: 'Prompt version deactivated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to deactivate prompt', variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { prompt_key: string; content: string; name?: string; description?: string }) =>
      protocolAssistantAdminApi.createPromptVersion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pa-prompt-versions', selectedKey] });
      setCreateDialogOpen(false);
      setNewPrompt({ name: '', content: '', description: '' });
      toast({ title: 'Success', description: 'New prompt version created' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create prompt version', variant: 'destructive' });
    },
  });

  const promptKeys = keysData?.data?.prompt_keys ?? [];
  const versions = versionsData?.data?.versions ?? [];

  const handleCreate = () => {
    if (!selectedKey || !newPrompt.content.trim()) {
      toast({ title: 'Error', description: 'Please select a prompt key and enter content', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      prompt_key: selectedKey,
      content: newPrompt.content,
      name: newPrompt.name || undefined,
      description: newPrompt.description || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Prompt Key Selector */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-xs">
          <Label htmlFor="prompt-key">Prompt Key</Label>
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger id="prompt-key">
              <SelectValue placeholder="Select a prompt" />
            </SelectTrigger>
            <SelectContent>
              {promptKeys.map((key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!selectedKey}>
              <Plus className="h-4 w-4 mr-2" />
              New Version
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Version</DialogTitle>
              <DialogDescription>
                Create a new version of the {selectedKey} prompt
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="version-name">Version Name (optional)</Label>
                <Input
                  id="version-name"
                  value={newPrompt.name}
                  onChange={(e) => setNewPrompt({ ...newPrompt, name: e.target.value })}
                  placeholder="e.g., 'Improved clarity'"
                />
              </div>
              <div>
                <Label htmlFor="version-content">Prompt Content</Label>
                <Textarea
                  id="version-content"
                  value={newPrompt.content}
                  onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
                  placeholder="Enter the prompt template..."
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label htmlFor="version-description">Description (optional)</Label>
                <Textarea
                  id="version-description"
                  value={newPrompt.description}
                  onChange={(e) => setNewPrompt({ ...newPrompt, description: e.target.value })}
                  placeholder="Describe the changes..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Version'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* A/B Test Controls */}
      {selectedKey && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">A/B Testing</CardTitle>
            <CardDescription>
              Set traffic percentage for gradual rollout
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <input
                type="range"
                value={abTestPercentage}
                onChange={(e) => setAbTestPercentage(Number(e.target.value))}
                min={0}
                max={100}
                step={5}
                className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
              />
              <span className="w-16 text-right font-mono">{abTestPercentage}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Versions List */}
      {selectedKey && (
        <Card>
          <CardHeader>
            <CardTitle>Versions</CardTitle>
            <CardDescription>
              Manage prompt versions for {selectedKey}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {versionsLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading versions...</div>
            ) : versions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No versions found</div>
            ) : (
              <div className="space-y-4">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`p-4 border rounded-lg ${
                      version.is_active ? 'border-green-500 bg-green-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">v{version.version}</span>
                          {version.name && (
                            <span className="text-muted-foreground">- {version.name}</span>
                          )}
                          {version.is_active && (
                            <Badge variant="default" className="bg-green-600">
                              Active ({version.traffic_percentage}%)
                            </Badge>
                          )}
                          {version.is_default && (
                            <Badge variant="secondary">Default</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Created: {new Date(version.created_at).toLocaleDateString()}
                        </p>
                        {version.sample_count > 0 && (
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            <span>
                              Quality: {version.avg_quality_score?.toFixed(1) ?? 'N/A'}
                            </span>
                            <span>
                              Success: {((version.success_rate ?? 0) * 100).toFixed(0)}%
                            </span>
                            <span>Samples: {version.sample_count}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {version.is_active ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deactivateMutation.mutate(version.id)}
                            disabled={deactivateMutation.isPending}
                          >
                            <Pause className="h-4 w-4 mr-1" />
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              activateMutation.mutate({
                                versionId: version.id,
                                percentage: abTestPercentage,
                              })
                            }
                            disabled={activateMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Activate
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Prompt Preview */}
                    <div className="mt-3">
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          View prompt content
                        </summary>
                        <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap">
                          {version.content}
                        </pre>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!selectedKey && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a prompt key to manage versions
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PromptManagement;
