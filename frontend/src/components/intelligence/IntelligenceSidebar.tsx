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
    <div className="h-full flex flex-col p-2 text-xs overflow-hidden">
      {/* Compact Progress Overview */}
      <div className="mb-2 shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-medium">Progress</span>
          <span className="text-muted-foreground">
            {progress.completionPercentage}%
          </span>
        </div>
        <Progress value={progress.completionPercentage} className="h-1" />
        <div className="flex items-center justify-between mt-0.5 text-[9px] text-muted-foreground">
          <span>{progress.answered} done</span>
          <span>{progress.skipped} skip</span>
        </div>
      </div>

      {/* Compact Coherence Score */}
      <div className="mb-2 p-1.5 rounded bg-muted/50 shrink-0">
        <div className="flex items-center justify-between">
          <span className="font-medium">Coherence</span>
          <Badge
            variant={
              coherenceStatus === 'good'
                ? 'default'
                : coherenceStatus === 'warning'
                ? 'secondary'
                : 'destructive'
            }
            className="text-[9px] py-0 px-1 h-4"
          >
            {coherenceScore}%
          </Badge>
        </div>
      </div>

      {/* Section Navigation - scrollable */}
      <div className="flex-1 overflow-auto min-h-0">
        <h3 className="text-[9px] font-medium mb-1 text-muted-foreground uppercase tracking-wide sticky top-0 bg-muted/20 py-0.5">Sections</h3>
        <div className="space-y-px">
          {sections.map((section, index) => {
            const Icon = sectionIcons[section.id] || Circle;
            const sectionProgress = progress.sectionProgress[section.id];
            const isComplete =
              sectionProgress &&
              sectionProgress.answered === sectionProgress.total;
            const isCurrent = currentSectionId === section.id;

            return (
              <button
                key={section.id || `section-${index}`}
                onClick={() => goToSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors',
                  isCurrent
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/70 text-muted-foreground hover:text-foreground'
                )}
              >
                <div className="shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate leading-tight">{section.name}</div>
                </div>
                {sectionProgress && (
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {sectionProgress.answered}/{sectionProgress.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode-specific actions - compact */}
      {currentMode === 'guided' && progress.completionPercentage >= 80 && (
        <div className="mt-1.5 pt-1.5 border-t shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-6 text-[10px]"
            onClick={() => onModeChange('review')}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Review
          </Button>
        </div>
      )}
    </div>
  );
}

export default IntelligenceSidebar;
