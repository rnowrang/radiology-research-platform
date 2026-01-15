import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save,
  Download,
  Send,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { formsApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { FormInstance, FormSection, FormField, FormSchema } from '@/types';

export function FormEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [form, setForm] = useState<FormInstance | null>(null);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [conditionalState, setConditionalState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    if (id) {
      loadForm(parseInt(id));
    }
  }, [id]);

  async function loadForm(formId: number) {
    try {
      const response = await formsApi.get(formId);
      const formInstance = response.data;
      setForm(formInstance);
      setSchema(formInstance.template?.schema || null);
      setFormData(formInstance.data?.data || {});
      setConditionalState(formInstance.data?.conditionalState || {});

      // Expand first section by default
      if (formInstance.template?.schema?.sections?.length > 0) {
        setExpandedSections(new Set([formInstance.template.schema.sections[0].id]));
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load form',
      });
      navigate('/forms');
    } finally {
      setLoading(false);
    }
  }

  const saveForm = useCallback(async () => {
    if (!form) return;

    setSaving(true);
    try {
      await formsApi.updateData(form.id, {
        data: formData,
        conditionalState,
      });
      setLastSaved(new Date());
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save changes',
      });
    } finally {
      setSaving(false);
    }
  }, [form, formData, conditionalState, toast]);

  // Auto-save with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (form && Object.keys(formData).length > 0) {
        saveForm();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [formData, form, saveForm]);

  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));

    // Update conditional visibility
    updateConditionalState(fieldId, value);
  };

  const updateConditionalState = (changedFieldId: string, newValue: any) => {
    if (!schema) return;

    const newConditionalState: Record<string, boolean> = {};

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.condition) {
          const conditionMet = evaluateCondition(field.condition, {
            ...formData,
            [changedFieldId]: newValue,
          });
          newConditionalState[field.id] = conditionMet;
        }
      });
    });

    setConditionalState(newConditionalState);
  };

  const evaluateCondition = (
    condition: { field: string; operator: string; value?: any },
    data: Record<string, any>
  ): boolean => {
    const fieldValue = data[condition.field];

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'notEquals':
        return fieldValue !== condition.value;
      case 'contains':
        return Array.isArray(fieldValue)
          ? fieldValue.includes(condition.value)
          : String(fieldValue).includes(String(condition.value));
      case 'isEmpty':
        return !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
      case 'isNotEmpty':
        return !!fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0);
      default:
        return true;
    }
  };

  const isFieldVisible = (field: FormField): boolean => {
    if (!field.condition) return true;
    return conditionalState[field.id] !== false;
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const handleSubmitForReview = async () => {
    if (!form) return;

    try {
      await saveForm();
      await formsApi.submitForReview(form.id);
      toast({
        title: 'Submitted for review',
        description: 'Your form has been submitted for review',
      });
      navigate('/forms');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to submit form',
      });
    }
  };

  const handleDownload = async (format: 'docx' | 'pdf') => {
    if (!form) return;

    try {
      await saveForm();
      await formsApi.generateDocuments(form.id);
      const response = await formsApi.downloadDocument(form.id, format);

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.title}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate document',
      });
    }
  };

  const renderField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;

    const value = formData[field.id] ?? field.defaultValue ?? '';

    switch (field.type) {
      case 'text':
      case 'email':
      case 'number':
        return (
          <Input
            type={field.type}
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            className={cn(field.indent && `ml-${field.indent * 4}`)}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={field.rows || 4}
            className={cn(field.indent && `ml-${field.indent * 4}`)}
          />
        );

      case 'checkbox':
        return (
          <div className={cn('flex items-center space-x-2', field.indent && `ml-${field.indent * 4}`)}>
            <Checkbox
              id={field.id}
              checked={value === true}
              onCheckedChange={(checked) => handleFieldChange(field.id, checked)}
            />
            <Label htmlFor={field.id} className="text-sm font-normal">
              {field.label}
            </Label>
          </div>
        );

      case 'radio':
        return (
          <RadioGroup
            value={value}
            onValueChange={(val) => handleFieldChange(field.id, val)}
            className={cn(field.indent && `ml-${field.indent * 4}`)}
          >
            {field.options?.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={`${field.id}-${option.value}`} />
                <Label htmlFor={`${field.id}-${option.value}`} className="font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'select':
        return (
          <Select value={value} onValueChange={(val) => handleFieldChange(field.id, val)}>
            <SelectTrigger className={cn(field.indent && `ml-${field.indent * 4}`)}>
              <SelectValue placeholder={field.placeholder || 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'date':
        return (
          <Input
            type="date"
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={cn(field.indent && `ml-${field.indent * 4}`)}
          />
        );

      case 'heading':
        return (
          <h4 className={cn('font-semibold text-lg', field.indent && `ml-${field.indent * 4}`)}>
            {field.label}
          </h4>
        );

      case 'paragraph':
        return (
          <p className={cn('text-muted-foreground', field.indent && `ml-${field.indent * 4}`)}>
            {field.description || field.label}
          </p>
        );

      default:
        return (
          <Input
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
        );
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
      draft: 'secondary',
      in_review: 'warning',
      needs_changes: 'destructive',
      approved: 'success',
      locked: 'default',
    };
    return <Badge variant={variants[status] || 'default'}>{status.replace('_', ' ')}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!form || !schema) {
    return (
      <div className="flex h-64 flex-col items-center justify-center">
        <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Form not found</p>
      </div>
    );
  }

  const isEditable = form.status === 'draft' || form.status === 'needs_changes';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{form.title}</h1>
          <div className="mt-2 flex items-center gap-4">
            {getStatusBadge(form.status)}
            <span className="text-sm text-muted-foreground">
              Version {form.currentVersionNumber}
            </span>
            {lastSaved && (
              <span className="flex items-center text-sm text-muted-foreground">
                <Clock className="mr-1 h-4 w-4" />
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => handleDownload('pdf')}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" onClick={() => handleDownload('docx')}>
            <Download className="mr-2 h-4 w-4" />
            DOCX
          </Button>
          {isEditable && (
            <>
              <Button variant="outline" onClick={saveForm} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
              <Button onClick={handleSubmitForReview}>
                <Send className="mr-2 h-4 w-4" />
                Submit for Review
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Progress value={form.completionPercentage} className="flex-1" />
        <span className="text-sm font-medium">{form.completionPercentage}% complete</span>
      </div>

      <div className="space-y-4">
        {schema.sections.map((section) => (
          <Card key={section.id}>
            <Collapsible
              open={expandedSections.has(section.id)}
              onOpenChange={() => toggleSection(section.id)}
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      {section.description && (
                        <CardDescription>{section.description}</CardDescription>
                      )}
                    </div>
                    {expandedSections.has(section.id) ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-6">
                  {section.fields.map((field) => {
                    if (!isFieldVisible(field)) return null;

                    if (field.type === 'checkbox' || field.type === 'heading' || field.type === 'paragraph') {
                      return (
                        <div key={field.id}>
                          {renderField(field)}
                        </div>
                      );
                    }

                    return (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={field.id}>
                          {field.label}
                          {field.required && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                        </Label>
                        {field.description && (
                          <p className="text-sm text-muted-foreground">
                            {field.description}
                          </p>
                        )}
                        {renderField(field)}
                      </div>
                    );
                  })}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
}
