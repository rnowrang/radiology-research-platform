import { useState, useCallback } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DocumentUploadProps {
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  acceptedTypes?: string;
}

export function DocumentUpload({
  onUpload,
  isUploading,
  acceptedTypes = '.pdf,.docx,.doc',
}: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        await handleFile(e.dataTransfer.files[0]);
      }
    },
    [onUpload]
  );

  const handleFile = async (file: File) => {
    setSelectedFile(file);
    await onUpload(file);
    setSelectedFile(null);
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      await handleFile(e.target.files[0]);
    }
  };

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
        dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
        isUploading && 'opacity-50 pointer-events-none'
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing {selectedFile?.name}...</p>
        </div>
      ) : (
        <>
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-2">
            Drag and drop your protocol document here, or
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('protocol-file-input')?.click()}
          >
            <FileText className="mr-2 h-4 w-4" />
            Browse Files
          </Button>
          <input
            id="protocol-file-input"
            type="file"
            className="hidden"
            accept={acceptedTypes}
            onChange={handleInputChange}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Supports PDF and Word documents (max 50MB)
          </p>
        </>
      )}
    </div>
  );
}
