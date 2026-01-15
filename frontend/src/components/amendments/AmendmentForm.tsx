import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AmendmentType } from '@/types';

const AMENDMENT_TYPES: { value: AmendmentType; label: string; description: string }[] = [
  {
    value: 'protocol_change',
    label: 'Protocol Change',
    description: 'Changes to study procedures, methods, or protocol',
  },
  {
    value: 'personnel_change',
    label: 'Personnel Change',
    description: 'Changes to study team members or roles',
  },
  {
    value: 'funding_change',
    label: 'Funding Change',
    description: 'Changes to funding sources or budget',
  },
  {
    value: 'site_change',
    label: 'Site Change',
    description: 'Adding or removing study sites',
  },
  {
    value: 'procedure_change',
    label: 'Procedure Change',
    description: 'Changes to specific procedures or interventions',
  },
  {
    value: 'consent_update',
    label: 'Consent Update',
    description: 'Updates to informed consent documents',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other types of changes not listed above',
  },
];

interface AmendmentFormProps {
  initialData?: {
    amendment_type?: AmendmentType;
    description?: string;
  };
  onSubmit: (data: { amendment_type: AmendmentType; description?: string }) => void;
  onCancel: () => void;
  isLoading?: boolean;
  submitLabel?: string;
}

export function AmendmentForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Create Amendment',
}: AmendmentFormProps) {
  const [amendmentType, setAmendmentType] = useState<AmendmentType | ''>(
    initialData?.amendment_type || ''
  );
  const [description, setDescription] = useState(initialData?.description || '');

  const selectedType = AMENDMENT_TYPES.find((t) => t.value === amendmentType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendmentType) return;

    onSubmit({
      amendment_type: amendmentType,
      description: description.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="amendment_type">Amendment Type *</Label>
        <Select
          value={amendmentType}
          onValueChange={(value) => setAmendmentType(value as AmendmentType)}
        >
          <SelectTrigger id="amendment_type">
            <SelectValue placeholder="Select amendment type" />
          </SelectTrigger>
          <SelectContent>
            {AMENDMENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedType && (
          <p className="text-sm text-muted-foreground">{selectedType.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Briefly describe the purpose of this amendment..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <p className="text-sm text-muted-foreground">
          Provide a summary of the changes you plan to make.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={!amendmentType || isLoading}>
          {isLoading ? 'Creating...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
