import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  HelpCircle,
  Plus,
  Trash2,
  History,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formsApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { FormInstance, FormField as FormFieldType, FormSchema } from '@/types';

// Field option type
interface FieldOption {
  value: string;
  label: string;
}

// Table config type
interface TableConfig {
  columns: { id: string; label: string }[];
  rows: { id: string; label: string }[];
}

// Repeatable config type
interface RepeatableConfig {
  columns: { id: string; label: string; type?: string }[];
  max_rows?: number;
  add_button_text?: string;
}

// Condition type
interface Condition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty' | 'not_empty';
  value?: any;
}

// Rule type
interface Rule {
  id: string;
  conditions: Condition[];
  then_actions: { action: 'show' | 'hide'; field: string }[];
  else_actions?: { action: 'show' | 'hide'; field: string }[];
}

// Extended field type with all properties
interface ExtendedField extends FormFieldType {
  section_id?: string;
  order?: number;
  visible?: boolean;
  help_text?: string;
  indent?: number;
  group_start?: string;
  group_end?: boolean;
  table_group?: string;
  table_config?: TableConfig;
  table_row?: number;
  table_col?: number;
  column_group?: string;
  column_index?: number;
  repeatable_config?: RepeatableConfig;
}

// Extended schema type
interface ExtendedSchema extends FormSchema {
  fields?: ExtendedField[];
  rules?: Rule[];
}

