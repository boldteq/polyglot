# SaaS File Upload Design Patterns

**Last updated: 2026-04-04**

Production-grade file upload components for Lovable/React/TypeScript projects. Built with shadcn/ui, Tailwind CSS, and native browser APIs. Copy-paste ready.

---

## Table of Contents

1. [Drag-and-Drop Upload Zone](#drag-and-drop-upload-zone)
2. [Upload Progress](#upload-progress)
3. [File List / File Manager](#file-list--file-manager)
4. [Image Upload with Preview](#image-upload-with-preview)
5. [File Type Icons](#file-type-icons)
6. [Validation & Error Handling](#validation--error-handling)
7. [Supabase Storage Integration Pattern](#supabase-storage-integration-pattern)
8. [TypeScript Interfaces](#typescript-interfaces)

---

## Drag-and-Drop Upload Zone

### Component Code

```typescript
// src/components/FileDropzone.tsx
import React, { useRef, useState } from 'react';
import { Upload, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string; // e.g., '.pdf,.docx,.txt'
  maxSize?: number; // in bytes
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

export interface FileDropzoneState {
  isDragActive: boolean;
  error: string | null;
  isHovering: boolean;
}

export function FileDropzone({
  onFiles,
  accept = '.pdf,.docx,.txt',
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 5,
  multiple = true,
  disabled = false,
  loading = false,
}: FileDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FileDropzoneState>({
    isDragActive: false,
    error: null,
    isHovering: false,
  });

  const validateFiles = (files: File[]): { valid: File[]; error?: string } => {
    const acceptedExtensions = accept.split(',').map((ext) => ext.toLowerCase().trim());

    // Check file count
    if (files.length > maxFiles) {
      return { valid: [], error: `Maximum ${maxFiles} files allowed` };
    }

    const validFiles: File[] = [];

    for (const file of files) {
      // Check file size
      if (file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
        return {
          valid: [],
          error: `File "${file.name}" exceeds ${maxSizeMB}MB limit`,
        };
      }

      // Check file type
      const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      const isAllowed = acceptedExtensions.some((ext) =>
        ext === '*' || ext === fileExtension || file.type.startsWith(ext.replace('.', ''))
      );

      if (!isAllowed && accept !== '*') {
        return {
          valid: [],
          error: `"${file.name}" is not an allowed file type (${accept})`,
        };
      }

      validFiles.push(file);
    }

    return { valid: validFiles };
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !loading) {
      setState((prev) => ({ ...prev, isDragActive: true }));
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => ({ ...prev, isDragActive: false }));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => ({ ...prev, isDragActive: false }));

    if (disabled || loading) return;

    const files = Array.from(e.dataTransfer.files);
    const result = validateFiles(files);

    if (result.error) {
      setState((prev) => ({ ...prev, error: result.error || null }));
      return;
    }

    setState((prev) => ({ ...prev, error: null }));
    onFiles(result.valid);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const result = validateFiles(files);

    if (result.error) {
      setState((prev) => ({ ...prev, error: result.error || null }));
      return;
    }

    setState((prev) => ({ ...prev, error: null }));
    onFiles(result.valid);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled && !loading) {
      fileInputRef.current?.click();
    }
  };

  const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
  const allowedTypes = accept.split(',').join(', ').toUpperCase();

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        onMouseEnter={() => !disabled && !loading && setState((prev) => ({ ...prev, isHovering: true }))}
        onMouseLeave={() => setState((prev) => ({ ...prev, isHovering: false }))}
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer',
          'px-6 py-12 flex flex-col items-center justify-center gap-3',
          // Default state
          'border-muted-foreground/25 bg-muted/50 dark:bg-muted/20',
          // Hover state
          state.isHovering && !disabled && !loading && 'border-primary/50 bg-primary/5',
          // Drag active state
          state.isDragActive && 'border-primary bg-primary/5 shadow-md',
          // Disabled state
          (disabled || loading) && 'opacity-60 cursor-not-allowed',
          // Error state
          state.error && 'border-destructive/50 bg-destructive/5'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileInputChange}
          disabled={disabled || loading}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            'rounded-lg p-3 transition-colors',
            state.isDragActive ? 'bg-primary/10' : 'bg-muted/60 dark:bg-muted/40'
          )}>
            <Upload className={cn(
              'w-8 h-8 transition-colors',
              state.isDragActive ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>

          <div className="text-center">
            <p className={cn(
              'text-sm font-semibold transition-colors',
              state.isDragActive ? 'text-primary' : 'text-foreground'
            )}>
              {state.isDragActive ? 'Drop files here' : 'Drag files here or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {allowedTypes} up to {maxSizeMB}MB
              {maxFiles < Infinity && ` • Max ${maxFiles} files`}
            </p>
          </div>
        </div>
      </div>

      {state.error && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

### Usage Example

```typescript
import { FileDropzone } from '@/components/FileDropzone';
import { useState } from 'react';

export function MyComponent() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFiles = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  };

  return (
    <FileDropzone
      onFiles={handleFiles}
      accept=".pdf,.docx"
      maxSize={10 * 1024 * 1024}
      maxFiles={5}
      multiple={true}
    />
  );
}
```

### Visual States

**Default State:**
- Dashed border (muted-foreground/25)
- Light background (muted/50)
- Upload icon (muted-foreground)
- Text: "Drag files here or click to browse"

**Hover/Drag-Over State:**
- Primary border (primary/50)
- Light primary background (primary/5)
- Upload icon changes to primary
- Text: "Drop files here"

**Uploading State:**
- Opacity reduced to 60%
- Cursor becomes "not-allowed"
- Input disabled

**Error State:**
- Border destructive/50
- Background destructive/5
- Alert box appears below with error message

**Dark Mode:**
- Automatically adjusts background opacity
- Border colors remain consistent with theme
- Alert styling inherits dark mode colors

---

## Upload Progress

### Component Code

```typescript
// src/components/UploadProgress.tsx
import React, { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/lib/fileIcons';

export interface FileUploadItem {
  file: File;
  id: string;
  progress: number; // 0-100
  status: 'queued' | 'uploading' | 'complete' | 'error';
  error?: string;
}

export interface UploadProgressProps {
  items: FileUploadItem[];
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export function UploadProgress({
  items,
  onCancel,
  onRetry,
}: UploadProgressProps) {
  const completedCount = items.filter((item) => item.status === 'complete').length;
  const totalCount = items.length;
  const overallProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (items.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      {/* Overall Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            Uploading {completedCount} of {totalCount} files...
          </p>
          <p className="text-xs text-muted-foreground">{Math.round(overallProgress)}%</p>
        </div>
        <Progress value={overallProgress} className="h-1" />
      </div>

      {/* Individual File Progress */}
      <div className="space-y-2">
        {items.map((item) => (
          <FileProgressItem
            key={item.id}
            item={item}
            onCancel={() => onCancel?.(item.id)}
            onRetry={() => onRetry?.(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FileProgressItem({
  item,
  onCancel,
  onRetry,
}: {
  item: FileUploadItem;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const statusColors = {
    queued: 'bg-muted text-muted-foreground',
    uploading: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    complete: 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400',
    error: 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400',
  };

  const progressBarColors = {
    queued: 'bg-muted',
    uploading: 'bg-blue-500',
    complete: 'bg-green-500',
    error: 'bg-red-500',
  };

  const Icon = getFileIcon(item.file.name);
  const fileSizeMB = (item.file.size / (1024 * 1024)).toFixed(2);

  return (
    <div className={cn(
      'rounded-lg p-3 space-y-2 transition-colors',
      statusColors[item.status]
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{item.file.name}</p>
            <p className="text-xs opacity-75">{fileSizeMB}MB</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {item.status === 'uploading' && (
            <>
              <p className="text-sm font-medium">{item.progress}%</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="h-6 w-6 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          )}
          {item.status === 'complete' && (
            <CheckCircle className="w-5 h-5" />
          )}
          {item.status === 'error' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="h-6 px-2 text-xs"
            >
              Retry
            </Button>
          )}
          {item.status === 'queued' && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
        </div>
      </div>

      {(item.status === 'uploading' || item.status === 'queued') && (
        <Progress
          value={item.status === 'uploading' ? item.progress : 0}
          className="h-1.5"
        />
      )}

      {item.status === 'error' && item.error && (
        <p className="text-xs">{item.error}</p>
      )}
    </div>
  );
}
```

### Usage Example

```typescript
import { UploadProgress, FileUploadItem } from '@/components/UploadProgress';
import { useState } from 'react';

export function MyComponent() {
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([]);

  const handleCancel = (id: string) => {
    setUploadItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRetry = (id: string) => {
    setUploadItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'queued' as const, progress: 0 } : item
      )
    );
  };

  return (
    <UploadProgress
      items={uploadItems}
      onCancel={handleCancel}
      onRetry={handleRetry}
    />
  );
}
```

---

## File List / File Manager

### Component Code

```typescript
// src/components/FileList.tsx
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, MoreVertical, Trash2, Edit2, Search, Grid3x3, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/lib/fileIcons';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: Date;
  url?: string;
}

export interface FileListProps {
  files: UploadedFile[];
  onDownload?: (file: UploadedFile) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  defaultView?: 'list' | 'grid';
}

export function FileList({
  files,
  onDownload,
  onDelete,
  onRename,
  defaultView = 'list',
}: FileListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'list' | 'grid'>(defaultView);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const sortOptions = ['name', 'date', 'size', 'type'] as const;
  const [sortBy, setSortBy] = useState<typeof sortOptions[number]>('date');

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'size':
        return b.size - a.size;
      case 'type':
        return a.name.split('.').pop()?.localeCompare(b.name.split('.').pop() || '') || 0;
      case 'date':
      default:
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    }
  });

  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/25 py-12 flex flex-col items-center justify-center gap-2">
        <div className="rounded-lg bg-muted/50 p-3">
          {getFileIcon('file.txt')({ className: 'w-8 h-8 text-muted-foreground' })}
        </div>
        <p className="text-sm font-medium text-foreground">No files uploaded yet</p>
        <p className="text-xs text-muted-foreground">Upload files to get started</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header with Search and View Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-input p-1">
            <Button
              variant={view === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('list')}
              className="h-8 w-8 p-0"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('grid')}
              className="h-8 w-8 p-0"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Sort by: {sortBy}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {sortOptions.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={sortBy === option ? 'bg-accent' : ''}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Files Display */}
      {view === 'list' ? (
        <FileListView
          files={sortedFiles}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameStart={(id) => {
            const file = files.find((f) => f.id === id);
            if (file) {
              setRenamingId(id);
              setRenameValue(file.name);
            }
          }}
          onRenameChange={setRenameValue}
          onRenameSave={(id) => {
            onRename?.(id, renameValue);
            setRenamingId(null);
          }}
          onRenameCancel={() => setRenamingId(null)}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ) : (
        <FileGridView
          files={sortedFiles}
          onDownload={onDownload}
          onDelete={onDelete}
          onRename={(id) => {
            const file = files.find((f) => f.id === id);
            if (file) {
              setRenamingId(id);
              setRenameValue(file.name);
            }
          }}
        />
      )}
    </div>
  );
}

function FileListView({
  files,
  renamingId,
  renameValue,
  onRenameStart,
  onRenameChange,
  onRenameSave,
  onRenameCancel,
  onDownload,
  onDelete,
}: {
  files: UploadedFile[];
  renamingId: string | null;
  renameValue: string;
  onRenameStart: (id: string) => void;
  onRenameChange: (value: string) => void;
  onRenameSave: (id: string) => void;
  onRenameCancel: () => void;
  onDownload?: (file: UploadedFile) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Type</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Size</TableHead>
            <TableHead className="hidden md:table-cell text-right">Date</TableHead>
            <TableHead className="w-12 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => (
            <TableRow key={file.id} className="hover:bg-muted/50">
              <TableCell>
                {getFileIcon(file.name)({ className: 'w-5 h-5' })}
              </TableCell>
              <TableCell>
                {renamingId === file.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => onRenameChange(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRenameSave(file.id)}
                      className="h-8"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onRenameCancel}
                      className="h-8"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <p className="font-medium text-sm truncate">{file.name}</p>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right text-sm text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </TableCell>
              <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                {new Date(file.uploadedAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onDownload && (
                      <DropdownMenuItem onClick={() => onDownload(file)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    )}
                    {onRename && (
                      <DropdownMenuItem onClick={() => onRenameStart(file.id)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        onClick={() => onDelete(file.id)}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function FileGridView({
  files,
  onDownload,
  onDelete,
  onRename,
}: {
  files: UploadedFile[];
  onDownload?: (file: UploadedFile) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {files.map((file) => (
        <Card
          key={file.id}
          className="p-3 hover:bg-muted/50 transition-colors cursor-pointer group"
        >
          <div className="space-y-2">
            <div className="rounded-lg bg-muted/60 p-4 flex items-center justify-center">
              {getFileIcon(file.name)({ className: 'w-8 h-8 text-muted-foreground' })}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-medium truncate" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onDownload && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  onClick={() => onDownload(file)}
                >
                  <Download className="h-3 w-3" />
                </Button>
              )}
              {onDelete && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => onDelete(file.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

---

## Image Upload with Preview

### Component Code

```typescript
// src/components/ImageUpload.tsx
import React, { useRef, useState } from 'react';
import { Image as ImageIcon, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ImageUploadProps {
  onImageSelected?: (file: File) => void;
  previewUrl?: string;
  maxSize?: number;
  circular?: boolean;
  label?: string;
  disabled?: boolean;
}

export function ImageUpload({
  onImageSelected,
  previewUrl,
  maxSize = 5 * 1024 * 1024,
  circular = false,
  label = 'Upload Image',
  disabled = false,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(previewUrl);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
      setError(`Image must be smaller than ${maxSizeMB}MB`);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setPreview(result);
      setError(null);
      onImageSelected?.(file);
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleRemove = () => {
    setPreview(undefined);
    setError(null);
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled}
        className="hidden"
      />

      {preview ? (
        <div className="space-y-3">
          <div className={cn(
            'overflow-hidden bg-muted flex items-center justify-center',
            circular ? 'w-32 h-32 rounded-full' : 'rounded-lg aspect-square'
          )}>
            <img
              src={preview}
              alt="Preview"
              className={cn(
                'w-full h-full object-cover',
                circular && 'rounded-full'
              )}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClick}
              disabled={disabled}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Change
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            'relative rounded-lg border-2 border-dashed border-muted-foreground/25',
            'bg-muted/50 p-8 flex flex-col items-center justify-center gap-2',
            'transition-all duration-200 cursor-pointer',
            'hover:border-primary/50 hover:bg-primary/5',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            circular && 'rounded-full aspect-square p-0'
          )}
        >
          <div className="rounded-lg bg-muted/60 p-3">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-center">{label}</p>
          <p className="text-xs text-muted-foreground text-center">
            {(maxSize / (1024 * 1024)).toFixed(1)}MB max
          </p>
        </button>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
```

---

## File Type Icons

### Utility Code

```typescript
// src/lib/fileIcons.ts
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  Archive,
  Image,
  File,
  Music,
  Video,
  Presentation,
  LucideIcon,
} from 'lucide-react';

const fileTypeMap: Record<string, { icon: LucideIcon; color: string }> = {
  // Documents
  pdf: { icon: FileText, color: 'text-red-500' },
  doc: { icon: FileText, color: 'text-blue-500' },
  docx: { icon: FileText, color: 'text-blue-500' },
  txt: { icon: FileText, color: 'text-gray-500' },
  rtf: { icon: FileText, color: 'text-gray-500' },

  // Spreadsheets
  xls: { icon: FileSpreadsheet, color: 'text-green-500' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-500' },
  csv: { icon: FileSpreadsheet, color: 'text-green-500' },

  // Presentations
  ppt: { icon: Presentation, color: 'text-orange-500' },
  pptx: { icon: Presentation, color: 'text-orange-500' },

  // Code
  js: { icon: FileCode, color: 'text-yellow-500' },
  jsx: { icon: FileCode, color: 'text-yellow-500' },
  ts: { icon: FileCode, color: 'text-blue-500' },
  tsx: { icon: FileCode, color: 'text-blue-500' },
  py: { icon: FileCode, color: 'text-blue-500' },
  java: { icon: FileCode, color: 'text-red-500' },
  json: { icon: FileCode, color: 'text-yellow-500' },
  html: { icon: FileCode, color: 'text-red-500' },
  css: { icon: FileCode, color: 'text-blue-500' },

  // Archives
  zip: { icon: Archive, color: 'text-purple-500' },
  rar: { icon: Archive, color: 'text-purple-500' },
  '7z': { icon: Archive, color: 'text-purple-500' },

  // Images
  png: { icon: Image, color: 'text-cyan-500' },
  jpg: { icon: Image, color: 'text-cyan-500' },
  jpeg: { icon: Image, color: 'text-cyan-500' },
  gif: { icon: Image, color: 'text-cyan-500' },
  svg: { icon: Image, color: 'text-cyan-500' },
  webp: { icon: Image, color: 'text-cyan-500' },

  // Media
  mp3: { icon: Music, color: 'text-purple-500' },
  wav: { icon: Music, color: 'text-purple-500' },
  mp4: { icon: Video, color: 'text-green-500' },
  avi: { icon: Video, color: 'text-green-500' },
  mov: { icon: Video, color: 'text-green-500' },
};

export function getFileIcon(
  filename: string
): (props: { className?: string }) => React.ReactNode {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const fileType = fileTypeMap[ext];

  if (!fileType) {
    return (props) => <File className={props.className} />;
  }

  const { icon: IconComponent, color } = fileType;
  return (props) => (
    <IconComponent className={`${props.className} ${color}`} />
  );
}
```

---

## Validation & Error Handling

### Common Patterns

```typescript
// src/lib/fileValidation.ts
export interface FileValidationError {
  type: 'size' | 'type' | 'count' | 'unknown';
  message: string;
  file?: string;
}

export interface FileValidationRules {
  maxSize?: number;
  maxFiles?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

export function validateFiles(
  files: File[],
  rules: FileValidationRules
): { valid: File[]; errors: FileValidationError[] } {
  const errors: FileValidationError[] = [];
  const valid: File[] = [];

  // Check max file count
  if (rules.maxFiles && files.length > rules.maxFiles) {
    errors.push({
      type: 'count',
      message: `Maximum ${rules.maxFiles} files allowed. You selected ${files.length}.`,
    });
    return { valid: [], errors };
  }

  for (const file of files) {
    // Check file size
    if (rules.maxSize && file.size > rules.maxSize) {
      const maxSizeMB = (rules.maxSize / (1024 * 1024)).toFixed(1);
      errors.push({
        type: 'size',
        message: `"${file.name}" exceeds ${maxSizeMB}MB limit`,
        file: file.name,
      });
      continue;
    }

    // Check file type
    if (rules.allowedTypes && !rules.allowedTypes.includes(file.type)) {
      errors.push({
        type: 'type',
        message: `"${file.name}" is not an allowed file type`,
        file: file.name,
      });
      continue;
    }

    // Check file extension
    if (rules.allowedExtensions) {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
      const isAllowed = rules.allowedExtensions.includes(ext);
      if (!isAllowed) {
        errors.push({
          type: 'type',
          message: `"${file.name}" has an unsupported extension`,
          file: file.name,
        });
        continue;
      }
    }

    valid.push(file);
  }

  return { valid, errors };
}
```

---

## Supabase Storage Integration Pattern

### Complete Upload Flow

```typescript
// src/lib/supabaseFileUpload.ts
import { supabase } from '@/integrations/supabase/client';

export interface SupabaseUploadOptions {
  bucket: string;
  folder?: string;
  maxRetries?: number;
  onProgress?: (progress: number) => void;
}

export async function uploadFileToSupabase(
  file: File,
  options: SupabaseUploadOptions
): Promise<{ path: string; url: string }> {
  const { bucket, folder = '', maxRetries = 3, onProgress } = options;

  // Generate unique filename
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(7);
  const filename = `${timestamp}-${randomStr}-${file.name}`;
  const filepath = folder ? `${folder}/${filename}` : filename;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Upload file
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filepath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: publicData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filepath);

      onProgress?.(100);

      return {
        path: data.path,
        url: publicData.publicUrl,
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  throw lastError || new Error('Upload failed');
}

export async function deleteFileFromSupabase(
  bucket: string,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw error;
  }
}

export function getSignedUrlFromSupabase(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  return supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
    .then(({ data, error }) => {
      if (error) throw error;
      return data.signedUrl;
    });
}
```

### Integration in Component

```typescript
// src/components/FileUploadWithSupabase.tsx
import { FileDropzone } from '@/components/FileDropzone';
import { UploadProgress, FileUploadItem } from '@/components/UploadProgress';
import { uploadFileToSupabase } from '@/lib/supabaseFileUpload';
import { useState } from 'react';

export function FileUploadWithSupabase() {
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([]);

  const handleFiles = async (files: File[]) => {
    const newItems: FileUploadItem[] = files.map((file) => ({
      file,
      id: `${Date.now()}-${Math.random()}`,
      progress: 0,
      status: 'queued' as const,
    }));

    setUploadItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      try {
        setUploadItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: 'uploading' as const } : i
          )
        );

        const result = await uploadFileToSupabase(item.file, {
          bucket: 'resumes',
          folder: 'user-uploads',
          onProgress: (progress) => {
            setUploadItems((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, progress } : i
              )
            );
          },
        });

        setUploadItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'complete' as const, progress: 100 }
              : i
          )
        );
      } catch (error) {
        setUploadItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'error' as const,
                  error: (error as Error).message,
                }
              : i
          )
        );
      }
    }
  };

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={handleFiles} accept=".pdf,.docx" maxFiles={10} />
      <UploadProgress items={uploadItems} />
    </div>
  );
}
```

---

## TypeScript Interfaces

```typescript
// src/types/files.ts

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

export interface FileDropzoneState {
  isDragActive: boolean;
  error: string | null;
  isHovering: boolean;
}

export interface FileUploadItem {
  file: File;
  id: string;
  progress: number;
  status: 'queued' | 'uploading' | 'complete' | 'error';
  error?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: Date;
  url?: string;
}

export interface FileListProps {
  files: UploadedFile[];
  onDownload?: (file: UploadedFile) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  defaultView?: 'list' | 'grid';
}

export interface ImageUploadProps {
  onImageSelected?: (file: File) => void;
  previewUrl?: string;
  maxSize?: number;
  circular?: boolean;
  label?: string;
  disabled?: boolean;
}

export interface SupabaseUploadOptions {
  bucket: string;
  folder?: string;
  maxRetries?: number;
  onProgress?: (progress: number) => void;
}

export interface FileValidationRules {
  maxSize?: number;
  maxFiles?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

export interface FileValidationError {
  type: 'size' | 'type' | 'count' | 'unknown';
  message: string;
  file?: string;
}
```

---

## Implementation Checklist

- [ ] Copy FileDropzone component to `src/components/FileDropzone.tsx`
- [ ] Copy UploadProgress component to `src/components/UploadProgress.tsx`
- [ ] Copy FileList component to `src/components/FileList.tsx`
- [ ] Copy ImageUpload component to `src/components/ImageUpload.tsx`
- [ ] Copy fileIcons utility to `src/lib/fileIcons.ts`
- [ ] Copy fileValidation utility to `src/lib/fileValidation.ts`
- [ ] Copy supabaseFileUpload utility to `src/lib/supabaseFileUpload.ts`
- [ ] Copy TypeScript interfaces to `src/types/files.ts`
- [ ] Test drag-and-drop in light and dark modes
- [ ] Test progress tracking with real file upload
- [ ] Verify Supabase Storage integration
- [ ] Test mobile responsiveness (iOS/Android)
- [ ] Test accessibility with keyboard navigation
- [ ] Run `npm run build` to verify no type errors

---

## References

- [React File Upload Best Practices](https://dev.to/hexshift/implementing-drag-drop-file-uploads-in-react-without-external-libraries-1d31)
- [Shadcn/UI File Upload Components](https://blocks.so/file-upload)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [File API MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/File)

---

## Dark Mode Implementation

### Color Mapping
```tsx
// Light mode → Dark mode token mapping for file upload
// These follow design-tokens.md and dark-mode.md standards

// Backgrounds
bg-white          → dark:bg-gray-950
bg-gray-50        → dark:bg-gray-900
bg-gray-100       → dark:bg-gray-800

// Text
text-gray-900     → dark:text-gray-50
text-gray-600     → dark:text-gray-400
text-gray-500     → dark:text-gray-400

// Borders
border-gray-200   → dark:border-gray-800
border-dashed     → dark:border-gray-700
```

### Key Dark Mode Rules for File Upload
- Use semantic color tokens (`bg-card`, `text-foreground`) not raw colors
- Drag-drop zone: `border-dashed border-gray-300 dark:border-gray-700` with `bg-gray-50 dark:bg-gray-900`
- File list items: `bg-muted dark:bg-gray-800`
- Progress bar: use `bg-primary` for both themes (semantic)
- Test: switch to dark mode → visible dashed border, readable text, no white backgrounds

---

## Responsive Behavior

### Breakpoint Strategy
```tsx
// Mobile-first responsive for file upload
// sm: 640px | md: 768px | lg: 1024px | xl: 1280px

// Layout shifts:
// Mobile (< 640px):      simplified upload button (no drag-drop), compact file list, stacked
// Tablet (640-1023px):   drag-drop zone + horizontal file list
// Desktop (1024px+):     full drag-drop with preview grid, side-by-side layout
```

### Key Responsive Rules for File Upload
- Touch targets: min 44x44px on mobile
- Drag-drop zone mobile: `hidden sm:block` (use simple input on mobile)
- File list: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Preview thumbnails: `h-32 sm:h-40 lg:h-48`
- Buttons: `w-full sm:w-auto`
- File info: `text-xs sm:text-sm`
