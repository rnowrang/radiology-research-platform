import { FormFieldInfo } from '@/lib/protocolAssistantApi';
import { FileText } from 'lucide-react';

interface FormFieldPreviewProps {
  formField: FormFieldInfo;
}

export function FormFieldPreview({ formField }: FormFieldPreviewProps) {
  const formTypeLabels: Record<string, string> = {
    irb_initial: 'Initial IRB Application',
    irb_amendment: 'IRB Amendment',
    irb_continuing: 'Continuing Review',
    irb_closure: 'Study Closure',
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">
      <FileText className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-slate-600">
          This will populate:
        </p>
        <p className="font-medium text-slate-900">
          {formTypeLabels[formField.form_type] || formField.form_type} &gt;{' '}
          <span className="capitalize">{formField.section.replace('_', ' ')}</span> &gt;{' '}
          {formField.field_label}
        </p>
      </div>
    </div>
  );
}