export function FormEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [form, setForm] = useState<FormInstance | null>(null);
  const [schema, setSchema] = useState<ExtendedSchema | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);

  useEffect(() => {
    if (id) {
      loadForm(parseInt(id));
    }
  }, [id]);

  async function loadForm(formId: number) {
    try {
      const response = await formsApi.get(formId);
      const formInstance = response.data.data;

      // Map snake_case to camelCase for frontend
      const mappedForm = {
        ...formInstance,
        templateId: formInstance.template_id,
        projectId: formInstance.project_id,
        ownerId: formInstance.owner_id,
        currentVersionNumber: formInstance.current_version_number,
        completionPercentage: formInstance.completion_percentage,
        submittedAt: formInstance.submitted_at,
        approvedAt: formInstance.approved_at,
        createdAt: formInstance.created_at,
        updatedAt: formInstance.updated_at,
      };

      setForm(mappedForm);
      setSchema(formInstance.template?.schema || null);
      setFormData(formInstance.data || {});

      // Expand first few sections by default
      if (formInstance.template?.schema?.sections?.length > 0) {
        const firstSections = formInstance.template.schema.sections
          .slice(0, 3)
          .map((s: any) => s.id);
        setExpandedSections(new Set(firstSections));
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

  // Helper to get nested value by dot-notation path (e.g., "personnel.has_alt_contact")
  const getNestedValue = useCallback((obj: any, path: string): any => {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }, []);

  // Compute hidden fields based on rules
  const hiddenFields = useMemo(() => {
    if (!schema) return new Set<string>();

    const newHidden = new Set<string>();

    // First, hide fields that have visible: false by default
    const schemaFields = schema.fields || [];
    schemaFields.forEach((field: ExtendedField) => {
      if (field.visible === false) {
        newHidden.add(field.id);
      }
    });

    // Also check nested fields within sections
    (schema.sections || []).forEach((section: any) => {
      (section.fields || []).forEach((field: ExtendedField) => {
        if (field.visible === false) {
          newHidden.add(field.id);
        }
      });
    });

    // Then evaluate rules
    if (!schema.rules) {
      return newHidden;
    }

    schema.rules.forEach((rule: Rule) => {
      let conditionsMet = true;

      for (const condition of rule.conditions || []) {
        const fieldValue = getNestedValue(formData, condition.field);

        switch (condition.operator) {
          case 'equals':
            conditionsMet = conditionsMet && fieldValue === condition.value;
            break;
          case 'not_equals':
            conditionsMet = conditionsMet && fieldValue !== condition.value;
            break;
          case 'contains':
            if (Array.isArray(fieldValue)) {
              conditionsMet = conditionsMet && fieldValue.includes(condition.value);
            } else if (typeof fieldValue === 'string') {
              conditionsMet = conditionsMet && fieldValue.toLowerCase().includes(String(condition.value).toLowerCase());
            } else {
              conditionsMet = false;
            }
            break;
          case 'is_empty':
            conditionsMet = conditionsMet && (!fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0));
            break;
          case 'is_not_empty':
          case 'not_empty':
            conditionsMet = conditionsMet && fieldValue && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);
            break;
        }
      }

      const actions = conditionsMet ? rule.then_actions : rule.else_actions;

      actions?.forEach((action) => {
        if (action.action === 'hide') {
          newHidden.add(action.field);
        } else if (action.action === 'show') {
          newHidden.delete(action.field);
        }
      });
    });

    return newHidden;
  }, [schema, formData, getNestedValue]);

  // Build field-to-section map from template schema
  const fieldToSectionMap = useMemo(() => {
    const map: Record<string, string> = {};
    form?.template?.schema?.sections?.forEach((section: any) => {
      section.fields?.forEach((field: any) => {
        map[field.id] = field.section_id || section.id;
      });
    });
    return map;
  }, [form?.template?.schema]);

  // Pending changes by section + independent timers
  const [pendingChanges, setPendingChanges] = useState<Map<string, any[]>>(new Map());
  const sectionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingChangesRef = useRef(pendingChanges);

  useEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);

  const getSectionFromFieldId = useCallback((fieldId: string): string => {
    return fieldToSectionMap[fieldId] || 'sec_other';
  }, [fieldToSectionMap]);

  const saveSectionChanges = useCallback(async (sectionId: string) => {
    const changes = pendingChangesRef.current.get(sectionId);
    if (!changes || changes.length === 0) return;

    try {
      setSaving(true);
      await formsApi.updateData(form!.id, {
        section_id: sectionId,
        changes: changes,
        user_id: form!.ownerId,
      });
      setPendingChanges(prev => {
        const updated = new Map(prev);
        updated.delete(sectionId);
        return updated;
      });
      setLastSaved(new Date());
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }, [form?.id, form?.ownerId, toast]);

  const handleFieldChange = useCallback((fieldId: string, value: any, label?: string) => {
    // Update local state immediately
    setFormData(prev => {
      const keys = fieldId.split('.');
      if (keys.length === 1) return { ...prev, [fieldId]: value };
      const newData = { ...prev };
      let parent: any = newData;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!parent[keys[i]]) parent[keys[i]] = {};
        parent = parent[keys[i]];
      }
      parent[keys[keys.length - 1]] = value;
      return newData;
    });

    const sectionId = getSectionFromFieldId(fieldId);

    // Add to pending changes for this section
    setPendingChanges(prev => {
      const updated = new Map(prev);
      const sectionChanges = [...(updated.get(sectionId) || [])];
      const existingIdx = sectionChanges.findIndex(c => c.field_id === fieldId);
      const change = {
        field_id: fieldId,
        field_label: label || fieldId,
        old_value: getNestedValue(formData, fieldId),
        new_value: value,
      };
      if (existingIdx >= 0) sectionChanges[existingIdx] = change;
      else sectionChanges.push(change);
      updated.set(sectionId, sectionChanges);
      return updated;
    });

    // Reset timer for THIS section only
    const existingTimer = sectionTimers.current.get(sectionId);
    if (existingTimer) clearTimeout(existingTimer);
    const newTimer = setTimeout(() => saveSectionChanges(sectionId), 1000);
    sectionTimers.current.set(sectionId, newTimer);
  }, [getSectionFromFieldId, saveSectionChanges, formData, getNestedValue]);

  // Auto-save on unmount/navigation
  useEffect(() => {
    const saveAllPending = () => {
      pendingChangesRef.current.forEach((_, sectionId) => {
        saveSectionChanges(sectionId);
      });
    };
    window.addEventListener('beforeunload', saveAllPending);
    return () => {
      window.removeEventListener('beforeunload', saveAllPending);
      saveAllPending();
    };
  }, [saveSectionChanges]);

  const handleSubmitForReview = async () => {
    if (!form) return;

    try {
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

  const handleCreateVersion = async () => {
    if (!form) return;

    setCreatingVersion(true);
    try {
      await formsApi.createVersion(form.id, versionLabel || undefined);
      toast({
        title: 'Version created',
        description: 'A new version snapshot has been created',
      });
      setShowVersionModal(false);
      setVersionLabel('');
      // Reload form to get updated version number
      loadForm(form.id);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create version',
      });
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleDownload = async (format: 'docx' | 'pdf') => {
    if (!form) return;

    try {
      toast({
        title: 'Generating document...',
        description: 'Please wait while we generate your document',
      });
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

      toast({
        title: 'Document downloaded',
        description: `Your ${format.toUpperCase()} has been downloaded`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate document',
      });
    }
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

  const isFieldVisible = (field: ExtendedField): boolean => {
    return !hiddenFields.has(field.id);
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

  // Get all fields for a section (handles both nested and flat structures)
  const getFieldsForSection = (section: any): ExtendedField[] => {
    // First try nested fields
    if (section.fields && section.fields.length > 0) {
      return section.fields
        .filter((f: ExtendedField) => isFieldVisible(f))
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    }

    // Fall back to flat fields array with section_id
    if (schema?.fields) {
      return schema.fields
        .filter((f: ExtendedField) => f.section_id === section.id && isFieldVisible(f))
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    }

    return [];
  };

  // Render a single field
  const renderField = (field: ExtendedField) => {
    const value = getNestedValue(formData, field.id) ?? field.defaultValue ?? '';

    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <Input
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text'}
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value, field.label)}
            placeholder={field.placeholder}
          />
        );

      case 'textarea':
        return (
          <Textarea
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value, field.label)}
            placeholder={field.placeholder}
            rows={field.rows || 4}
          />
        );

      case 'checkbox':
        // Single checkbox (boolean)
        if (!field.options || field.options.length === 0) {
          return (
            <div className="flex items-center space-x-2">
              <Checkbox
                id={field.id}
                checked={value === true}
                onCheckedChange={(checked) => handleFieldChange(field.id, checked, field.label)}
              />
              <Label htmlFor={field.id} className="text-sm font-normal">
                {field.label}
              </Label>
            </div>
          );
        }
        // Multiple checkboxes (array)
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {(field.options as FieldOption[])?.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`${field.id}-${option.value}`}
                  checked={selectedValues.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const newValue = checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((v: string) => v !== option.value);
                    handleFieldChange(field.id, newValue, field.label);
                  }}
                />
                <Label htmlFor={`${field.id}-${option.value}`} className="text-sm font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        );

      case 'radio':
        return (
          <RadioGroup
            value={value}
            onValueChange={(val) => handleFieldChange(field.id, val, field.label)}
          >
            {(field.options as FieldOption[])?.map((option) => (
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
          <Select value={value} onValueChange={(val) => handleFieldChange(field.id, val, field.label)}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || 'Select an option...'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options as FieldOption[])?.map((option) => (
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
            onChange={(e) => handleFieldChange(field.id, e.target.value, field.label)}
          />
        );

      case 'heading':
        return (
          <h4 className="font-semibold text-lg">
            {field.label}
          </h4>
        );

      case 'paragraph':
        return (
          <p className="text-muted-foreground">
            {field.description || field.label}
          </p>
        );

      case 'repeatable':
        return renderRepeatableField(field, value);

      default:
        return (
          <Input
            id={field.id}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value, field.label)}
            placeholder={field.placeholder}
          />
        );
    }
  };

  // Render repeatable field (dynamic table rows)
  const renderRepeatableField = (field: ExtendedField, value: any) => {
    const rows = Array.isArray(value) ? value : [];
    const config = field.repeatable_config || { columns: [], max_rows: 10 };
    const columns = config.columns || [];

    const addRow = () => {
      if (rows.length < (config.max_rows || 10)) {
        const newRow: Record<string, string> = {};
        columns.forEach((col) => {
          newRow[col.id] = '';
        });
        const newRows = [...rows, newRow];
        handleFieldChange(field.id, newRows, field.label);
      }
    };

    const removeRow = (index: number) => {
      const newRows = rows.filter((_: any, i: number) => i !== index);
      handleFieldChange(field.id, newRows, field.label);
    };

    const updateCell = (rowIndex: number, colId: string, cellValue: string) => {
      const newRows = rows.map((row: any, i: number) =>
        i === rowIndex ? { ...row, [colId]: cellValue } : row
      );
      handleFieldChange(field.id, newRows, field.label);
    };

    return (
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                {columns.map((col) => (
                  <th key={col.id} className="px-3 py-2 text-left text-sm font-medium">
                    {col.label}
                  </th>
                ))}
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, rowIndex: number) => (
                <tr key={rowIndex} className="border-t">
                  {columns.map((col) => (
                    <td key={col.id} className="p-1">
                      <Input
                        type={col.type === 'email' ? 'email' : 'text'}
                        value={row[col.id] || ''}
                        onChange={(e) => updateCell(rowIndex, col.id, e.target.value)}
                        placeholder={col.label}
                        className="border-0 shadow-none focus-visible:ring-1"
                      />
                    </td>
                  ))}
                  <td className="p-1 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(rowIndex)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-muted-foreground text-sm">
                    No rows added yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length < (config.max_rows || 10) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="text-sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            {config.add_button_text || 'Add Row'}
          </Button>
        )}
      </div>
    );
  };

  // Render table group (fixed table structure)
  const renderTableGroup = (
    tableGroup: string,
    tableFields: ExtendedField[]
  ) => {
    const configField = tableFields.find(f => f.table_config);
    if (!configField?.table_config) return null;

    const { columns, rows } = configField.table_config;

    return (
      <div key={`table-${tableGroup}`} className="space-y-3">
        {/* Group header */}
        {configField.group_start && (
          <div className="text-sm font-medium text-muted-foreground pb-1 border-b">
            {configField.group_start}
          </div>
        )}

        {/* Fixed table */}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-medium">
                  Subjects
                </th>
                {columns.map((col) => (
                  <th key={col.id} className="px-3 py-2 text-left text-sm font-medium">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 text-sm bg-muted/30 font-medium">
                    {row.label}
                  </td>
                  {columns.map((col, colIndex) => {
                    const cellField = tableFields.find(
                      f => f.table_row === rowIndex && f.table_col === colIndex
                    );
                    if (!cellField) return <td key={col.id} className="p-1" />;

                    const cellValue = getNestedValue(formData, cellField.id) || '';
                    return (
                      <td key={col.id} className="p-1">
                        <Input
                          type="text"
                          value={cellValue}
                          onChange={(e) => handleFieldChange(cellField.id, e.target.value, cellField.label)}
                          placeholder={col.label}
                          className="border-0 shadow-none focus-visible:ring-1"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render column group (multi-column layout)
  const renderColumnGroup = (
    columnGroup: string,
    colFields: ExtendedField[]
  ) => {
    const firstField = colFields.find(f => f.group_start);

    // Group fields by column_index
    const columnMap = new Map<number, ExtendedField[]>();
    colFields.forEach(f => {
      const colIdx = f.column_index ?? 0;
      if (!columnMap.has(colIdx)) {
        columnMap.set(colIdx, []);
      }
      columnMap.get(colIdx)!.push(f);
    });

    const columnCount = Math.max(...Array.from(columnMap.keys())) + 1;

    return (
      <div key={`columns-${columnGroup}`} className="space-y-3">
        {/* Group header */}
        {firstField?.group_start && (
          <div className="text-sm font-medium text-muted-foreground pb-1 border-b">
            {firstField.group_start}
          </div>
        )}

        {/* Multi-column layout */}
        <div className={cn(
          'grid gap-4',
          columnCount === 3 ? 'grid-cols-1 md:grid-cols-3' :
          columnCount === 2 ? 'grid-cols-1 md:grid-cols-2' :
          'grid-cols-1'
        )}>
          {Array.from({ length: columnCount }, (_, colIdx) => {
            const fieldsInCol = columnMap.get(colIdx) || [];
            return (
              <div key={colIdx} className="rounded-lg border bg-muted/20 p-3 space-y-4">
                {fieldsInCol.map((colField) => (
                  <div key={colField.id}>
                    {renderFieldWithLabel(colField)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render field with label and help text
  const renderFieldWithLabel = (field: ExtendedField) => {
    // For checkbox without options, the label is inline
    if (field.type === 'checkbox' && (!field.options || field.options.length === 0)) {
      return renderField(field);
    }

    // For heading/paragraph, no label wrapper needed
    if (field.type === 'heading' || field.type === 'paragraph') {
      return renderField(field);
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={field.id}>
            {field.label}
            {field.required && (
              <span className="ml-1 text-destructive">*</span>
            )}
          </Label>
          {field.help_text && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{field.help_text}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {field.description && (
          <p className="text-sm text-muted-foreground">
            {field.description}
          </p>
        )}
        {renderField(field)}
      </div>
    );
  };

  // Render section content with groupings
  const renderSectionContent = (section: any) => {
    const sectionFields = getFieldsForSection(section);

    if (sectionFields.length === 0) return null;

    // Group fields by table_group and column_group
    const tableGroups = new Map<string, ExtendedField[]>();
    const columnGroups = new Map<string, ExtendedField[]>();
    const renderedTableGroups = new Set<string>();
    const renderedColumnGroups = new Set<string>();

    sectionFields.forEach((field: ExtendedField) => {
      if (field.table_group) {
        if (!tableGroups.has(field.table_group)) {
          tableGroups.set(field.table_group, []);
        }
        tableGroups.get(field.table_group)!.push(field);
      }
      if (field.column_group) {
        if (!columnGroups.has(field.column_group)) {
          columnGroups.set(field.column_group, []);
        }
        columnGroups.get(field.column_group)!.push(field);
      }
    });

    return (
      <div className="space-y-6">
        {sectionFields.map((field: ExtendedField, index: number) => {
          // If this field is part of a table group
          if (field.table_group) {
            if (renderedTableGroups.has(field.table_group)) {
              return null; // Skip - already rendered
            }
            renderedTableGroups.add(field.table_group);
            const tableFields = tableGroups.get(field.table_group) || [];
            return renderTableGroup(field.table_group, tableFields);
          }

          // If this field is part of a column group
          if (field.column_group) {
            if (renderedColumnGroups.has(field.column_group)) {
              return null; // Skip - already rendered
            }
            renderedColumnGroups.add(field.column_group);
            const colFields = columnGroups.get(field.column_group) || [];
            return renderColumnGroup(field.column_group, colFields);
          }

          // Regular field rendering
          const indent = field.indent || 0;
          const showGroupStart = field.group_start;
          const showGroupEnd = field.group_end ||
            (index < sectionFields.length - 1 && (sectionFields[index + 1] as ExtendedField).group_start);

          return (
            <div key={field.id}>
              {/* Group header */}
              {showGroupStart && (
                <div className="text-sm font-medium text-muted-foreground mb-3 mt-2 pb-1 border-b">
                  {field.group_start}
                </div>
              )}

              {/* Field with indentation */}
              <div
                className={cn(
                  indent > 0 && 'ml-6 pl-4 border-l-2 border-muted',
                  indent > 1 && 'ml-12'
                )}
              >
                {renderFieldWithLabel(field)}
              </div>

              {/* Group end spacing */}
              {showGroupEnd && (
                <div className="mt-4 mb-2" />
              )}
            </div>
          );
        })}
      </div>
    );
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
            {saving && (
              <span className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Saving...
              </span>
            )}
            {lastSaved && !saving && (
              <span className="flex items-center text-sm text-muted-foreground">
                <Clock className="mr-1 h-4 w-4" />
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowVersionModal(true)}>
            <History className="mr-2 h-4 w-4" />
            Save Version
          </Button>
          <Button variant="outline" onClick={() => handleDownload('pdf')}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" onClick={() => handleDownload('docx')}>
            <Download className="mr-2 h-4 w-4" />
            DOCX
          </Button>
          {isEditable && (
            <Button onClick={handleSubmitForReview}>
              <Send className="mr-2 h-4 w-4" />
              Submit for Review
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Progress value={form.completionPercentage} className="flex-1" />
        <span className="text-sm font-medium">{form.completionPercentage}% complete</span>
      </div>

      <div className="space-y-4">
        {(schema.sections || [])
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((section: any) => {
            const sectionFields = getFieldsForSection(section);
            const isExpanded = expandedSections.has(section.id);

            // Hide sections with no visible fields
            if (sectionFields.length === 0) return null;

            return (
              <Card key={section.id}>
                <Collapsible
                  open={isExpanded}
                  onOpenChange={() => toggleSection(section.id)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <CardTitle className="text-lg">{section.title}</CardTitle>
                            {section.description && (
                              <CardDescription>{section.description}</CardDescription>
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {sectionFields.length} field{sectionFields.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      {renderSectionContent(section)}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
      </div>

      {/* Version Modal */}
      <Dialog open={showVersionModal} onOpenChange={setShowVersionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Version</DialogTitle>
            <DialogDescription>
              Create a named snapshot of your current progress
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="versionLabel">Version Label (optional)</Label>
            <Input
              id="versionLabel"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g., Draft before adding personnel"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateVersion} disabled={creatingVersion}>
              {creatingVersion ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
