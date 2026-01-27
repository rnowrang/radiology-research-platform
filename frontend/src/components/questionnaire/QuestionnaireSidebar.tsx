import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Circle, Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionnaireSectionInfo, QuestionnaireProgressResponse } from '@/lib/protocolAssistantApi';

interface QuestionnaireSidebarProps {
  sections: QuestionnaireSectionInfo[];
  progress: QuestionnaireProgressResponse;
  currentSectionKey?: string;
  onSectionClick: (sectionKey: string) => void;
}

const sectionIcons: Record<string, string> = {
  study_info: '📋',
  personnel: '👥',
  methodology: '🔬',
  population: '🎯',
  risks: '⚠️',
  privacy: '🔒',
  timeline: '📅',
  funding: '💰',
  consent: '✍️',
  other: '📝',
};

export function QuestionnaireSidebar({
  sections,
  progress,
  currentSectionKey,
  onSectionClick,
}: QuestionnaireSidebarProps) {
  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full">
      {/* Overall Progress */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Progress</span>
          <span className="text-sm text-muted-foreground">
            {progress.completion_percentage}%
          </span>
        </div>
        <Progress value={progress.completion_percentage} className="h-2" />
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{progress.answered_count} answered</span>
          <span>{progress.skipped_count} skipped</span>
        </div>
      </div>

      {/* Estimated Time */}
      {progress.estimated_remaining_minutes > 0 && (
        <div className="px-4 py-2 border-b flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>~{progress.estimated_remaining_minutes} min remaining</span>
        </div>
      )}

      {/* Sections List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sections.map((section) => {
            const sectionProgress = progress.sections_progress[section.key] || {
              total: 0,
              answered: 0,
              skipped: 0,
            };
            const isComplete = sectionProgress.answered + sectionProgress.skipped >= sectionProgress.total;
            const isCurrent = currentSectionKey === section.key;
            const percentage = sectionProgress.total > 0
              ? Math.round(((sectionProgress.answered + sectionProgress.skipped) / sectionProgress.total) * 100)
              : 0;

            return (
              <Button
                key={section.key}
                variant="ghost"
                className={cn(
                  'w-full justify-start h-auto py-3 px-3 mb-1',
                  isCurrent && 'bg-primary/10 border border-primary/20',
                  isComplete && !isCurrent && 'text-muted-foreground'
                )}
                onClick={() => onSectionClick(section.key)}
              >
                <div className="flex items-start gap-3 w-full">
                  {/* Status Icon */}
                  <div className="mt-0.5">
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Circle className={cn(
                        'h-4 w-4',
                        isCurrent ? 'text-primary' : 'text-muted-foreground'
                      )} />
                    )}
                  </div>

                  {/* Section Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{sectionIcons[section.key] || '📝'}</span>
                      <span className={cn(
                        'text-sm font-medium',
                        isComplete && !isCurrent && 'text-muted-foreground'
                      )}>
                        {section.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={percentage} className="h-1 flex-1" />
                      <span className="text-xs text-muted-foreground min-w-[3ch]">
                        {sectionProgress.answered}/{sectionProgress.total}
                      </span>
                    </div>
                  </div>

                  {/* Arrow for current */}
                  {isCurrent && (
                    <ChevronRight className="h-4 w-4 text-primary" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Summary Stats */}
      <div className="p-4 border-t bg-background">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-2 rounded bg-muted/50">
            <div className="text-lg font-semibold text-green-600">
              {progress.answered_count}
            </div>
            <div className="text-xs text-muted-foreground">Answered</div>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <div className="text-lg font-semibold text-amber-600">
              {progress.total_questions - progress.answered_count - progress.skipped_count}
            </div>
            <div className="text-xs text-muted-foreground">Remaining</div>
          </div>
        </div>
      </div>
    </div>
  );
}
