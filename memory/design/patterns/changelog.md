# Changelog & What's New Patterns

**Last updated: 2026-04-04**

Production patterns for changelog pages, what's new modals, in-app announcement banners, release notes, and help center integration. Full React + TypeScript + shadcn/ui implementation, copy-paste ready.

---

## 1. Changelog Page

### Changelog Route & Component

```typescript
// pages/Changelog.tsx
import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type ChangeCategory = 'new' | 'improved' | 'fixed';

interface ChangelogEntry {
  id: string;
  version: string;
  date: string; // ISO 8601
  title: string;
  description: string;
  image?: string;
  changes: {
    category: ChangeCategory;
    title: string;
    description: string;
  }[];
}

interface ChangelogPageProps {
  entries: ChangelogEntry[];
}

export const ChangelogPage: React.FC<ChangelogPageProps> = ({ entries }) => {
  const [selectedCategory, setSelectedCategory] = useState<ChangeCategory | 'all'>('all');

  const filteredEntries =
    selectedCategory === 'all'
      ? entries
      : entries.map((entry) => ({
          ...entry,
          changes: entry.changes.filter((c) => c.category === selectedCategory),
        }));

  const categoryConfig = {
    new: { label: 'New', color: 'bg-green-100 text-green-800', icon: '✨' },
    improved: { label: 'Improved', color: 'bg-blue-100 text-blue-800', icon: '📈' },
    fixed: { label: 'Fixed', color: 'bg-yellow-100 text-yellow-800', icon: '🔧' },
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Changelog</h1>
          <p className="text-xl text-muted-foreground">
            Discover what's new in the project
          </p>
        </div>

        {/* Category filter */}
        <div className="mb-8 flex justify-center">
          <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="new">New</TabsTrigger>
              <TabsTrigger value="improved">Improved</TabsTrigger>
              <TabsTrigger value="fixed">Fixed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Changelog entries */}
        <div className="space-y-12">
          {filteredEntries.map((entry, index) => (
            <ChangelogEntry
              key={entry.id}
              entry={entry}
              categoryConfig={categoryConfig}
              isFirst={index === 0}
            />
          ))}
        </div>

        {/* Newsletter signup */}
        <div className="mt-16 rounded-lg bg-muted p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Stay Updated
          </h3>
          <p className="text-muted-foreground mb-4">
            Subscribe to get notified about new features and updates
          </p>
          <div className="flex gap-2 max-w-md mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button>Subscribe</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ChangelogEntryProps {
  entry: ChangelogEntry;
  categoryConfig: Record<ChangeCategory, { label: string; color: string; icon: string }>;
  isFirst?: boolean;
}

const ChangelogEntry: React.FC<ChangelogEntryProps> = ({
  entry,
  categoryConfig,
  isFirst,
}) => {
  const entryDate = parseISO(entry.date);

  return (
    <div className="relative border-l-2 border-border pl-8">
      {/* Timeline dot */}
      <div className="absolute -left-[13px] top-0 h-6 w-6 rounded-full bg-background border-2 border-border flex items-center justify-center">
        <div className="h-2 w-2 rounded-full bg-foreground" />
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Version header */}
        <div className="flex items-baseline gap-4 flex-wrap">
          <h2 className="text-2xl font-bold text-foreground">v{entry.version}</h2>
          <span className="text-sm text-muted-foreground">
            {format(entryDate, 'MMMM d, yyyy')}
          </span>
        </div>

        {/* Title and description */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {entry.title}
          </h3>
          <p className="text-muted-foreground">{entry.description}</p>
        </div>

        {/* Screenshot (if available) */}
        {entry.image && (
          <div className="rounded-lg overflow-hidden border border-border my-4">
            <img
              src={entry.image}
              alt={entry.title}
              className="w-full h-auto hover:scale-105 transition-transform"
            />
          </div>
        )}

        {/* Changes grouped by category */}
        <div className="space-y-4 mt-6">
          {['new', 'improved', 'fixed'].map((category) => {
            const changes = entry.changes.filter((c) => c.category === category as ChangeCategory);
            if (changes.length === 0) return null;

            const config = categoryConfig[category as ChangeCategory];
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{config.icon}</span>
                  <h4 className="font-semibold text-foreground">{config.label}</h4>
                </div>
                <ul className="space-y-2 ml-6">
                  {changes.map((change, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-muted-foreground mt-1">•</span>
                      <div>
                        <p className="font-medium text-foreground">{change.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {change.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        {isFirst && <div className="border-t border-border mt-8" />}
      </div>
    </div>
  );
};
```

### Sample Data Structure

