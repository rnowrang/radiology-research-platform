import { useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FileText,
  FilePlus,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormTemplate {
  id: number;
  name: string;
  fieldCount: number;
}

interface ExistingForm {
  id: number;
  name: string;
  fieldCount: number;
  status: string;
}

interface PrefillPreview {
  fields: Array<{ name: string; value: string }>;
}

interface FormTemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: number) => void;
  onSelectExisting: (formId: number) => void;
  templates: FormTemplate[];
  existingForms: ExistingForm[];
  prefillPreview?: PrefillPreview;
  isLoading?: boolean;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 border-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  submitted: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

export function FormTemplatePicker({
  open,
  onClose,
  onSelectTemplate,
  onSelectExisting,
  templates,
  existingForms,
  prefillPreview,
  isLoading = false,
}: FormTemplatePickerProps) {
  const [selectedType, setSelectedType] = useState<'template' | 'existing' | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const handleSelect = (type: 'template' | 'existing', id: number) => {
    setSelectedType(type);
    setSelectedId(id);
  };

  const handleConfirm = () => {
    if (selectedId === null || selectedType === null) return;

    if (selectedType === 'template') {
      onSelectTemplate(selectedId);
    } else {
      onSelectExisting(selectedId);
    }
  };

  const handleClose = () => {
    setSelectedType(null);
    setSelectedId(null);
    onClose();
  };

  const draftForms = existingForms.filter(
    (form) => form.status === 'draft' || form.status === 'in_progress'
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Select Form to Pre-fill
          </DialogTitle>
          <DialogDescription>
            Choose a form template to create a new form, or select an existing draft to
            update with your protocol answers.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-6 py-4">
            {/* Create New Form Section */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <FilePlus className="h-4 w-4" />
                Create New Form
              </h4>
              <div className="space-y-2">
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
                    No form templates available
                  </p>
                ) : (
                  templates.map((template) => (
                    <TooltipProvider key={template.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleSelect('template', template.id)}
                            className={cn(
                              'flex items-center justify-between w-full p-3 rounded-lg border transition-colors text-left',
                              selectedType === 'template' && selectedId === template.id
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'hover:bg-muted/50'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded bg-muted">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{template.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {template.fieldCount} fields will be populated
                                </p>
                              </div>
                            </div>
                            {selectedType === 'template' && selectedId === template.id && (
                              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                            {!(selectedType === 'template' && selectedId === template.id) && (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          {prefillPreview && prefillPreview.fields.length > 0 ? (
                            <div className="space-y-1">
                              <p className="font-medium text-xs mb-2">Fields to populate:</p>
                              {prefillPreview.fields.slice(0, 5).map((field, idx) => (
                                <div key={idx} className="text-xs">
                                  <span className="font-medium">{field.name}:</span>{' '}
                                  <span className="text-muted-foreground">
                                    {field.value.length > 50
                                      ? `${field.value.slice(0, 50)}...`
                                      : field.value}
                                  </span>
                                </div>
                              ))}
                              {prefillPreview.fields.length > 5 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  +{prefillPreview.fields.length - 5} more fields
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs">Click to select this template</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))
                )}
              </div>
            </div>

            {/* Pre-fill Existing Section */}
            {draftForms.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Pre-fill Existing Draft
                </h4>
                <div className="space-y-2">
                  {draftForms.map((form) => (
                    <TooltipProvider key={form.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleSelect('existing', form.id)}
                            className={cn(
                              'flex items-center justify-between w-full p-3 rounded-lg border transition-colors text-left',
                              selectedType === 'existing' && selectedId === form.id
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'hover:bg-muted/50'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded bg-muted">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{form.name}</p>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-xs capitalize',
                                      statusColors[form.status]
                                    )}
                                  >
                                    {form.status.replace(/_/g, ' ')}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {form.fieldCount} fields will be updated
                                </p>
                              </div>
                            </div>
                            {selectedType === 'existing' && selectedId === form.id && (
                              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                            {!(selectedType === 'existing' && selectedId === form.id) && (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          {prefillPreview && prefillPreview.fields.length > 0 ? (
                            <div className="space-y-1">
                              <p className="font-medium text-xs mb-2">Fields to update:</p>
                              {prefillPreview.fields.slice(0, 5).map((field, idx) => (
                                <div key={idx} className="text-xs">
                                  <span className="font-medium">{field.name}:</span>{' '}
                                  <span className="text-muted-foreground">
                                    {field.value.length > 50
                                      ? `${field.value.slice(0, 50)}...`
                                      : field.value}
                                  </span>
                                </div>
                              ))}
                              {prefillPreview.fields.length > 5 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  +{prefillPreview.fields.length - 5} more fields
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs">Click to select this form</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedId === null || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pre-filling...
              </>
            ) : (
              'Confirm Selection'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
