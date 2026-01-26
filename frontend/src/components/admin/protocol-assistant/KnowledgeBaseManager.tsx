import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Search, Plus, Trash2, ExternalLink, FileText } from 'lucide-react';
import { protocolAssistantAdminApi, KnowledgeDocument } from '@/lib/protocolAssistantAdminApi';
import { toast } from '@/hooks/useToast';

export function KnowledgeBaseManager() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [newDocument, setNewDocument] = useState({
    title: '',
    content: '',
    category: '',
    description: '',
    source_url: '',
  });

  // Fetch categories and stats
  const { data: categoriesData } = useQuery({
    queryKey: ['pa-kb-categories'],
    queryFn: () => protocolAssistantAdminApi.getKnowledgeCategories(),
  });

  const { data: statsData } = useQuery({
    queryKey: ['pa-kb-stats'],
    queryFn: () => protocolAssistantAdminApi.getKnowledgeStats(),
  });

  // Search
  const { data: searchData, isLoading: searchLoading, refetch: doSearch } = useQuery({
    queryKey: ['pa-kb-search', searchQuery, selectedCategory],
    queryFn: () =>
      protocolAssistantAdminApi.searchKnowledge(
        searchQuery || '*',
        selectedCategory || undefined,
        20
      ),
    enabled: false,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: (data: typeof newDocument) =>
      protocolAssistantAdminApi.addKnowledgeDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pa-kb'] });
      setAddDialogOpen(false);
      setNewDocument({ title: '', content: '', category: '', description: '', source_url: '' });
      toast({ title: 'Success', description: 'Document added to knowledge base' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add document', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => protocolAssistantAdminApi.deleteKnowledgeDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pa-kb'] });
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      toast({ title: 'Success', description: 'Document removed from knowledge base' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete document', variant: 'destructive' });
    },
  });

  const categories = categoriesData?.data?.categories ?? [];
  const stats = statsData?.data ?? { total_documents: 0, total_words: 0, by_category: {} };
  const searchResults = searchData?.data?.results ?? [];

  const handleSearch = () => {
    if (searchQuery.trim() || selectedCategory) {
      doSearch();
    }
  };

  const handleAdd = () => {
    if (!newDocument.title.trim() || !newDocument.content.trim() || !newDocument.category) {
      toast({ title: 'Error', description: 'Please fill in title, content, and category', variant: 'destructive' });
      return;
    }
    addMutation.mutate(newDocument);
  };

  const handleDelete = (id: string) => {
    setDocumentToDelete(id);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_documents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Words</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_words.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Document
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Knowledge Document</DialogTitle>
                  <DialogDescription>
                    Add a new document to the knowledge base for AI context
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="doc-title">Title</Label>
                    <Input
                      id="doc-title"
                      value={newDocument.title}
                      onChange={(e) => setNewDocument({ ...newDocument, title: e.target.value })}
                      placeholder="Document title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="doc-category">Category</Label>
                    <Select
                      value={newDocument.category}
                      onValueChange={(value) => setNewDocument({ ...newDocument, category: value })}
                    >
                      <SelectTrigger id="doc-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                        <SelectItem value="guidelines">guidelines</SelectItem>
                        <SelectItem value="templates">templates</SelectItem>
                        <SelectItem value="regulations">regulations</SelectItem>
                        <SelectItem value="examples">examples</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="doc-description">Description (optional)</Label>
                    <Input
                      id="doc-description"
                      value={newDocument.description}
                      onChange={(e) =>
                        setNewDocument({ ...newDocument, description: e.target.value })
                      }
                      placeholder="Brief description"
                    />
                  </div>
                  <div>
                    <Label htmlFor="doc-content">Content</Label>
                    <Textarea
                      id="doc-content"
                      value={newDocument.content}
                      onChange={(e) => setNewDocument({ ...newDocument, content: e.target.value })}
                      placeholder="Document content..."
                      rows={10}
                    />
                  </div>
                  <div>
                    <Label htmlFor="doc-source">Source URL (optional)</Label>
                    <Input
                      id="doc-source"
                      value={newDocument.source_url}
                      onChange={(e) =>
                        setNewDocument({ ...newDocument, source_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdd} disabled={addMutation.isPending}>
                    {addMutation.isPending ? 'Adding...' : 'Add Document'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Documents by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_category).map(([category, count]) => (
              <Badge
                key={category}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => {
                  setSelectedCategory(category);
                  setSearchQuery('');
                  doSearch();
                }}
              >
                {category}: {count as number}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Knowledge Base</CardTitle>
          <CardDescription>Find documents by content or category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSearch}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>

          {/* Results */}
          {searchLoading ? (
            <div className="py-8 text-center text-muted-foreground">Searching...</div>
          ) : searchResults.length > 0 ? (
            <div className="mt-4 space-y-4">
              {searchResults.map((doc) => (
                <div key={doc.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{doc.title}</span>
                        <Badge variant="outline">{doc.category}</Badge>
                      </div>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>
                      )}
                      <p className="text-sm mt-2 line-clamp-2">{doc.content}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : searchData ? (
            <div className="py-8 text-center text-muted-foreground">No results found</div>
          ) : null}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => documentToDelete && deleteMutation.mutate(documentToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default KnowledgeBaseManager;
