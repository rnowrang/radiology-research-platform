import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { protocolAssistantApi, FilledField, FillFormRequest } from '@/lib/protocolAssistantApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface FormFillPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  templateId: number;
  templateName: string;
  formId?: number;
}

const confidenceColors: Record<string, { badge: string; bg: string }> = {
  high: { badge: 'bg-green-100 text-green-800 border-green-200', bg: 'bg-green-50' },
  medium: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', bg: 'bg-yellow-50' },
  low: { badge: 'bg-red-100 text-red-800 border-red-200', bg: 'bg-red-50' },
};

function FieldRow({ field }: { field: FilledField }) {
  const colors = confidenceColors[field.confidence_level] || confidenceColors.low;

  return (
    <div className={cn('p-3 rounded-lg border', colors.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{field.field_label}</span>
            <Badge variant="outline" className={cn('text-xs', colors.badge)}>
              {Math.round(field.confidence * 100)}% confident
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground break-words">
            {typeof field.value === 'string'
              ? field.value
              : JSON.stringify(field.value)}
          </p>
        </div>
        {field.evidence && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-xs">
                  <strong>Source:</strong> {field.source}
                </p>
                <p className="text-xs mt-1">{field.evidence}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export function FormFillPreviewModal({
  open,
  onOpenChange,
  projectId,
  templateId,
  templateName,
  formId,
}: FormFillPreviewModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  // Fetch preview data
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['formFillPreview', projectId, templateId],
    queryFn: () => protocolAssistantApi.previewFormFill(projectId, templateId),
    enabled: open && !!projectId && !!templateId,
  });

  // Fill form mutation
  const fillFormMutation = useMutation({
    mutationFn: (request: FillFormRequest) =>
      protocolAssistantApi.fillFormByProject(projectId, request),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form', data.form_id] });
      toast({
        title: 'Form filled successfully',
        description: `${data.filled_fields.length} fields were populated.`,
      });
      onOpenChange(false);
      navigate(`/forms/${data.form_id}`);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to fill form',
        description: error.message,
      });
    },
  });

  const handleFillAll = () => {
    fillFormMutation.mutate({
      template_id: templateId,
      form_id: formId,
      fill_mode: 'all',
      create_if_missing: !formId,
    });
  };

  const handleFillHighConfidence = () => {
    fillFormMutation.mutate({
      template_id: templateId,
      form_id: formId,
      fill_mode: 'high_confidence',
      create_if_missing: !formId,
    });
  };

  // Filter fields by confidence
  const highConfidenceFields = preview?.fields.filter(f => f.confidence_level === 'high') || [];
  const mediumConfidenceFields = preview?.fields.filter(f => f.confidence_level === 'medium') || [];
  const lowConfidenceFields = preview?.fields.filter(f => f.confidence_level === 'low') || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Form Fill Preview
          </DialogTitle>
          <DialogDescription>
            Preview what fields will be auto-filled for "{templateName}"
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-destructive">Failed to load preview</p>
          </div>
        )}

        {preview && (
          <>
            {/* Summary Stats */}
            <div className="flex gap-4 mb-4">
              <div className="flex-1 p-3 rounded-lg bg-muted/50 text-center">
                <div className="text-2xl font-bold">{preview.fill_rate}%</div>
                <div className="text-xs text-muted-foreground">Fill Rate</div>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                <div className="text-2xl font-bold text-green-700">
                  {preview.high_confidence_count}
                </div>
                <div className="text-xs text-green-600">High Confidence</div>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-center">
                <div className="text-2xl font-bold text-yellow-700">
                  {preview.medium_confidence_count}
                </div>
                <div className="text-xs text-yellow-600">Medium</div>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                <div className="text-2xl font-bold text-red-700">
                  {preview.low_confidence_count}
                </div>
                <div className="text-xs text-red-600">Needs Review</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Fields to fill</span>
                <span>
                  {preview.fillable_fields} of {preview.total_fields}
                </span>
              </div>
              <Progress value={preview.fill_rate} className="h-2" />
            </div>

            {/* Fields Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">
                  All ({preview.fields.length})
                </TabsTrigger>
                <TabsTrigger value="high">
                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                  High ({highConfidenceFields.length})
                </TabsTrigger>
                <TabsTrigger value="medium">
                  Medium ({mediumConfidenceFields.length})
                </TabsTrigger>
                <TabsTrigger value="low">
                  <AlertCircle className="h-3 w-3 mr-1 text-red-600" />
                  Review ({lowConfidenceFields.length})
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 mt-4" style={{ height: '300px' }}>
                <TabsContent value="all" className="space-y-2 mt-0">
                  {preview.fields.map((field) => (
                    <FieldRow key={field.field_id} field={field} />
                  ))}
                </TabsContent>
                <TabsContent value="high" className="space-y-2 mt-0">
                  {highConfidenceFields.map((field) => (
                    <FieldRow key={field.field_id} field={field} />
                  ))}
                  {highConfidenceFields.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No high confidence fields
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="medium" className="space-y-2 mt-0">
                  {mediumConfidenceFields.map((field) => (
                    <FieldRow key={field.field_id} field={field} />
                  ))}
                  {mediumConfidenceFields.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No medium confidence fields
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="low" className="space-y-2 mt-0">
                  {lowConfidenceFields.map((field) => (
                    <FieldRow key={field.field_id} field={field} />
                  ))}
                  {lowConfidenceFields.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No low confidence fields
                    </p>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {preview && highConfidenceFields.length > 0 && (
            <Button
              variant="outline"
              onClick={handleFillHighConfidence}
              disabled={fillFormMutation.isPending}
            >
              {fillFormMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Fill High Confidence Only
            </Button>
          )}
          {preview && (
            <Button onClick={handleFillAll} disabled={fillFormMutation.isPending}>
              {fillFormMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Fill All Fields
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
