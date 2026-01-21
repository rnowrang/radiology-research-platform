import { useState, useRef, useCallback } from 'react';
import { Upload, FileUp, Check, X, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { filesApi } from '@/lib/api';

/**
 * Allowed MIME types for document upload
 */
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Allowed file extensions for document upload
 */
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

/**
 * Maximum file size: 10MB
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Upload state types
 */
type UploadState = 'idle' | 'dragover' | 'uploading' | 'success' | 'error';

/**
 * Props interface for UploadDropzone component
 */
export interface UploadDropzoneProps {
  taskId: number;
  projectId: string;
  fileCategory?: string;
  onUploadComplete: () => void;
  disabled?: boolean;
}

/**
 * Format bytes to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if a file has a valid extension
 */
function hasValidExtension(filename: string): boolean {
  const extension = '.' + filename.split('.').pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(extension);
}

/**
 * Validate file type and size
 */
function validateFile(file: File): string | null {
  // Check MIME type or extension (some browsers may not set MIME type correctly)
  const isValidType = ALLOWED_MIME_TYPES.includes(file.type) || hasValidExtension(file.name);
  if (!isValidType) {
    return 'Invalid file type. Please upload a PDF, DOC, or DOCX file.';
  }

  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`;
  }

  return null;
}

/**
 * UploadDropzone - An inline upload component with drag & drop support
 *
 * Features:
 * - Drag & drop file support
 * - Click to browse functionality
 * - File validation (PDF, DOC, DOCX only, max 10MB)
 * - Visual states: idle, dragover, uploading, success, error
 * - Upload progress indicator
 */
export function UploadDropzone({
  taskId,
  projectId,
  fileCategory,
  onUploadComplete,
  disabled = false,
}: UploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Reset the component to idle state
   */
  const resetState = useCallback(() => {
    setUploadState('idle');
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Handle file selection (from drag or browse)
   */
  const handleFileSelect = useCallback(
    async (file: File) => {
      // Validate the file
      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        setUploadState('error');
        return;
      }

      setSelectedFile(file);
      setErrorMessage(null);
      setUploadState('uploading');

      try {
        // Upload the file with taskId parameter
        await filesApi.upload({
          file,
          project_id: projectId,
          category: fileCategory as any,
          taskId: taskId,
        });

        setUploadState('success');

        // Notify parent and reset after a short delay to show success state
        setTimeout(() => {
          onUploadComplete();
          resetState();
        }, 1500);
      } catch (error: any) {
        console.error('Upload error:', error);
        setErrorMessage(
          error.response?.data?.detail ||
          error.response?.data?.error ||
          'Failed to upload file. Please try again.'
        );
        setUploadState('error');
      }
    },
    [taskId, projectId, fileCategory, onUploadComplete, resetState]
  );

  /**
   * Handle drag over event
   */
  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && uploadState !== 'uploading') {
        setUploadState('dragover');
      }
    },
    [disabled, uploadState]
  );

  /**
   * Handle drag leave event
   */
  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (uploadState === 'dragover') {
        setUploadState('idle');
      }
    },
    [uploadState]
  );

  /**
   * Handle drop event
   */
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled || uploadState === 'uploading') {
        return;
      }

      setUploadState('idle');

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [disabled, uploadState, handleFileSelect]
  );

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  /**
   * Handle click to open file browser
   */
  const handleClick = useCallback(() => {
    if (!disabled && uploadState !== 'uploading') {
      fileInputRef.current?.click();
    }
  }, [disabled, uploadState]);

  /**
   * Render content based on current state
   */
  const renderContent = () => {
    switch (uploadState) {
      case 'uploading':
        return (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-medium">Uploading...</p>
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedFile.name}
                </p>
              )}
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-medium text-green-600">Upload Complete!</p>
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedFile.name}
                </p>
              )}
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
              <X className="h-6 w-6 text-red-600" />
            </div>
            <div className="text-center">
              <p className="font-medium text-destructive">Upload Failed</p>
              {errorMessage && (
                <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={resetState}>
              Try Again
            </Button>
          </div>
        );

      case 'dragover':
        return (
          <div className="flex flex-col items-center gap-3">
            <FileUp className="h-10 w-10 text-primary" />
            <p className="font-medium text-primary">Drop your file here</p>
          </div>
        );

      default: // idle
        return (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm">
                <span className="font-medium text-primary">Click to upload</span>
                {' '}or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, DOC, DOCX (max {formatFileSize(MAX_FILE_SIZE)})
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <Card className={cn(disabled && 'opacity-50 pointer-events-none')}>
      <CardContent className="p-4">
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            uploadState === 'idle' &&
              'border-muted-foreground/25 hover:border-primary/50 cursor-pointer',
            uploadState === 'dragover' && 'border-primary bg-primary/5',
            uploadState === 'uploading' && 'border-primary/50 bg-muted/30',
            uploadState === 'success' && 'border-green-500 bg-green-50',
            uploadState === 'error' && 'border-destructive bg-destructive/5',
            disabled && 'cursor-not-allowed'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={handleInputChange}
            className="hidden"
            disabled={disabled || uploadState === 'uploading'}
          />
          {renderContent()}
        </div>

        {/* Hidden taskId reference for future use */}
        <input type="hidden" name="taskId" value={taskId} />
      </CardContent>
    </Card>
  );
}

export default UploadDropzone;
