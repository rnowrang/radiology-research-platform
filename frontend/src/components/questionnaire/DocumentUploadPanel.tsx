import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { protocolAssistantApi } from '@/lib/protocolAssistantApi';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

interface DocumentUploadPanelProps {
  projectId: string;
  onUploadComplete?: () => void;
}

export function DocumentUploadPanel({ projectId, onUploadComplete }: DocumentUploadPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    factsExtracted: number;
  } | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return protocolAssistantApi.uploadKnowledgeDocument(projectId, file, 'protocol', true);
    },
    onSuccess: (data, file) => {
      setUploadedFile({
        name: file.name,
        factsExtracted: data.facts_extracted,
      });

      // Invalidate questionnaire to get updated suggestions
      queryClient.invalidateQueries({ queryKey: ['projectQuestionnaire', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectKnowledge', projectId] });

      toast({
        title: 'Document processed',
        description: `Extracted ${data.facts_extracted} facts from your document.`,
      });

      onUploadComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to process document',
        variant: 'destructive',
      });
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && isValidFile(file)) {
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const isValidFile = (file: File): boolean => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];

    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF or Word document',
        variant: 'destructive',
      });
      return false;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 50MB',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const isUploading = uploadMutation.isPending;

  // Show success state after upload
  if (uploadedFile) {
    return (
      <div className="border rounded-lg p-4 bg-green-50 border-green-200">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-700" />
              <span className="text-sm font-medium text-green-800 truncate">
                {uploadedFile.name}
              </span>
            </div>
            <p className="text-xs text-green-700 mt-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {uploadedFile.factsExtracted} facts extracted - answers will be suggested below
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-green-700 hover:text-green-800 hover:bg-green-100"
            onClick={() => setUploadedFile(null)}
          >
            Upload Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
        dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
        isUploading && 'opacity-50 pointer-events-none'
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        className="hidden"
        onChange={handleFileSelect}
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Analyzing document with AI...
          </p>
        </div>
      ) : (
        <>
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Drop your protocol document here to auto-fill questions
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse Files
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            PDF, DOCX up to 50MB
          </p>
        </>
      )}
    </div>
  );
}
