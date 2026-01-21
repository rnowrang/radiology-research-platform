import { useState, useRef, useCallback } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { filesApi, tasksApi } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

// File category mapping based on task title
const TASK_TITLE_TO_CATEGORY: Record<string, string> = {
  'Upload Research Proposal': 'proposal',
  'Upload Study Abstract': 'abstract',
  'Upload Study Protocol': 'protocol',
  'Upload Consent Form': 'consent_form',
  'Upload CITI Training Certificate': 'citi_certificate',
  'Upload Funding Documentation': 'funding',
  'Upload Data Management Plan': 'data_management',
};

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface TaskFileUploadProps {
  taskId: number;
  taskTitle: string;
  projectId: string;
  fileCategory?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type UploadState = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileCategoryFromTitle(title: string): string {
  // Check direct mapping first
  if (TASK_TITLE_TO_CATEGORY[title]) {
    return TASK_TITLE_TO_CATEGORY[title];
  }

  // Try to match partial title
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('proposal')) return 'proposal';
  if (lowerTitle.includes('abstract')) return 'abstract';
  if (lowerTitle.includes('protocol')) return 'protocol';
  if (lowerTitle.includes('consent')) return 'consent_form';
  if (lowerTitle.includes('citi') || lowerTitle.includes('training')) return 'citi_certificate';
  if (lowerTitle.includes('funding')) return 'funding';
  if (lowerTitle.includes('data management')) return 'data_management';

  // Default fallback
  return 'other';
}

function isValidFileType(file: File): boolean {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(extension);
}

export function TaskFileUpload({
  taskId: _taskId,
  taskTitle,
  projectId,
  fileCategory: providedCategory,
  open,
  onOpenChange,
  onSuccess,
}: TaskFileUploadProps) {
  // Note: taskId is accepted for future use but not currently needed
  void _taskId;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileCategory = providedCategory || getFileCategoryFromTitle(taskTitle);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setUploadState('idle');
    setUploadProgress(0);
    setErrorMessage(null);
    setIsDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const validateFile = (file: File): string | null => {
    if (!isValidFileType(file)) {
      return `Invalid file type. Please upload a PDF, DOC, or DOCX file.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`;
    }
    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setErrorMessage(error);
      setUploadState('error');
      return;
    }

    setSelectedFile(file);
    setUploadState('selected');
    setErrorMessage(null);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadState('idle');
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState('uploading');
    setUploadProgress(0);
    setErrorMessage(null);

    try {
      // Step 1: Upload the file
      await filesApi.upload(
        {
          file: selectedFile,
          project_id: projectId,
          category: fileCategory as any,
        },
        (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      );

      // Step 2: Auto-complete the task after successful upload
      try {
        await tasksApi.autoCompleteUpload(projectId, fileCategory);
      } catch (autoCompleteError: any) {
        // If auto-complete fails, log but don't fail the whole operation
        // The file was still uploaded successfully
        console.warn('Auto-complete task failed:', autoCompleteError);
      }

      setUploadState('success');

      toast({
        title: 'File uploaded successfully',
        description: `${selectedFile.name} has been uploaded and the task is complete.`,
      });

      // Wait a moment to show success state, then close
      setTimeout(() => {
        handleClose();
        onSuccess?.();
      }, 1500);

    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadState('error');
      setErrorMessage(
        error.response?.data?.detail ||
        error.response?.data?.error ||
        'Failed to upload file. Please try again.'
      );

      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.response?.data?.detail || 'Failed to upload file.',
      });
    }
  };

  const renderDropZone = () => (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
        isDragOver && 'border-primary bg-primary/5',
        !isDragOver && 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleInputChange}
        className="hidden"
      />
      <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
      <p className="text-sm font-medium">
        Drag and drop your file here, or click to browse
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Accepted formats: PDF, DOC, DOCX (max {formatFileSize(MAX_FILE_SIZE)})
      </p>
    </div>
  );

  const renderSelectedFile = () => (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-3">
        <File className="h-10 w-10 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{selectedFile?.name}</p>
          <p className="text-sm text-muted-foreground">
            {selectedFile && formatFileSize(selectedFile.size)}
          </p>
        </div>
        {uploadState === 'selected' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRemoveFile}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const renderUploadingState = () => (
    <div className="space-y-4">
      {renderSelectedFile()}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </span>
          <span>{uploadProgress}%</span>
        </div>
        <Progress value={uploadProgress} className="h-2" />
      </div>
    </div>
  );

  const renderSuccessState = () => (
    <div className="text-center py-6">
      <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
      <p className="font-medium text-green-600">Upload Complete!</p>
      <p className="text-sm text-muted-foreground mt-1">
        Your file has been uploaded and the task is now complete.
      </p>
    </div>
  );

  const renderErrorState = () => (
    <div className="space-y-4">
      <div className="text-center py-4">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="font-medium text-destructive">Upload Failed</p>
        {errorMessage && (
          <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
        )}
      </div>
      <Button
        variant="outline"
        onClick={resetState}
        className="w-full"
      >
        Try Again
      </Button>
    </div>
  );

  const renderContent = () => {
    switch (uploadState) {
      case 'idle':
        return renderDropZone();
      case 'selected':
        return (
          <div className="space-y-4">
            {renderSelectedFile()}
            <p className="text-sm text-muted-foreground text-center">
              Click "Upload" to submit this file for the task.
            </p>
          </div>
        );
      case 'uploading':
        return renderUploadingState();
      case 'success':
        return renderSuccessState();
      case 'error':
        return renderErrorState();
      default:
        return renderDropZone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            {taskTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {renderContent()}
        </div>

        {(uploadState === 'idle' || uploadState === 'selected') && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadState !== 'selected' || !selectedFile}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TaskFileUpload;
