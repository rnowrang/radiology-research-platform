import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { protocolAssistantApi } from '@/lib/protocolAssistantApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  FileText,
  Target,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// TypeScript interface for extracted protocol data
// This matches the backend ExtractedProtocol schema
export interface ExtractedProtocol {
  study_title: string;
  principal_investigator?: string | null;
  study_type: string;
  objectives: {
    primary: string;
    secondary: string[];
  };
  methodology: {
    design: string;
    population: string;
    sample_size?: string | null;
    inclusion_criteria: string[];
    exclusion_criteria: string[];
  };
  data_collection?: {
    sources: string[];
    variables: string[];
    timeline?: string | null;
  } | null;
  risks_benefits: {
    risks: string[];
    benefits: string[];
    mitigation: string[];
  };
  confidentiality_measures?: string | null;
  missing_sections: string[];
  quality_score: number;
  recommendations: string[];
}

interface ProtocolPreviewPanelProps {
  protocol: ExtractedProtocol | null;
  currentField?: string;
  onFieldClick?: (fieldPath: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Alternative interface for sessionId-based usage (from GuidedWizardPanel)
interface ProtocolPreviewPanelSessionProps {
  sessionId: string;
  currentField?: string;
  onFieldClick?: (fieldPath: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Type guard
function isSessionProps(
  props: ProtocolPreviewPanelProps | ProtocolPreviewPanelSessionProps
): props is ProtocolPreviewPanelSessionProps {
  return 'sessionId' in props;
}

// Field status component
function FieldStatus({
  isComplete,
  isCurrentField,
}: {
  isComplete: boolean;
  isCurrentField: boolean;
}) {
  if (isCurrentField) {
    return (
      <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
    );
  }
  if (isComplete) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  }
  return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}

// Field row component with highlight animation
function FieldRow({
  label,
  value,
  fieldPath,
  currentField,
  onFieldClick,
}: {
  label: string;
  value?: string | null;
  fieldPath: string;
  currentField?: string;
  onFieldClick?: (fieldPath: string) => void;
}) {
  const isCurrentField = currentField === fieldPath;
  const isComplete = !!value && value.length > 0;
  const [isHighlighted, setIsHighlighted] = useState(false);

  // Flash animation when field becomes current
  useEffect(() => {
    if (isCurrentField) {
      setIsHighlighted(true);
      const timer = setTimeout(() => setIsHighlighted(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isCurrentField]);

  return (
    <div
      className={cn(
        'flex items-start gap-2 py-1.5 px-2 rounded-md transition-colors',
        isCurrentField && 'bg-yellow-50 border border-yellow-200',
        isHighlighted && 'animate-pulse bg-yellow-100',
        onFieldClick && 'cursor-pointer hover:bg-muted/50'
      )}
      onClick={() => onFieldClick?.(fieldPath)}
      role={onFieldClick ? 'button' : undefined}
      tabIndex={onFieldClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onFieldClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onFieldClick(fieldPath);
        }
      }}
    >
      <FieldStatus isComplete={isComplete} isCurrentField={isCurrentField} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {isComplete ? (
          <p className="text-sm truncate">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Not specified</p>
        )}
      </div>
    </div>
  );
}

// List field row component
function ListFieldRow({
  label,
  items,
  fieldPath,
  currentField,
  onFieldClick,
}: {
  label: string;
  items?: string[] | null;
  fieldPath: string;
  currentField?: string;
  onFieldClick?: (fieldPath: string) => void;
}) {
  const isCurrentField = currentField === fieldPath;
  const isComplete = items && items.length > 0;
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    if (isCurrentField) {
      setIsHighlighted(true);
      const timer = setTimeout(() => setIsHighlighted(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isCurrentField]);

  return (
    <div
      className={cn(
        'py-1.5 px-2 rounded-md transition-colors',
        isCurrentField && 'bg-yellow-50 border border-yellow-200',
        isHighlighted && 'animate-pulse bg-yellow-100',
        onFieldClick && 'cursor-pointer hover:bg-muted/50'
      )}
      onClick={() => onFieldClick?.(fieldPath)}
      role={onFieldClick ? 'button' : undefined}
      tabIndex={onFieldClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onFieldClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onFieldClick(fieldPath);
        }
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <FieldStatus isComplete={!!isComplete} isCurrentField={isCurrentField} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      {isComplete ? (
        <ul className="ml-5 text-sm space-y-0.5">
          {items.slice(0, 3).map((item, idx) => (
            <li key={idx} className="truncate">
              {item}
            </li>
          ))}
          {items.length > 3 && (
            <li className="text-muted-foreground text-xs">
              +{items.length - 3} more
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic ml-5">None specified</p>
      )}
    </div>
  );
}

// Main content component (shared between both interfaces)
function ProtocolPreviewContent({
  protocol,
  currentField,
  onFieldClick,
}: {
  protocol: ExtractedProtocol | null;
  currentField?: string;
  onFieldClick?: (fieldPath: string) => void;
}) {
  if (!protocol) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No protocol data yet</p>
        <p className="text-xs">Upload a document to extract protocol information</p>
      </div>
    );
  }

  return (
    <Accordion type="multiple" defaultValue={['study-info', 'objectives', 'methodology']} className="w-full">
      {/* Study Information Section */}
      <AccordionItem value="study-info">
        <AccordionTrigger className="py-2 text-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Study Information</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-1">
            <FieldRow
              label="Title"
              value={protocol.study_title}
              fieldPath="study_title"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <FieldRow
              label="Principal Investigator"
              value={protocol.principal_investigator}
              fieldPath="principal_investigator"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <FieldRow
              label="Study Type"
              value={protocol.study_type?.replace(/_/g, ' ')}
              fieldPath="study_type"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <div className="flex items-center gap-2 px-2 pt-2">
              <span className="text-xs text-muted-foreground">Quality Score:</span>
              <Badge
                variant={
                  protocol.quality_score >= 70
                    ? 'success'
                    : protocol.quality_score >= 40
                      ? 'warning'
                      : 'secondary'
                }
                className="text-xs"
              >
                {protocol.quality_score}%
              </Badge>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Objectives Section */}
      <AccordionItem value="objectives">
        <AccordionTrigger className="py-2 text-sm">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span>Objectives</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-1">
            <FieldRow
              label="Primary Objective"
              value={protocol.objectives.primary}
              fieldPath="objectives.primary"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <ListFieldRow
              label="Secondary Objectives"
              items={protocol.objectives.secondary}
              fieldPath="objectives.secondary"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Methodology Section */}
      <AccordionItem value="methodology">
        <AccordionTrigger className="py-2 text-sm">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            <span>Methodology</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-1">
            <FieldRow
              label="Study Design"
              value={protocol.methodology.design}
              fieldPath="methodology.design"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <FieldRow
              label="Target Population"
              value={protocol.methodology.population}
              fieldPath="methodology.population"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <FieldRow
              label="Sample Size"
              value={protocol.methodology.sample_size}
              fieldPath="methodology.sample_size"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <ListFieldRow
              label="Inclusion Criteria"
              items={protocol.methodology.inclusion_criteria}
              fieldPath="methodology.inclusion_criteria"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <ListFieldRow
              label="Exclusion Criteria"
              items={protocol.methodology.exclusion_criteria}
              fieldPath="methodology.exclusion_criteria"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Risks & Benefits Section */}
      <AccordionItem value="risks-benefits">
        <AccordionTrigger className="py-2 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Risks & Benefits</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-1">
            <ListFieldRow
              label="Risks"
              items={protocol.risks_benefits.risks}
              fieldPath="risks_benefits.risks"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <ListFieldRow
              label="Benefits"
              items={protocol.risks_benefits.benefits}
              fieldPath="risks_benefits.benefits"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
            <ListFieldRow
              label="Mitigation Strategies"
              items={protocol.risks_benefits.mitigation}
              fieldPath="risks_benefits.mitigation"
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Missing Sections Alert */}
      {protocol.missing_sections && protocol.missing_sections.length > 0 && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-yellow-800">Missing Sections</p>
              <ul className="text-xs text-yellow-700 mt-1">
                {protocol.missing_sections.map((section, idx) => (
                  <li key={idx} className="capitalize">
                    {section.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Accordion>
  );
}

// Session-based variant that fetches protocol data
function ProtocolPreviewPanelWithSession({
  sessionId,
  currentField,
  onFieldClick,
  isCollapsed,
  onToggleCollapse,
}: ProtocolPreviewPanelSessionProps) {
  // Fetch session to get extracted protocol
  const { data: session, isLoading } = useQuery({
    queryKey: ['protocolSession', sessionId],
    queryFn: () => protocolAssistantApi.getSession(sessionId),
    enabled: !!sessionId,
    refetchInterval: 5000, // Refresh to get updates
  });

  const protocol = useMemo(() => {
    if (!session?.extracted_protocol) return null;
    return session.extracted_protocol as unknown as ExtractedProtocol;
  }, [session]);

  if (isCollapsed) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleCollapse}
        className="flex items-center gap-1"
        title="Show Protocol Preview"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Protocol Preview</CardTitle>
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleCollapse}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-full px-4 pb-4">
            <ProtocolPreviewContent
              protocol={protocol}
              currentField={currentField}
              onFieldClick={onFieldClick}
            />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// Direct protocol data variant
function ProtocolPreviewPanelDirect({
  protocol,
  currentField,
  onFieldClick,
  isCollapsed,
  onToggleCollapse,
}: ProtocolPreviewPanelProps) {
  if (isCollapsed) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleCollapse}
        className="flex items-center gap-1"
        title="Show Protocol Preview"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Protocol Preview</CardTitle>
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleCollapse}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          <ProtocolPreviewContent
            protocol={protocol}
            currentField={currentField}
            onFieldClick={onFieldClick}
          />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Main export that handles both interfaces
export function ProtocolPreviewPanel(
  props: ProtocolPreviewPanelProps | ProtocolPreviewPanelSessionProps
) {
  if (isSessionProps(props)) {
    return <ProtocolPreviewPanelWithSession {...props} />;
  }
  return <ProtocolPreviewPanelDirect {...props} />;
}
