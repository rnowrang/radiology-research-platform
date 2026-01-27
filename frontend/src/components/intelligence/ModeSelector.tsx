/**
 * Mode Selector - Tab-based mode switching for Intelligence Assistant
 *
 * Provides visual tabs for switching between:
 * - Chat: Free-form conversation
 * - Guided: Structured questionnaire
 * - Document: Section-by-section editing
 * - Review: Coherence checking
 */

import { IntelligenceMode } from '@/stores/intelligenceStore';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MessageSquare,
  ListChecks,
  FileText,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModeSelectorProps {
  currentMode: IntelligenceMode;
  onModeChange: (mode: IntelligenceMode) => void;
  className?: string;
  disabled?: boolean;
}

const modes: Array<{
  value: IntelligenceMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    value: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    description: 'Free-form conversation',
  },
  {
    value: 'guided',
    label: 'Guided',
    icon: ListChecks,
    description: 'Structured questions',
  },
  {
    value: 'document',
    label: 'Document',
    icon: FileText,
    description: 'Section-by-section',
  },
  {
    value: 'review',
    label: 'Review',
    icon: CheckCircle,
    description: 'Coherence check',
  },
];

export function ModeSelector({
  currentMode,
  onModeChange,
  className,
  disabled = false,
}: ModeSelectorProps) {
  return (
    <Tabs
      value={currentMode}
      onValueChange={(value) => onModeChange(value as IntelligenceMode)}
      className={className}
    >
      <TabsList className="grid grid-cols-4 w-[400px]">
        {modes.map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 text-xs',
              currentMode === value && 'font-medium'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function ModeSelectorCompact({
  currentMode,
  onModeChange,
  className,
}: ModeSelectorProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {modes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => onModeChange(value)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
            currentMode === value
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-muted-foreground'
          )}
          title={label}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export default ModeSelector;
