/**
 * Intelligence Sidebar - Navigation and progress overview
 *
 * Provides:
 * - Overall progress indicator
 * - Section navigation
 * - Coherence score display
 * - Quick mode switching
 */

import { useIntelligenceStore, IntelligenceMode } from '@/stores/intelligenceStore';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronRight,
  BookOpen,
  Users,
  Target,
  FlaskConical,
  Shield,
  Lock,
  FileText,
  DollarSign,
  Clipboard,
  Database,
  MoreHorizontal,
} from 'lucide-react';

interface IntelligenceSidebarProps {
  projectId: string;
  currentMode: IntelligenceMode;
  progress: ReturnType<typeof useIntelligenceStore.getState>['getProgress'];
  coherenceScore: number;
  onModeChange: (mode: IntelligenceMode) => void;
}

// Section icons mapping
const sectionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  study_info: BookOpen,
  personnel: Users,
  objectives: Target,
  methodology: FlaskConical,
  population: Users,
  recruitment: Users,
  procedures: Clipboard,
  risks: AlertTriangle,
  privacy: Lock,
  consent: FileText,
  regulatory: Shield,
  funding: DollarSign,
  data_collection: Database,
  other: MoreHorizontal,
};

export function IntelligenceSidebar({
  projectId,
  currentMode,
  progress,
  coherenceScore,
  onModeChange,
}: IntelligenceSidebarProps) {
  const { sections, goToSection, currentQuestionIndex, questions } = useIntelligenceStore();

  // Get current section
  const currentQuestion = questions[currentQuestionIndex];
  const currentSectionId = currentQuestion?.section;

  // Calculate coherence status
  const coherenceStatus =
    coherenceScore >= 90 ? 'good' : coherenceScore >= 70 ? 'warning' : 'error';

  return (
    <div className="h-full flex flex-col p-4">
      {/* Progress Overview */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Progress</span>
          <span className="text-sm text-muted-foreground">
            {progress.completionPercentage}%
          </span>
        </div>
        <Progress value={progress.completionPercentage} className="h-2" />
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span>{progress.answered} answered</span>
          <span>{progress.skipped} skipped</span>
        </div>
      </div>

      {/* Time Estimate */}
      {progress.estimatedRemainingMinutes > 0 && (
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>~{progress.estimatedRemainingMinutes} min remaining</span>
        </div>
      )}

      {/* Coherence Score */}
      <div className="mb-6 p-3 rounded-lg bg-muted/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">Coherence Score</span>
          <Badge
            variant={
              coherenceStatus === 'good'
                ? 'default'
                : coherenceStatus === 'warning'
                ? 'secondary'
                : 'destructive'
            }
          >
            {coherenceScore}%
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {coherenceStatus === 'good'
            ? 'All documents are consistent'
            : coherenceStatus === 'warning'
            ? 'Some inconsistencies detected'
            : 'Critical issues need attention'}
        </p>
        {coherenceStatus !== 'good' && (
          <Button
            variant="link"
            size="sm"
            className="mt-1 h-auto p-0 text-xs"
            onClick={() => onModeChange('review')}
          >
            View issues <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>

      {/* Section Navigation */}
      <div className="flex-1 overflow-auto">
        <h3 className="text-sm font-medium mb-3">Sections</h3>
        <div className="space-y-1">
          {sections.map((section) => {
            const Icon = sectionIcons[section.id] || Circle;
            const sectionProgress = progress.sectionProgress[section.id];
            const isComplete =
              sectionProgress &&
              sectionProgress.answered === sectionProgress.total;
            const isCurrent = currentSectionId === section.id;

            return (
              <button
                key={section.id}
                onClick={() => goToSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
                  isCurrent
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="flex-shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{section.name}</div>
                  {sectionProgress && (
                    <div className="text-xs text-muted-foreground">
                      {sectionProgress.answered}/{sectionProgress.total}
                    </div>
                  )}
                </div>
                {isCurrent && (
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode-specific actions */}
      {currentMode === 'guided' && progress.completionPercentage >= 80 && (
        <div className="mt-4 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onModeChange('review')}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Review & Complete
          </Button>
        </div>
      )}
    </div>
  );
}

export default IntelligenceSidebar;
