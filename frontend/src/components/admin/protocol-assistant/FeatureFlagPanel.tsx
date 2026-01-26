import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info, RefreshCw } from 'lucide-react';
import { protocolAssistantAdminApi } from '@/lib/protocolAssistantAdminApi';
import { toast } from '@/hooks/useToast';

// Categories with their display colors
const categoryColors: Record<string, string> = {
  ai: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  ux: 'bg-green-100 text-green-800',
  generation: 'bg-yellow-100 text-yellow-800',
  beta: 'bg-orange-100 text-orange-800',
};

export function FeatureFlagPanel() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Fetch flags
  const { data: flagsData, isLoading, refetch } = useQuery({
    queryKey: ['pa-feature-flags', categoryFilter],
    queryFn: () => protocolAssistantAdminApi.getFeatureFlags(categoryFilter || undefined),
  });

  // Update flag mutation
  const updateMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      protocolAssistantAdminApi.updateFeatureFlag(name, { is_enabled: enabled }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pa-feature-flags'] });
      toast({ title: 'Success', description: `Flag "${variables.name}" ${variables.enabled ? 'enabled' : 'disabled'}` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update flag', variant: 'destructive' });
    },
  });

  const flags = flagsData?.data?.flags ?? {};

  // Group flags by inferred category
  const groupedFlags = Object.entries(flags).reduce((acc, [name, enabled]) => {
    // Infer category from flag name
    let category = 'other';
    if (name.includes('search') || name.includes('rag') || name.includes('llm')) {
      category = 'ai';
    } else if (name.includes('export') || name.includes('report') || name.includes('cost')) {
      category = 'admin';
    } else if (name.includes('stream') || name.includes('ui')) {
      category = 'ux';
    } else if (name.includes('generation') || name.includes('bulk')) {
      category = 'generation';
    }

    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({ name, enabled });
    return acc;
  }, {} as Record<string, Array<{ name: string; enabled: boolean }>>);

  const handleToggle = (name: string, currentValue: boolean) => {
    updateMutation.mutate({ name, enabled: !currentValue });
  };

  const formatFlagName = (name: string) => {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Feature Flags</h2>
          <p className="text-sm text-muted-foreground">
            Toggle features on/off for the Protocol Assistant
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={categoryFilter || '__all__'} onValueChange={(v) => setCategoryFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              <SelectItem value="ai">AI</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="ux">UX</SelectItem>
              <SelectItem value="generation">Generation</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Flags by Category */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading flags...</div>
      ) : Object.keys(flags).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No feature flags found. Run the seed command to create default flags.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedFlags).map(([category, categoryFlags]) => (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge className={categoryColors[category] || 'bg-gray-100 text-gray-800'}>
                    {category.toUpperCase()}
                  </Badge>
                  <span className="text-muted-foreground font-normal">
                    ({categoryFlags.length} flags)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categoryFlags.map(({ name, enabled }) => (
                    <div
                      key={name}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => handleToggle(name, enabled)}
                          disabled={updateMutation.isPending}
                        />
                        <div>
                          <Label className="cursor-pointer" htmlFor={name}>
                            {formatFlagName(name)}
                          </Label>
                          <p className="text-xs text-muted-foreground">{name}</p>
                        </div>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Info className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Click to see flag details and overrides</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Enable all AI flags
              Object.entries(flags)
                .filter(([name]) => name.includes('semantic') || name.includes('rag'))
                .forEach(([name, enabled]) => {
                  if (!enabled) {
                    updateMutation.mutate({ name, enabled: true });
                  }
                });
            }}
          >
            Enable AI Features
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Disable beta flags
              Object.entries(flags)
                .filter(([name]) => name.includes('beta') || name.includes('experimental'))
                .forEach(([name, enabled]) => {
                  if (enabled) {
                    updateMutation.mutate({ name, enabled: false });
                  }
                });
            }}
          >
            Disable Beta Features
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default FeatureFlagPanel;
