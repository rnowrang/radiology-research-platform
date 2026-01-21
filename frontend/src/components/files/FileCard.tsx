import { useState } from 'react';
import { format } from 'date-fns';
import { FileText, File, Eye, Download, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * File information structure for FileCard
 */
export interface FileCardFile {
  id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  uploaded_by_name?: string;
  task_id?: number;
  task_title?: string;
  task_status?: string;
}

/**
 * Props interface for FileCard component
 */
export interface FileCardProps {
  file: FileCardFile;
  onPreview: () => void;
  onDownload: () => void;
  onDelete?: () => void;
  showTaskInfo?: boolean;
  className?: string;
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
 * Get file icon based on MIME type
 */
function getFileIcon(mimeType: string): JSX.Element {
  // PDF files
  if (mimeType === 'application/pdf') {
    return <FileText className="h-8 w-8 text-red-600" />;
  }

  // Word documents (DOC, DOCX)
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return <FileText className="h-8 w-8 text-blue-600" />;
  }

  // Default file icon
  return <File className="h-8 w-8 text-muted-foreground" />;
}

/**
 * Get badge variant based on task status
 */
function getTaskStatusVariant(
  status?: string
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (!status) return 'secondary';

  const statusLower = status.toLowerCase();

  if (statusLower === 'completed' || statusLower === 'approved') {
    return 'success';
  }
  if (statusLower === 'pending' || statusLower === 'in_progress') {
    return 'warning';
  }
  if (statusLower === 'rejected' || statusLower === 'failed') {
    return 'destructive';
  }
  if (statusLower === 'draft') {
    return 'outline';
  }

  return 'secondary';
}

/**
 * Format task status for display
 */
function formatTaskStatus(status?: string): string {
  if (!status) return 'Unknown';

  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * FileCard - A card component showing file info with task context
 *
 * Features:
 * - File icon based on type (FileText for PDF/DOC, File for others)
 * - Display: filename, file size, upload date, uploader name
 * - Task info: task name and status badge (when showTaskInfo is true)
 * - Action buttons: Preview, Download, Delete (with confirmation)
 */
export function FileCard({
  file,
  onPreview,
  onDownload,
  onDelete,
  showTaskInfo = false,
  className,
}: FileCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  /**
   * Handle delete confirmation
   */
  const handleConfirmDelete = () => {
    setDeleteDialogOpen(false);
    if (onDelete) {
      onDelete();
    }
  };

  /**
   * Format the upload date
   */
  const formattedDate = file.uploaded_at
    ? format(new Date(file.uploaded_at), 'MMM d, yyyy')
    : 'Unknown date';

  return (
    <>
      <Card className={cn('hover:shadow-md transition-shadow', className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* File Icon */}
            <div className="shrink-0 p-2 bg-muted/50 rounded-lg">
              {getFileIcon(file.mime_type)}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              {/* Filename */}
              <h4 className="font-medium truncate" title={file.original_filename}>
                {file.original_filename}
              </h4>

              {/* File details */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
                <span>{formatFileSize(file.file_size)}</span>
                <span className="text-muted-foreground/50">|</span>
                <span>{formattedDate}</span>
                {file.uploaded_by_name && (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    <span>by {file.uploaded_by_name}</span>
                  </>
                )}
              </div>

              {/* Task Info (if enabled and available) */}
              {showTaskInfo && file.task_title && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">
                    Task: {file.task_title}
                  </span>
                  {file.task_status && (
                    <Badge variant={getTaskStatusVariant(file.task_status)} className="text-xs">
                      {formatTaskStatus(file.task_status)}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Preview Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onPreview}
                title="Preview"
                className="h-8 w-8"
              >
                <Eye className="h-4 w-4" />
              </Button>

              {/* Download Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onDownload}
                title="Download"
                className="h-8 w-8"
              >
                <Download className="h-4 w-4" />
              </Button>

              {/* Delete Button (only if onDelete is provided) */}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteDialogOpen(true)}
                  title="Delete"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{file.original_filename}"? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default FileCard;
