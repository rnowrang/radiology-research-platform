import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, FileText, FolderOpen, User, File, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { searchApi, SearchResult, PaginatedResponse } from '@/lib/api';
import { cn } from '@/lib/utils';

type SearchType = 'all' | 'projects' | 'forms' | 'users' | 'files';

interface SearchResultsProps {
  initialQuery?: string;
  initialType?: SearchType;
}

export function SearchResults({ initialQuery, initialType = 'all' }: SearchResultsProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryParam = searchParams.get('q') || initialQuery || '';
  const typeParam = (searchParams.get('type') as SearchType) || initialType;
  const pageParam = parseInt(searchParams.get('page') || '1');

  const [query, setQuery] = useState(queryParam);
  const [activeType, setActiveType] = useState<SearchType>(typeParam);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch results when search params change
  useEffect(() => {
    const fetchResults = async () => {
      if (!queryParam || queryParam.length < 2) {
        setResults([]);
        setPagination(null);
        return;
      }

      setLoading(true);
      try {
        const response = await searchApi.search(queryParam, typeParam, pageParam, 20);
        setResults(response.data.data);
        setPagination(response.data.pagination);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [queryParam, typeParam, pageParam]);

  // Update URL when type changes
  const handleTypeChange = (type: SearchType) => {
    setActiveType(type);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('type', type);
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  // Handle search submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length >= 2) {
      const newParams = new URLSearchParams();
      newParams.set('q', query);
      newParams.set('type', activeType);
      newParams.set('page', '1');
      setSearchParams(newParams);
    }
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', newPage.toString());
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.link);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'project':
        return <FolderOpen className="h-5 w-5" />;
      case 'form':
        return <FileText className="h-5 w-5" />;
      case 'user':
        return <User className="h-5 w-5" />;
      case 'file':
        return <File className="h-5 w-5" />;
      default:
        return <Search className="h-5 w-5" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      project: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      form: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      user: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      file: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    };
    return (
      <Badge variant="secondary" className={cn('text-xs', colors[type])}>
        {type}
      </Badge>
    );
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Search header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search</h1>
        <p className="text-muted-foreground mt-1">
          Search across projects, forms, users, and files
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter search term..."
            className="pl-10"
          />
        </div>
        <Button type="submit" disabled={query.length < 2}>
          Search
        </Button>
      </form>

      {/* Results */}
      {queryParam && queryParam.length >= 2 && (
        <Tabs value={activeType} onValueChange={(v) => handleTypeChange(v as SearchType)}>
          <TabsList>
            <TabsTrigger value="all">
              All
              {pagination && activeType === 'all' && (
                <span className="ml-1 text-xs text-muted-foreground">({pagination.total})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="projects">
              <FolderOpen className="mr-1 h-4 w-4" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="forms">
              <FileText className="mr-1 h-4 w-4" />
              Forms
            </TabsTrigger>
            <TabsTrigger value="users">
              <User className="mr-1 h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="files">
              <File className="mr-1 h-4 w-4" />
              Files
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeType} className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="py-12 text-center">
                <Search className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <h3 className="mt-4 text-lg font-semibold">No results found</h3>
                <p className="mt-2 text-muted-foreground">
                  No results found for "{queryParam}" in {activeType === 'all' ? 'any category' : activeType}.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Results count */}
                {pagination && (
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1}-
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
                  </p>
                )}

                {/* Results list */}
                <div className="space-y-3">
                  {results.map((result) => (
                    <Card
                      key={`${result.type}-${result.id}`}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => handleResultClick(result)}
                    >
                      <CardContent className="flex items-start gap-4 p-4">
                        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                          {getIcon(result.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{result.title}</h3>
                            {getTypeBadge(result.type)}
                          </div>
                          {result.description && (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {result.description}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                            {result.subtitle && (
                              <span className="capitalize">{result.subtitle}</span>
                            )}
                            <span>{formatDate(result.created_at)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Initial state */}
      {(!queryParam || queryParam.length < 2) && (
        <div className="py-12 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="mt-4 text-lg font-semibold">Start searching</h3>
          <p className="mt-2 text-muted-foreground">
            Enter at least 2 characters to search across all content.
          </p>
        </div>
      )}
    </div>
  );
}

export default SearchResults;
