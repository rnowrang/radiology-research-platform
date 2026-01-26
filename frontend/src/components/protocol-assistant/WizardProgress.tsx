import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Clock,
  CheckCircle2,
  Circle,
  FlaskConical,
  AlertTriangle,
  Users,
  Target,
  Shield,
  FileText,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionInfo, WizardProgress as WizardProgressType } from '@/lib/protocolAssistantApi';

interface WizardProgressProps {
  sections: SectionInfo[];
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  skippedCount: number;
  estimatedMinutesRemaining: number;
  onSectionClick?: (sectionIndex: number) => void;
}

// Alternative interface that matches how GuidedWizardPanel calls this component
interface WizardProgressAltProps {
  progress: WizardProgressType;
  sections: SectionInfo[];
  currentSectionName?: string;
  onSectionClick?: (sectionName: string) => void;
}

// Section icon mapping
const sectionIcons: Record<string, typeof FlaskConical> = {
  methodology: FlaskConical,
  risks: AlertTriangle,
  population: Users,
  objectives: Target,
  privacy: Shield,
  study_info: FileText,
  data_collection: ClipboardList,
  other: FileText,
};

// Get appropriate icon for section
function getSectionIcon(iconName: string): typeof FlaskConical {
  // Handle both icon name strings and section names
  const normalizedName = iconName.toLowerCase().replace(/[^a-z_]/g, '');
  return sectionIcons[normalizedName] || FileText;
}

// Type guard to determine which interface is being used
function isAltProps(props: WizardProgressProps | WizardProgressAltProps): props is WizardProgressAltProps {
  return 'progress' in props;
}

export function WizardProgress(props: WizardProgressProps | WizardProgressAltProps) {
  // Normalize props to a common format
  const normalizedProps = useMemo(() => {
    if (isAltProps(props)) {
      return {
        sections: props.sections,
        currentIndex: props.progress.current_index,
        totalQuestions: props.progress.total_questions,
        answeredCount: props.progress.answered_count,
        skippedCount: props.progress.skipped_count,
        estimatedMinutesRemaining: props.progress.estimated_remaining_minutes,
        percentComplete: props.progress.percent_complete,
        sectionsProgress: props.progress.sections_progress,
        currentSectionName: props.currentSectionName,
        onSectionClick: props.onSectionClick,
      };
    }
    return {
      sections: props.sections,
      currentIndex: props.currentIndex,
      totalQuestions: props.totalQuestions,
      answeredCount: props.answeredCount,
      skippedCount: props.skippedCount,
      estimatedMinutesRemaining: props.estimatedMinutesRemaining,
      percentComplete: Math.round((props.answeredCount / props.totalQuestions) * 100),
      sectionsProgress: undefined as Record<string, { total: number; answered: number }> | undefined,
      currentSectionName: undefined as string | undefined,
      onSectionClick: props.onSectionClick,
    };
  }, [props]);

  const {
    sections,
    currentIndex,
    totalQuestions,
    answeredCount,
    skippedCount,
    estimatedMinutesRemaining,
    percentComplete,
    sectionsProgress,
    currentSectionName,
    onSectionClick,
  } = normalizedProps;

  // Calculate which section the current question belongs to
  const currentSectionIndex = useMemo(() => {
    // Match using section key (e.g., "methodology") which matches question.section
    if (currentSectionName) {
      // Try exact match on key first
      const idx = sections.findIndex(s => s.key === currentSectionName);
      if (idx >= 0) return idx;
      // Fallback: try case-insensitive match
      const normalizedCurrent = currentSectionName.toLowerCase();
      const idxFallback = sections.findIndex(s =>
        s.key?.toLowerCase() === normalizedCurrent
      );
      if (idxFallback >= 0) return idxFallback;
    }
    // Fallback: estimate based on cumulative question count (less accurate)
    let questionsSoFar = 0;
    for (let i = 0; i < sections.length; i++) {
      questionsSoFar += sections[i].question_count;
      if (currentIndex < questionsSoFar) {
        return i;
      }
    }
    return sections.length - 1;
  }, [sections, currentIndex, currentSectionName]);

  // Handle section click with proper type handling
  const handleSectionClick = (section: SectionInfo, index: number) => {
    if (!onSectionClick) return;

    // Check which type of callback is expected
    if (isAltProps(props)) {
      (onSectionClick as (sectionName: string) => void)(section.name);
    } else {
      (onSectionClick as (sectionIndex: number) => void)(index);
    }
  };

  // Get section completion status
  const getSectionStatus = (section: SectionInfo, index: number) => {
    if (sectionsProgress) {
      const sectionProgress = sectionsProgress[section.name];
      if (sectionProgress) {
        if (sectionProgress.answered >= sectionProgress.total) {
          return 'complete';
        }
        if (sectionProgress.answered > 0) {
          return 'in-progress';
        }
      }
    }
    // Fallback: estimate based on position
    if (index < currentSectionIndex) {
      return 'complete';
    }
    if (index === currentSectionIndex) {
      return 'in-progress';
    }
    return 'pending';
  };

  return (
    <Card className="mb-4">
      <CardContent className="pt-4 pb-3">
        {/* Top row: Question counter and time estimate */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            {skippedCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {skippedCount} skipped
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>~{estimatedMinutesRemaining} min remaining</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <Progress value={percentComplete} className="h-2" />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              {answeredCount} answered
            </span>
            <span className="text-xs text-muted-foreground">
              {percentComplete}% complete
            </span>
          </div>
        </div>

        {/* Section navigation */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <TooltipProvider delayDuration={200}>
            {sections.map((section, index) => {
              const Icon = getSectionIcon(section.icon || section.name);
              const status = getSectionStatus(section, index);
              const isActive = index === currentSectionIndex;

              return (
                <Tooltip key={section.name}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleSectionClick(section, index)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : status === 'complete'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : status === 'in-progress'
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80',
                        onSectionClick ? 'cursor-pointer' : 'cursor-default'
                      )}
                      disabled={!onSectionClick}
                      type="button"
                    >
                      {status === 'complete' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : status === 'in-progress' ? (
                        <Icon className="h-3.5 w-3.5" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                      <span className="capitalize whitespace-nowrap">
                        {section.name.replace(/_/g, ' ')}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <p className="font-medium capitalize">
                      {section.name.replace(/_/g, ' ')}
                    </p>
                    <p className="text-muted-foreground">
                      {section.question_count} question{section.question_count !== 1 ? 's' : ''}
                      {sectionsProgress?.[section.name] && (
                        <> ({sectionsProgress[section.name].answered}/{sectionsProgress[section.name].total} answered)</>
                      )}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
