import { useState, useEffect, useRef } from 'react';
import { Download, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formsApi } from '@/lib/api';

/**
 * Props interface for PdfPreviewModal component
 */
export interface PdfPreviewModalProps {
  formId: number;
  formTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * PdfPreviewModal - A modal for previewing generated PDF forms
 *
 * Features:
 * - Fetches PDF as blob when modal opens
 * - Displays PDF in an iframe for inline preview
 * - Loading state while fetching
 * - Error state if fetch fails
 * - Download button in footer
 * - Automatic cleanup of blob URLs to prevent memory leaks
 */
export function PdfPreviewModal({
  formId,
  formTitle,
  isOpen,
  onClose,
}: PdfPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Fetch PDF when modal opens
  useEffect(() => {
    // Cleanup previous blob URL if exists
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (isOpen && formId) {
      setIsLoading(true);
      setError(null);
      setBlobUrl(null);

      formsApi.downloadPdf(formId)
        .then((response) => {
          const blob = new Blob([response.data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
        })
        .catch((err) => {
          console.error('Failed to load PDF preview:', err);
          setError('Failed to load PDF preview. Please try again or download the file directly.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }

    // Cleanup blob URL when modal closes or component unmounts
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [isOpen, formId]);

  /**
   * Handle download action - creates a temporary anchor to trigger download
   */
  const handleDownload = () => {
    if (!blobUrl) return;

    // Sanitize filename by replacing non-alphanumeric characters with underscores
    const sanitizedTitle = formTitle.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${sanitizedTitle}_form.pdf`;

    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /**
   * Render content based on current state
   */
  const renderContent = () => {
    // Loading state
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading PDF preview...</p>
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
    if (blobUrl) {
      return (
        <iframe
          src={blobUrl}
          className="w-full h-full min-h-[600px] rounded border-0"
          title={`PDF Preview: ${formTitle}`}
        />
      );
    }

    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header with form title */}
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate">PDF Preview: {formTitle}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Preview content area */}
        <div className="flex-1 overflow-auto min-h-[500px] rounded-lg bg-muted/30">
          {renderContent()}
        </div>

        {/* Footer with close and download buttons */}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {blobUrl && (
            <Button onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PdfPreviewModal;
