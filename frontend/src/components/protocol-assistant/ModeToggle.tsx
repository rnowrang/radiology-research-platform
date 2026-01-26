import { Switch } from '@/components/ui/switch';
import { Sparkles, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModeToggleProps {
  mode: 'guided' | 'chat';
  onChange: (mode: 'guided' | 'chat') => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  const isGuided = mode === 'guided';

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => !disabled && onChange('chat')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors',
          !isGuided ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
        )}
        disabled={disabled}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </button>

      <Switch
        checked={isGuided}
        onCheckedChange={(checked) => onChange(checked ? 'guided' : 'chat')}
        disabled={disabled}
      />

      <button
        onClick={() => !disabled && onChange('guided')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors',
          isGuided ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
        )}
        disabled={disabled}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Guided
      </button>
    </div>
  );
}