```typescript
// data/changelog.ts
export const changelogEntries: ChangelogEntry[] = [
  {
    id: '2.1.0',
    version: '2.1.0',
    date: '2026-04-04',
    title: 'AI-Powered Skill Matching',
    description:
      'We've upgraded our resume ranking algorithm with advanced AI that now automatically identifies and matches skills.',
    image: 'https://cdn.example.com/changelog/ai-matching.png',
    changes: [
      {
        category: 'new',
        title: 'Skill Gap Analysis',
        description: 'See exactly which candidate skills align with job requirements',
      },
      {
        category: 'new',
        title: 'Interview Question Generation',
        description: 'Automatically generate targeted questions based on resume analysis',
      },
      {
        category: 'improved',
        title: 'Resume Parsing',
        description: '30% faster parsing with improved accuracy for edge cases',
      },
      {
        category: 'fixed',
        title: 'PDF Upload Issues',
        description: 'Fixed issues with certain PDF formats not uploading correctly',
      },
    ],
  },
  {
    id: '2.0.0',
    version: '2.0.0',
    date: '2026-03-15',
    title: 'Major Platform Redesign',
    description:
      'Complete redesign of the the project interface for better usability and performance.',
    changes: [
      {
        category: 'new',
        title: 'Dark Mode',
        description: 'Choose between light and dark themes',
      },
      {
        category: 'improved',
        title: 'Performance',
        description: 'Page load times reduced by 40%',
      },
    ],
  },
];
```

---

## 2. What's New Modal

### Modal Component

```typescript
// components/WhatsNewModal.tsx
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Feature {
  id: string;
  title: string;
  description: string;
  image: string;
  cta?: {
    label: string;
    href: string;
  };
}

interface WhatsNewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  features: Feature[];
  version: string;
  onMarkAsViewed?: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  open,
  onOpenChange,
  features,
  version,
  onMarkAsViewed,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentFeature = features[currentIndex];

  const handleNext = () => {
    if (currentIndex < features.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    onMarkAsViewed?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">What's New in v{version}</DialogTitle>
              <DialogDescription>
                {currentIndex + 1} of {features.length}
              </DialogDescription>
            </div>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Feature carousel */}
        <div className="space-y-6">
          {/* Image */}
          <div className="relative w-full h-64 bg-muted rounded-lg overflow-hidden">
            <img
              src={currentFeature.image}
              alt={currentFeature.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {currentFeature.title}
              </h3>
              <p className="text-muted-foreground">{currentFeature.description}</p>
            </div>

            {currentFeature.cta && (
              <Button asChild>
                <a href={currentFeature.cta.href}>{currentFeature.cta.label}</a>
              </Button>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
            {/* Dots */}
            <div className="flex gap-1.5">
              {features.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors',
                    idx === currentIndex ? 'bg-foreground' : 'bg-muted'
                  )}
                  aria-label={`Go to feature ${idx + 1}`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentIndex === features.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {currentIndex === features.length - 1 && (
                <Button onClick={handleClose}>Got it</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

### Hook to Show Modal on First Visit

```typescript
// hooks/useWhatsNewModal.ts
import { useEffect, useState } from 'react';

interface UseWhatsNewModalProps {
  version: string;
  storageKey?: string;
}

export const useWhatsNewModal = ({
  version,
  storageKey = 'last_seen_whats_new_version',
}: UseWhatsNewModalProps) => {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Check if user has seen this version
    const lastSeen = localStorage.getItem(storageKey);

    if (lastSeen !== version) {
      setShouldShow(true);
    }
  }, [version, storageKey]);

  const markAsViewed = () => {
    localStorage.setItem(storageKey, version);
    setShouldShow(false);
  };

  return { shouldShow, markAsViewed };
};

// Usage in App.tsx
export const App: React.FC = () => {
  const { shouldShow, markAsViewed } = useWhatsNewModal({ version: '2.1.0' });
  const [whatsNewOpen, setWhatsNewOpen] = useState(shouldShow);

  useEffect(() => {
    setWhatsNewOpen(shouldShow);
  }, [shouldShow]);

  return (
    <>
      <WhatsNewModal
        open={whatsNewOpen}
        onOpenChange={setWhatsNewOpen}
        features={newFeatures}
        version="2.1.0"
        onMarkAsViewed={markAsViewed}
      />
      {/* Rest of app */}
    </>
  );
};
```

---

## 3. What's New Badge

```typescript
// components/WhatsNewBadge.tsx
import React from 'react';
import { Dot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsNewBadgeProps {
  hasNew: boolean;
  onClick?: () => void;
  className?: string;
}

export const WhatsNewBadge: React.FC<WhatsNewBadgeProps> = ({
  hasNew,
  onClick,
  className,
}) => {
  if (!hasNew) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium hover:bg-green-200 transition-colors',
        className
      )}
    >
      <Dot className="h-3 w-3 animate-pulse" />
      What's New
    </button>
  );
};

