import { useState, useEffect } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { filesApi } from '@/lib/api';

/**
 * File information structure for FilePreviewModal
 */
export interface FilePreviewModalFile {
  id: number;
  filename: string;
  mime_type: string;
}

/**
 * Props interface for FilePreviewModal component
 */
export interface FilePreviewModalProps {
  file: FilePreviewModalFile | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Check if the MIME type is for a PDF file
 */
function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

/**
 * Check if the MIME type is for an image
 */
function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Check if the MIME type is for a Word document
 */
function isWordDocument(mimeType: string): boolean {
  return (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

/**
 * FilePreviewModal - A modal for previewing documents
 *
 * Features:
 * - PDF preview using iframe with blob URL
 * - Image preview using img tag with blob URL
 * - Word document notice with download option
 * - Header with filename and close button
 * - Footer with download button
 */
export function FilePreviewModal({
  file,
  isOpen,
  onClose,
}: FilePreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch file as blob when modal opens
  useEffect(() => {
    if (isOpen && file) {
      setIsLoading(true);
      setError(null);
      setBlobUrl(null);

      filesApi.download(file.id.toString())
        .then((response) => {
          const blob = new Blob([response.data], { type: file.mime_type });
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
        })
        .catch((err) => {
          console.error('Failed to load file preview:', err);
          setError('Failed to load file preview');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }

    // Cleanup blob URL when modal closes
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [isOpen, file?.id]);

  /**
   * Handle download action
   */
  const handleDownload = () => {
    if (!file || !blobUrl) return;

    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /**
   * Render preview content based on file type
   */
  const renderPreviewContent = () => {
    if (!file) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No file selected
        </div>
      );
    }

    // Loading state
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      );
    }

    // Error state
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
          <FileText className="h-16 w-16 text-destructive" />
          <div>
            <h3 className="font-semibold text-lg">Failed to load preview</h3>
            <p className="text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      );
    }

    // PDF preview using iframe
    if (isPdf(file.mime_type) && blobUrl) {
      return (
        <iframe
          src={blobUrl}
          className="w-full h-full min-h-[500px] rounded border-0"
          title={file.filename}
        />
      );
    }

    // Image preview using img tag
    if (isImage(file.mime_type) && blobUrl) {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <img
            src={blobUrl}
            alt={file.filename}
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      );
    }

    // Word document - preview not available
    if (isWordDocument(file.mime_type)) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
          <FileText className="h-16 w-16 text-blue-600" />
          <div>
            <h3 className="font-semibold text-lg">Preview not available</h3>
            <p className="text-muted-foreground mt-1">
              Preview is not available for Word documents.
            </p>
            <p className="text-muted-foreground">
              Please download the file to view its contents.
            </p>
          </div>
          <Button onClick={handleDownload} disabled={!blobUrl}>
            <Download className="mr-2 h-4 w-4" />
            Download File
          </Button>
        </div>
      );
    }

    // Default fallback - unsupported file type
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <FileText className="h-16 w-16 text-muted-foreground" />
        <div>
          <h3 className="font-semibold text-lg">Preview not available</h3>
          <p className="text-muted-foreground mt-1">
            Preview is not available for this file type.
          </p>
        </div>
        <Button onClick={handleDownload} disabled={!blobUrl}>
          <Download className="mr-2 h-4 w-4" />
          Download File
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header with filename and close button */}
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate">{file?.filename || 'File Preview'}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Preview content area */}
        <div className="flex-1 overflow-auto min-h-[400px] rounded-lg bg-muted/30">
          {renderPreviewContent()}
        </div>

        {/* Footer with download button */}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {file && blobUrl && !isWordDocument(file.mime_type) && (
            <Button onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FilePreviewModal;
