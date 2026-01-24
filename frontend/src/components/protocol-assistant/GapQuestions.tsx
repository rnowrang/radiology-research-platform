import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { GapQuestion } from '@/lib/protocolAssistantApi';

interface GapQuestionsProps {
  gaps: GapQuestion[];
  onQuestionClick?: (question: GapQuestion) => void;
}

export function GapQuestions({ gaps, onQuestionClick }: GapQuestionsProps) {
  if (!gaps || gaps.length === 0) return null;

  const priorityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const unansweredCount = gaps.filter((g) => !g.answered).length;

  return (
    <Card>
      <CardContent className="p-4">
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          Questions to Address ({unansweredCount} remaining)
        </h4>
        <div className="space-y-2">
          {gaps.map((gap, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                gap.answered ? 'opacity-50' : ''
              }`}
              onClick={() => onQuestionClick?.(gap)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm">{gap.question}</p>
                {gap.answered ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <Badge variant="outline" className={priorityColors[gap.priority]}>
                    {gap.priority}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Section: {gap.section}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
