import { useState } from 'react';
import { format } from 'date-fns';
import {
  File,
  FileText,
  Image,
  FileSpreadsheet,
  Trash2,
  Download,
  Eye,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { filesApi, FileMetadata, FileCategory } from '@/lib/api';

interface FileListProps {
  files: FileMetadata[];
  onDelete?: (fileId: string) => void;
  onPreview?: (file: FileMetadata) => void;
  className?: string;
}

const CATEGORY_LABELS: Record<FileCategory, string> = {
  proposal: 'Proposal',
  irb_document: 'IRB Document',
  consent_form: 'Consent Form',
  protocol: 'Protocol',
  data: 'Data',
  result: 'Result',
  other: 'Other',
};

const CATEGORY_VARIANTS: Record<FileCategory, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  proposal: 'default',
  irb_document: 'success',
  consent_form: 'warning',
  protocol: 'secondary',
  data: 'outline',
  result: 'outline',
  other: 'secondary',
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return <Image className="h-5 w-5 text-green-600" />;
  }
  if (mimeType === 'application/pdf') {
    return <FileText className="h-5 w-5 text-red-600" />;
  }
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return <FileSpreadsheet className="h-5 w-5 text-green-700" />;
  }
  if (mimeType.includes('word') || mimeType === 'application/msword') {
    return <FileText className="h-5 w-5 text-blue-600" />;
  }
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function canPreview(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

export function FileList({ files, onDelete, onPreview, className }: FileListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileMetadata | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.delete(fileId),
    onSuccess: () => {
      if (fileToDelete && onDelete) {
        onDelete(fileToDelete.id);
      }
      setFileToDelete(null);
      setDeleteDialogOpen(false);
    },
  });

  const handleDownload = async (file: FileMetadata) => {
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

  const handleDeleteClick = (file: FileMetadata) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (fileToDelete) {
      deleteMutation.mutate(fileToDelete.id);
    }
  };

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <File className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No files uploaded yet</p>
      </div>
    );
  }

  return (
    <>
      <div className={className}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.mime_type)}
                    <span className="font-medium truncate max-w-[200px]">
                      {file.original_file_name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatFileSize(file.file_size)}
                </TableCell>
                <TableCell>
                  <Badge variant={CATEGORY_VARIANTS[file.category]}>
                    {CATEGORY_LABELS[file.category]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {file.uploaded_by.name || file.uploaded_by.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(file.created_at), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canPreview(file.mime_type) && onPreview && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onPreview(file)}
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(file)}
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(file)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileToDelete?.original_file_name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default FileList;
