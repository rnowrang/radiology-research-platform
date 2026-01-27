import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type AnswerType = 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'boolean';

interface AnswerInputProps {
  type: AnswerType;
  options?: string[];
  initialValue?: string | number | boolean | string[];
  placeholder?: string;
  onSubmit: (value: string | number | boolean | string[]) => void;
  isSubmitting?: boolean;
  className?: string;
}

export function AnswerInput({
  type,
  options = [],
  initialValue,
  placeholder = 'Enter your answer...',
  onSubmit,
  isSubmitting = false,
  className,
}: AnswerInputProps) {
  const [value, setValue] = useState<string | number | boolean | string[]>(initialValue || getDefaultValue(type));

  // Update value when initialValue changes
  useEffect(() => {
    if (initialValue !== undefined) {
      setValue(initialValue);
    }
  }, [initialValue]);

  const handleSubmit = () => {
    if (isValidValue(value, type)) {
      onSubmit(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderInput = () => {
    switch (type) {
      case 'text':
        return (
          <div className="space-y-2">
            <Textarea
              value={value as string}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="min-h-[100px] resize-none"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Press Cmd+Enter to submit
            </p>
          </div>
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value as number}
            onChange={(e) => setValue(e.target.valueAsNumber || 0)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isSubmitting}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value as string}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
        );

      case 'boolean':
        return (
          <RadioGroup
            value={value === true ? 'yes' : value === false ? 'no' : ''}
            onValueChange={(v) => setValue(v === 'yes')}
            disabled={isSubmitting}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="yes" />
              <Label htmlFor="yes">Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="no" />
              <Label htmlFor="no">No</Label>
            </div>
          </RadioGroup>
        );

      case 'select':
        return (
          <Select
            value={value as string}
            onValueChange={(v) => setValue(v)}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an option..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multiselect':
        return (
          <div className="space-y-2">
            {options.map((option) => {
              const selectedValues = (value as string[]) || [];
              const isChecked = selectedValues.includes(option);
              return (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={option}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setValue([...selectedValues, option]);
                      } else {
                        setValue(selectedValues.filter((v) => v !== option));
                      }
                    }}
                    disabled={isSubmitting}
                  />
                  <Label htmlFor={option} className="cursor-pointer">
                    {option}
                  </Label>
                </div>
              );
            })}
          </div>
        );

      default:
        return (
          <Input
            value={value as string}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isSubmitting}
          />
        );
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {renderInput()}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!isValidValue(value, type) || isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Submit Answer
        </Button>
      </div>
    </div>
  );
}

function getDefaultValue(type: AnswerType): string | number | boolean | string[] {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'multiselect':
      return [];
    default:
      return '';
  }
}

function isValidValue(value: string | number | boolean | string[], type: AnswerType): boolean {
  switch (type) {
    case 'text':
    case 'date':
    case 'select':
      return typeof value === 'string' && value.trim().length > 0;
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'multiselect':
      return Array.isArray(value) && value.length > 0;
    default:
      return true;
  }
}
