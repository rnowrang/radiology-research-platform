import { SuggestedAnswer } from '@/lib/protocolAssistantApi';
import { cn } from '@/lib/utils';
import { Check, FileText, Sparkles, Library } from 'lucide-react';

interface AnswerChipsProps {
  suggestions: SuggestedAnswer[];
  selectedId: string | null;
  onSelect: (suggestion: SuggestedAnswer) => void;
}

const sourceConfig = {
  document: {
    icon: FileText,
    color: 'border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900',
    selectedColor: 'border-blue-500 bg-blue-100 ring-2 ring-blue-500 ring-offset-1',
    label: 'From document',
  },
  ai: {
    icon: Sparkles,
    color: 'border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900',
    selectedColor: 'border-purple-500 bg-purple-100 ring-2 ring-purple-500 ring-offset-1',
    label: 'AI suggestion',
  },
  common: {
    icon: Library,
    color: 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-900',
    selectedColor: 'border-gray-500 bg-gray-100 ring-2 ring-gray-500 ring-offset-1',
    label: 'Common answer',
  },
};

export function AnswerChips({ suggestions, selectedId, onSelect }: AnswerChipsProps) {
  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No suggestions available. Please type your answer below.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => {
        const config = sourceConfig[suggestion.source] || sourceConfig.common;
        const Icon = config.icon;
        const isSelected = selectedId === suggestion.id;

        return (
          <button
            key={suggestion.id}
            onClick={() => onSelect(suggestion)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all',
              'max-w-full text-left',
              isSelected ? config.selectedColor : config.color
            )}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{suggestion.text}</span>
            {isSelected && (
              <Check className="h-3.5 w-3.5 flex-shrink-0 ml-1" />
            )}
          </button>
        );
      })}
    </div>
  );
}
