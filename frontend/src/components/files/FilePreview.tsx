import { useState, useEffect } from 'react';
import { Download, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { filesApi, FileMetadata } from '@/lib/api';

interface FilePreviewProps {
  file: FileMetadata | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function FilePreview({ file, isOpen, onClose }: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !file) {
      setPreviewUrl(null);
      setError(null);
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await filesApi.download(file.id);
        const blob = new Blob([response.data], { type: file.mime_type });
        const url = window.URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (err) {
        console.error('Failed to load preview:', err);
        setError('Failed to load file preview');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();

    // Cleanup URL on unmount or when file changes
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file, isOpen]);

  const handleDownload = async () => {
    if (!file) return;

    try {
      const response = await filesApi.download(file.id);
      const blob = new Blob([response.data], { type: file.mime_type });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const isImage = file?.mime_type.startsWith('image/');
  const isPdf = file?.mime_type === 'application/pdf';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate">{file?.original_file_name}</span>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </DialogTitle>
          {file && (
            <p className="text-sm text-muted-foreground">
              {formatFileSize(file.file_size)}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-[400px] rounded-lg bg-muted/30">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && previewUrl && (
            <>
              {isImage && (
                <div className="flex items-center justify-center h-full p-4">
                  <img
                    src={previewUrl}
                    alt={file?.original_file_name}
                    className="max-w-full max-h-full object-contain rounded"
                  />
                </div>
              )}

              {isPdf && (
                <iframe
                  src={previewUrl}
                  className="w-full h-full min-h-[500px] rounded"
                  title={file?.original_file_name}
                />
              )}

              {!isImage && !isPdf && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Preview not available for this file type
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FilePreview;