// Usage in user menu
export const UserMenu: React.FC = () => {
  const [hasUnseenUpdates, setHasUnseenUpdates] = useState(true);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="space-y-2">
          <button className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-center justify-between">
            <span>Changelog</span>
            <WhatsNewBadge hasNew={hasUnseenUpdates} />
          </button>
          <button className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm">
            Help & Docs
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
```

---

## 4. In-App Announcement Banner

```typescript
// components/AnnouncementBanner.tsx
import React, { useEffect, useState } from 'react';
import { AlertCircle, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AnnouncementType = 'info' | 'success' | 'warning' | 'feature';

interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  description?: string;
  cta?: {
    label: string;
    href: string;
  };
  dismissible?: boolean;
}

interface AnnouncementBannerProps {
  announcement: Announcement;
  onDismiss?: (id: string) => void;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({
  announcement,
  onDismiss,
}) => {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.(announcement.id);
  };

  if (dismissed) return null;

  const typeConfig = {
    info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', icon: 'text-blue-600' },
    success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', icon: 'text-green-600' },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-900', icon: 'text-yellow-600' },
    feature: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', icon: 'text-purple-600' },
  };

  const config = typeConfig[announcement.type];

  return (
    <div
      className={cn(
        'flex items-start gap-4 px-4 py-3 sm:px-6 border-l-4',
        config.bg,
        config.border,
        config.text
      )}
      role="alert"
    >
      <AlertCircle className={cn('h-5 w-5 flex-shrink-0 mt-0.5', config.icon)} />

      <div className="flex-1 min-w-0">
        <p className="font-semibold">{announcement.title}</p>
        {announcement.description && (
          <p className="text-sm mt-1 opacity-90">{announcement.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {announcement.cta && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="text-xs"
          >
            <a href={announcement.cta.href} className="flex items-center gap-1">
              {announcement.cta.label}
              <ArrowRight className="h-3 w-3" />
            </a>
          </Button>
        )}

        {announcement.dismissible !== false && (
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// Usage with multiple announcements
export const AnnouncementStack: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([
    {
      id: 'ai-feature',
      type: 'feature',
      title: 'New: AI-Powered Skill Matching',
      description: 'We've upgraded resume analysis with advanced AI.',
      cta: { label: 'Learn more', href: '/changelog' },
      dismissible: true,
    },
  ]);

  const handleDismiss = (id: string) => {
    // Persist dismissal in user preferences
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    // TODO: Save to backend: updateUserPreferences({ dismissed_announcements: [id] })
  };

  return (
    <div className="space-y-2">
      {announcements.map((announcement) => (
        <AnnouncementBanner
          key={announcement.id}
          announcement={announcement}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
};
```

---

## 5. Help Center / Floating Help Button

```typescript
// components/HelpCenter.tsx
import React, { useState } from 'react';
import { HelpCircle, MessageSquare, BookOpen, ExternalLink, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

interface HelpCenterProps {
  onWhatsNewClick?: () => void;
}

export const HelpCenter: React.FC<HelpCenterProps> = ({ onWhatsNewClick }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="fixed bottom-6 right-6 rounded-full shadow-lg hover:shadow-xl transition-shadow"
          title="Help & Feedback"
        >
          <HelpCircle className="h-6 w-6" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        <div className="space-y-2">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-foreground">Help & Feedback</h3>
          </div>

          {/* Menu items */}
          <div className="px-2 py-2 space-y-1">
            <button
              onClick={onWhatsNewClick}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-3 text-sm"
            >
              <span className="text-lg">✨</span>
              <span>What's New</span>
            </button>

            <a
              href="/changelog"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-3 text-sm"
            >
              <BookOpen className="h-4 w-4" />
              <span>Changelog</span>
              <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
            </a>

            <a
              href="https://docs.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-3 text-sm"
            >
              <BookOpen className="h-4 w-4" />
              <span>Help Docs</span>
              <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
            </a>

            <a
              href="mailto:support@example.com"
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-3 text-sm"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Contact Support</span>
            </a>

            <Separator className="my-2" />

            <button
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-3 text-sm"
              title="Keyboard Shortcuts (⌘K)"
            >
              <Keyboard className="h-4 w-4" />
              <span>Keyboard Shortcuts</span>
            </button>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border bg-muted/50 text-xs text-muted-foreground">
            <p>v2.1.0 • Built with ❤️</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
```

---

## 6. Keyboard Shortcuts Modal

```typescript
// components/KeyboardShortcutsModal.tsx
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  name: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    name: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['⌘', 'J'], description: 'Toggle dark mode' },
      { keys: ['?'], description: 'Open keyboard shortcuts' },
    ],
  },
  {
    name: 'Chat',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line' },
      { keys: ['Esc'], description: 'Close chat' },
    ],
  },
  {
    name: 'Editing',
    shortcuts: [
      { keys: ['⌘', 'Z'], description: 'Undo' },
      { keys: ['⌘', 'Shift', 'Z'], description: 'Redo' },
      { keys: ['⌘', 'S'], description: 'Save' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onOpenChange,
}) => {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Press any key combination to learn what it does
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.name}>
              <h3 className="font-semibold text-foreground mb-4">{group.name}</h3>
              <div className="space-y-3">
                {group.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <React.Fragment key={keyIdx}>
                          <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-medium text-foreground">
                            {key}
                          </kbd>
                          {keyIdx < shortcut.keys.length - 1 && (
                            <span className="text-muted-foreground">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Hook to register shortcuts
export const useKeyboardShortcuts = () => {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? key to open shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { shortcutsOpen, setShortcutsOpen };
};
```

---

## 7. Release Notes Data Format

```typescript
// data/releaseNotes.ts
export const releaseNotes = {
  '2.1.0': {
    version: '2.1.0',
    releaseDate: '2026-04-04',
    title: 'AI-Powered Skill Matching',
    description: 'Advanced AI now automatically identifies and matches candidate skills with job requirements.',
    features: [
      {
        category: 'new',
        title: 'Skill Gap Analysis',
        description: 'See exactly which candidate skills align with job requirements',
        image: 'https://cdn.example.com/skill-gap.png',
      },
      {
        category: 'new',
        title: 'Interview Question Generation',
        description: 'Automatically generate targeted questions based on resume analysis',
      },
      {
        category: 'improved',
        title: 'Resume Parsing',
        description: '30% faster parsing with improved accuracy',
      },
      {
        category: 'fixed',
        title: 'PDF Upload Issues',
        description: 'Fixed issues with certain PDF formats',
      },
    ],
    downloadLinks: {
      windows: 'https://downloads.example.com/rankora-2.1.0-win.exe',
      mac: 'https://downloads.example.com/rankora-2.1.0-mac.dmg',
      linux: 'https://downloads.example.com/rankora-2.1.0-linux.AppImage',
    },
  },
};
```

---

## 8. Changelog Integration Checklist

- [ ] Create `/changelog` route
- [ ] Add changelog data to JSON/database
- [ ] Create `WhatsNewModal` component
- [ ] Hook up `useWhatsNewModal` in `App.tsx`
- [ ] Add `WhatsNewBadge` to sidebar/menu
- [ ] Implement `AnnouncementBanner` for major features
- [ ] Create `HelpCenter` floating button
- [ ] Add keyboard shortcuts modal with `useKeyboardShortcuts`
- [ ] Auto-update `lastSeenVersion` in user preferences
- [ ] Test first-visit flow (should show modal)
- [ ] Test version bump (localStorage cleared for testing)
- [ ] Link changelog from help menu
- [ ] Add newsletter signup to changelog page
- [ ] Create admin panel to manage announcements

---

## Dark Mode Implementation

### Color Mapping
```tsx
// Light mode → Dark mode token mapping for changelog
// These follow design-tokens.md and dark-mode.md standards

// Backgrounds
bg-white          → dark:bg-gray-950
bg-gray-50        → dark:bg-gray-900
bg-gray-100       → dark:bg-gray-800
bg-green-100      → dark:bg-green-950
bg-blue-100       → dark:bg-blue-950
bg-yellow-100     → dark:bg-yellow-950

// Text
text-gray-900     → dark:text-gray-50
text-gray-600     → dark:text-gray-400

// Badges
bg-green-100      → dark:bg-green-950 + text-green-800 → dark:text-green-200
```

### Key Dark Mode Rules for Changelog
- Use semantic color tokens (`bg-card`, `text-foreground`) not raw colors
- Timeline dot: `bg-background border-border` maintains contrast
- Version header: use `text-foreground`
- Category badges: `bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200`
- Test: switch to dark mode → timeline visible, text readable, badges distinct from background

---

## Responsive Behavior

### Breakpoint Strategy
```tsx
// Mobile-first responsive for changelog
// sm: 640px | md: 768px | lg: 1024px | xl: 1280px

// Layout shifts:
// Mobile (< 640px):      single column, collapsible version cards, stacked changes
// Tablet (640-1023px):   timeline visible, 2-column layout for changes
// Desktop (1024px+):     full timeline layout with version cards side-by-side
```

### Key Responsive Rules for Changelog
- Touch targets: min 44x44px on mobile
- Version card: `w-full sm:max-w-2xl lg:max-w-3xl`
- Timeline line: `hidden sm:block` (don't show on mobile, show on tablet+)
- Change list: `ml-6 sm:ml-8 lg:ml-10`
- Image: `w-full sm:max-w-lg lg:max-w-2xl`
- Collapsible on mobile: use accordion for version history
- Newsletter form: `flex flex-col sm:flex-row gap-2`

