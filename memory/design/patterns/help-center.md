# Help Center & In-App Support Patterns

**Last updated: 2026-04-04**

Comprehensive guide to building production-grade help centers, documentation, support interfaces, and in-app help systems. This covers page layouts, component patterns, accessibility, responsive design, and TypeScript implementations.

---

## 1. Help Center Page Layout

### Overview
The main help landing page (`/help`, `/docs`) serves as the entry point for all support content. Design priorities:
- **Search-first:** Search bar is the primary entry point
- **Category discovery:** Visual category grid for browsing
- **Clear information hierarchy:** Prominent, scannable layout
- **Responsive:** Works on mobile, tablet, desktop

### Page Structure

```tsx
// pages/Help.tsx
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search, BookOpen, CreditCard, AlertCircle, Zap, Code } from 'lucide-react'

interface HelpCategory {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  articleCount: number
  href: string
  color: string
}

const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Set up your account and first steps',
    icon: <Zap className="w-6 h-6" />,
    articleCount: 12,
    href: '/help/getting-started',
    color: 'from-blue-500 to-blue-600',
  },
  {
    id: 'account-billing',
    title: 'Account & Billing',
    description: 'Manage your account, plans, and payments',
    icon: <CreditCard className="w-6 h-6" />,
    articleCount: 8,
    href: '/help/account-billing',
    color: 'from-green-500 to-green-600',
  },
  {
    id: 'features',
    title: 'Features',
    description: 'Learn how to use every feature',
    icon: <BookOpen className="w-6 h-6" />,
    articleCount: 24,
    href: '/help/features',
    color: 'from-purple-500 to-purple-600',
  },
  {
    id: 'integrations',
    title: 'API & Integrations',
    description: 'Connect with your favorite tools',
    icon: <Code className="w-6 h-6" />,
    articleCount: 16,
    href: '/help/integrations',
    color: 'from-orange-500 to-orange-600',
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Fix common issues and errors',
    icon: <AlertCircle className="w-6 h-6" />,
    articleCount: 18,
    href: '/help/troubleshooting',
    color: 'from-red-500 to-red-600',
  },
]

export function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredCategories, setFilteredCategories] = useState(HELP_CATEGORIES)

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    const filtered = HELP_CATEGORIES.filter(cat =>
      cat.title.toLowerCase().includes(query.toLowerCase()) ||
      cat.description.toLowerCase().includes(query.toLowerCase())
    )
    setFilteredCategories(filtered)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Header Section */}
      <div className="border-b bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Help & Documentation
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
            Find answers, learn features, and get support from our comprehensive knowledge base
          </p>

          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search help articles, FAQs, guides..."
              className="pl-10 h-12 text-base"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              aria-label="Search help articles"
            />
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories.length > 0 ? (
            filteredCategories.map(category => (
              <a key={category.id} href={category.href} className="group">
                <Card className="h-full hover:shadow-lg hover:border-primary transition-all duration-200">
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${category.color} text-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      {category.icon}
                    </div>
                    <CardTitle className="group-hover:text-primary transition-colors">{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="ghost" className="p-0 h-auto text-sm">
                      View {category.articleCount} articles →
                    </Button>
                  </CardContent>
                </Card>
              </a>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">No categories found. Try a different search.</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-slate-50 dark:bg-slate-800 border-t border-b">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
          <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" asChild className="justify-start">
              <a href="/help/faq">Frequently Asked Questions</a>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <a href="/contact">Contact Support</a>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <a href="/api">API Documentation</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 2. Article Page Layout

### Overview
Individual article pages (`/help/getting-started/create-first-job`) include:
- **Sticky table of contents:** Auto-generated from headings
- **Main article content:** Prose-styled text with syntax highlighting
- **Related articles:** Contextual links to similar content
- **Helpful feedback:** Was this article helpful?

### Article Component

```tsx
// pages/HelpArticle.tsx
import { useEffect, useState } from 'react'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ThumbsUp, ThumbsDown, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TableOfContentsItem {
  id: string
  level: number
  text: string
}

interface RelatedArticle {
  title: string
  href: string
  category: string
}

export function HelpArticle() {
  const [toc, setToc] = useState<TableOfContentsItem[]>([])
  const [activeSection, setActiveSection] = useState<string>('')
  const [isHelpful, setIsHelpful] = useState<boolean | null>(null)

  // Generate table of contents from headings
  useEffect(() => {
    const headings = Array.from(document.querySelectorAll('h2, h3')).map(heading => ({
      id: heading.id || heading.textContent?.toLowerCase().replace(/\s+/g, '-') || '',
      level: parseInt(heading.tagName[1]),
      text: heading.textContent || '',
    }))
    setToc(headings)

    // Track scroll position for active section
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id)
        }
      })
    })

    headings.forEach(h => {
      const element = document.getElementById(h.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  const relatedArticles: RelatedArticle[] = [
    { title: 'Advanced Resume Analysis', href: '/help/features/resume-analysis', category: 'Features' },
    { title: 'Managing Job Postings', href: '/help/features/manage-jobs', category: 'Features' },
    { title: 'Understanding Scores', href: '/help/getting-started/scores', category: 'Getting Started' },
  ]

  const handleHelpful = async (helpful: boolean) => {
    setIsHelpful(helpful)
    // Send feedback to analytics
    try {
      await fetch('/api/feedback/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: 'current-article-id',
          helpful,
          timestamp: new Date().toISOString(),
        }),
      })
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Breadcrumb */}
      <div className="border-b bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/help">Help</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbLink href="/help/getting-started">Getting Started</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem><BreadcrumbPage>Create Your First Job</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Article Content */}
          <div className="lg:col-span-2">
            {/* Article Header */}
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-3">Create Your First Job Posting</h1>
              <p className="text-lg text-muted-foreground mb-4">
                Learn how to upload a job description and start ranking candidates
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Updated 2 weeks ago</span>
                <span>•</span>
                <span>5 min read</span>
              </div>
            </div>

            {/* Article Content */}
            <div className="prose prose-sm dark:prose-invert max-w-none mb-8">
              <h2 id="step-1-navigate-to-jobs">Step 1: Navigate to Your Dashboard</h2>
              <p>
                Log in to your account and you'll see the main dashboard. Click the "New Job" button in the top navigation.
              </p>

              <h2 id="step-2-paste-job-description">Step 2: Paste Your Job Description</h2>
              <p>
                In the form that appears, paste your complete job description in the large text field. Include:
              </p>
              <ul>
                <li>Job title and department</li>
                <li>Required qualifications</li>
                <li>Key responsibilities</li>
                <li>Nice-to-have skills</li>
              </ul>

              <h3 id="example">Example Job Description</h3>
              <pre><code>{`Title: Senior React Developer

Required:
- 5+ years React experience
- TypeScript proficiency
- REST API knowledge

Nice to have:
- GraphQL experience
- Next.js knowledge
- Team leadership`}</code></pre>

              <h2 id="step-3-upload-resumes">Step 3: Upload Resumes</h2>
              <p>
                Click "Upload Resumes" and select PDF or DOCX files. You can upload multiple resumes at once.
              </p>

              <h2 id="next-steps">Next Steps</h2>
              <p>
                Once uploaded, our AI will analyze the resumes and rank them based on fit. <a href="/help/features/understand-scores">Learn how scores are calculated</a>.
              </p>
            </div>

            {/* Feedback Section */}
            <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Was this article helpful?</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex gap-2 mb-4">
                  <Button
                    variant={isHelpful === true ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleHelpful(true)}
                  >
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    Yes, helpful
                  </Button>
                  <Button
                    variant={isHelpful === false ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleHelpful(false)}
                  >
                    <ThumbsDown className="w-4 h-4 mr-2" />
                    Not helpful
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Share2 className="w-4 h-4" />
                  Share this article
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Sidebar: Table of Contents + Related */}
          <div className="lg:col-span-2">
            {/* Sticky Table of Contents */}
            <div className="sticky top-4 space-y-6">
              {toc.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">On this page</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <nav className="space-y-1 p-4">
                      {toc.map(item => (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          className={cn(
                            'block text-sm transition-colors py-2',
                            item.level === 3 && 'ml-4',
                            activeSection === item.id
                              ? 'text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {item.text}
                        </a>
                      ))}
                    </nav>
                  </CardContent>
                </Card>
              )}

              {/* Related Articles */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Related Articles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {relatedArticles.map((article, idx) => (
                    <div key={idx}>
                      <a href={article.href} className="text-sm font-medium text-primary hover:underline block mb-1">
                        {article.title}
                      </a>
                      <p className="text-xs text-muted-foreground">{article.category}</p>
                      {idx < relatedArticles.length - 1 && <Separator className="mt-3" />}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Contact Support */}
              <Card className="bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-base">Still need help?</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Can't find what you're looking for?
                  </p>
                  <Button asChild className="w-full">
                    <a href="/contact">Contact Support</a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 3. In-App Help Widget

### Overview
A floating "?" button that opens contextual help. Provides quick access to relevant articles, search, and support.

### Help Widget Component

```tsx
// components/HelpWidget.tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { HelpCircle, Search, Keyboard, MessageCircle, Lightbulb } from 'lucide-react'

interface HelpLink {
  title: string
  href: string
  icon: React.ReactNode
}

const quickLinks: HelpLink[] = [
  {
    title: 'Getting Started',
    href: '/help/getting-started',
    icon: <Lightbulb className="w-4 h-4" />,
  },
  {
    title: 'Keyboard Shortcuts',
    href: '#',
    icon: <Keyboard className="w-4 h-4" />,
  },
  {
    title: 'Contact Support',
    href: '/contact',
    icon: <MessageCircle className="w-4 h-4" />,
  },
]

const contextualArticles: Record<string, HelpLink[]> = {
  '/dashboard': [
    { title: 'Understanding Your Dashboard', href: '/help/dashboard', icon: <Lightbulb className="w-4 h-4" /> },
    { title: 'Managing Jobs', href: '/help/jobs', icon: <Lightbulb className="w-4 h-4" /> },
  ],
  '/jobs': [
    { title: 'Create a Job Posting', href: '/help/create-job', icon: <Lightbulb className="w-4 h-4" /> },
    { title: 'Upload Resumes', href: '/help/upload-resumes', icon: <Lightbulb className="w-4 h-4" /> },
  ],
}

export function HelpWidget() {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Get contextual articles based on current page
  const currentPath = window.location.pathname
  const relevant = contextualArticles[currentPath] || []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-4 right-4 rounded-full shadow-lg h-14 w-14 bg-primary hover:bg-primary/90 z-40"
          aria-label="Open help"
        >
          <HelpCircle className="h-6 w-6" />
        </Button>
      </PopoverTrigger>

      <PopoverContent side="top" align="end" className="w-[380px] p-0 mb-2">
        <Card className="border-0 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Help & Support</CardTitle>
            <CardDescription>Find answers and get help</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search articles..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Contextual Articles */}
            {relevant.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Related to this page</p>
                <div className="space-y-2">
                  {relevant.map((article) => (
                    <a
                      key={article.title}
                      href={article.href}
                      className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {article.icon}
                      <span>{article.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Links */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Quick Links</p>
              <div className="space-y-2">
                {quickLinks.map((link) => (
                  <a
                    key={link.title}
                    href={link.href}
                    className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {link.icon}
                    <span>{link.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}
```

---

## 4. Knowledge Base Search

### Overview
Advanced search interface with autocomplete, result grouping, and filtering.

### Search Component

```tsx
// components/KnowledgeBaseSearch.tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { FileText, HelpCircle, Code } from 'lucide-react'
import { useEffect } from 'react'

interface SearchResult {
  id: string
  title: string
  excerpt: string
  category: 'article' | 'faq' | 'api'
  href: string
}

const mockResults: SearchResult[] = [
  {
    id: '1',
    title: 'Create Your First Job Posting',
    excerpt: 'Learn how to upload a job description and start ranking candidates...',
    category: 'article',
    href: '/help/getting-started/create-job',
  },
  {
    id: '2',
    title: 'How long does ranking take?',
    excerpt: 'Ranking typically takes 2-5 minutes depending on resume size...',
    category: 'faq',
    href: '/help/faq#ranking-time',
  },
  {
    id: '3',
    title: 'Resume Upload API',
    excerpt: 'POST /api/resumes - Upload resumes programmatically...',
    category: 'api',
    href: '/api/docs/resumes',
  },
]

export function KnowledgeBaseSearch() {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setResults([])
      return
    }
    // Filter mock results; in production, call API
    const filtered = mockResults.filter(result =>
      result.title.toLowerCase().includes(query.toLowerCase()) ||
      result.excerpt.toLowerCase().includes(query.toLowerCase())
    )
    setResults(filtered)
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'article':
        return <FileText className="w-4 h-4" />
      case 'faq':
        return <HelpCircle className="w-4 h-4" />
      case 'api':
        return <Code className="w-4 h-4" />
      default:
        return null
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'article':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      case 'faq':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      case 'api':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      default:
        return ''
    }
  }

  const groupedResults = {
    articles: results.filter(r => r.category === 'article'),
    faqs: results.filter(r => r.category === 'faq'),
    api: results.filter(r => r.category === 'api'),
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl p-0 shadow-lg overflow-hidden">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search knowledge base... (Press Cmd+/ to focus)"
            value={searchQuery}
            onValueChange={handleSearch}
            className="border-0 text-base py-4"
          />

          {results.length === 0 && searchQuery ? (
            <CommandEmpty className="py-6 px-4">
              <p className="text-center text-muted-foreground">
                No results found for "<strong>{searchQuery}</strong>"
              </p>
              <p className="text-center text-sm text-muted-foreground mt-2">
                Try different keywords or <a href="/contact" className="text-primary underline">contact support</a>
              </p>
            </CommandEmpty>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {groupedResults.articles.length > 0 && (
                <>
                  <CommandGroup heading="Articles">
                    {groupedResults.articles.map((result) => (
                      <CommandItem
                        key={result.id}
                        value={result.id}
                        onSelect={() => {
                          window.location.href = result.href
                          setOpen(false)
                        }}
                        className="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 flex items-start gap-3"
                      >
                        <div className="mt-1">{getCategoryIcon(result.category)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{result.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.excerpt}</p>
                        </div>
                        <Badge className={getCategoryColor(result.category)}>
                          {result.category.charAt(0).toUpperCase() + result.category.slice(1)}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {(groupedResults.faqs.length > 0 || groupedResults.api.length > 0) && <CommandSeparator />}
                </>
              )}

              {groupedResults.faqs.length > 0 && (
                <>
                  <CommandGroup heading="FAQs">
                    {groupedResults.faqs.map((result) => (
                      <CommandItem
                        key={result.id}
                        value={result.id}
                        onSelect={() => {
                          window.location.href = result.href
                          setOpen(false)
                        }}
                        className="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <div>{getCategoryIcon(result.category)}</div>
                        <div className="flex-1 ml-2"><p className="text-sm font-medium">{result.title}</p></div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {groupedResults.api.length > 0 && <CommandSeparator />}
                </>
              )}

              {groupedResults.api.length > 0 && (
                <CommandGroup heading="API Docs">
                  {groupedResults.api.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={result.id}
                      onSelect={() => {
                        window.location.href = result.href
                        setOpen(false)
                      }}
                      className="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <div>{getCategoryIcon(result.category)}</div>
                      <div className="flex-1 ml-2"><p className="text-sm font-medium">{result.title}</p></div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </div>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 5. FAQ Section

### Overview
Accordion-based FAQ with search, grouping, and structured data for SEO.

### FAQ Component

```tsx
// components/FAQSection.tsx
import { useState } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FAQItem {
  id: string
  category: string
  question: string
  answer: string
}

const faqData: FAQItem[] = [
  {
    id: '1',
    category: 'Getting Started',
    question: 'How do I create a new job posting?',
    answer: 'To create a new job posting, click the "New Job" button on your dashboard, paste your job description, and click "Create". Our AI will analyze the description and prepare to rank resumes.',
  },
  {
    id: '2',
    category: 'Getting Started',
    question: 'What file formats do you support?',
    answer: 'We support PDF and DOCX resume files. Maximum file size is 10MB per resume.',
  },
  {
    id: '3',
    category: 'Billing',
    question: 'How much does resume ranking cost?',
    answer: 'Pricing depends on your plan. Free plan includes 5 rankings per month. Pro plan includes 100 rankings. See our pricing page for details.',
  },
  {
    id: '4',
    category: 'Billing',
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes, you can cancel your subscription anytime. Your access will continue until the end of the billing period.',
  },
  {
    id: '5',
    category: 'Features',
    question: 'How accurate is the AI ranking?',
    answer: 'Our AI is trained on thousands of successful hires. Accuracy depends on how detailed your job description is. More detail = better rankings.',
  },
]

export function FAQSection() {
  const [searchQuery, setSearchQuery] = useState('')
  const [openItems, setOpenItems] = useState<string[]>([])

  const filteredFAQ = faqData.filter(item =>
    item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const grouped = filteredFAQ.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, FAQItem[]>)

  // Structured data for SEO
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search FAQs..."
          className="pl-10 h-11"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* FAQ Groups */}
      {Object.entries(grouped).length > 0 ? (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-lg font-semibold mb-4">{category}</h3>
            <Accordion type="single" collapsible value={openItems[0]} onValueChange={(val) => setOpenItems([val])}>
              {items.map(item => (
                <AccordionItem key={item.id} value={item.id} className="border-b last:border-0">
                  <AccordionTrigger className="text-base font-medium py-4 hover:text-primary">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No FAQs match your search.</p>
        </div>
      )}
    </div>
  )
}
```

---

## 6. Contact Support Form

### Overview
Integrated support form with auto-filled context (user email, page URL, browser info).

### Support Form Component

```tsx
// components/ContactSupportForm.tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

const supportSchema = z.object({
  subject: z.enum(['bug', 'feature', 'billing', 'general'], { errorMap: () => ({ message: 'Please select a subject' }) }),
  description: z.string().min(10, 'Please provide at least 10 characters').max(5000),
  priority: z.enum(['low', 'medium', 'high']),
  email: z.string().email(),
  attachmentUrl: z.string().optional(),
})

type SupportFormData = z.infer<typeof supportSchema>

export function ContactSupportForm() {
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<SupportFormData>({
    resolver: zodResolver(supportSchema),
    defaultValues: {
      subject: 'general',
      priority: 'medium',
      email: '', // Would be pre-filled from auth context in real app
      description: '',
    },
  })

  const onSubmit = async (data: SupportFormData) => {
    setIsLoading(true)
    try {
      const context = {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }

      await fetch('/api/support/create-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, context }),
      })

      setSubmitted(true)
      toast.success('Support ticket created! We\'ll get back to you within 24 hours.')
    } catch (error) {
      toast.error('Failed to create support ticket. Please try again.')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  if (submitted) {
    return (
      <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
        <CheckCircle className="h-5 w-5 text-green-600" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          <strong>Support ticket created!</strong> We'll review your issue and get back to you within 24 hours. Check your email for the ticket number.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <FormField name="subject" render={({ field }) => (
          <FormItem>
            <FormLabel>Subject</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger><SelectValue /></SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="billing">Billing Question</SelectItem>
                <SelectItem value="general">General Inquiry</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <FormField name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Describe your issue or request in detail..." rows={6} />
            </FormControl>
            <FormDescription>Be as detailed as possible to help us assist you faster</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <FormField name="priority" render={({ field }) => (
          <FormItem>
            <FormLabel>Priority</FormLabel>
            <FormControl>
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="low" id="low" />
                  <label htmlFor="low" className="text-sm cursor-pointer">Low - Can wait</label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="medium" id="medium" />
                  <label htmlFor="medium" className="text-sm cursor-pointer">Medium - Normal response time</label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="high" id="high" />
                  <label htmlFor="high" className="text-sm cursor-pointer">High - Urgent issue</label>
                </div>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input {...field} type="email" placeholder="your@email.com" />
            </FormControl>
            <FormDescription>We'll use this email to send you updates</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
          {isLoading ? 'Creating ticket...' : 'Submit Support Request'}
        </Button>
      </form>
    </Form>
  )
}
```

---

## 7. Keyboard Shortcuts Dialog

### Overview
Accessible keyboard shortcuts reference triggered by "?" key or help menu.

### Shortcuts Component

```tsx
// components/KeyboardShortcuts.tsx
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface Shortcut {
  keys: string[]
  description: string
  category: 'navigation' | 'actions' | 'general'
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['Cmd', 'K'], description: 'Open search', category: 'general' },
  { keys: ['Cmd', '/'], description: 'Open help', category: 'general' },
  { keys: ['?'], description: 'Show this dialog', category: 'general' },
  { keys: ['G', 'H'], description: 'Go to home', category: 'navigation' },
  { keys: ['G', 'J'], description: 'Go to jobs', category: 'navigation' },
  { keys: ['G', 'S'], description: 'Go to settings', category: 'navigation' },
  { keys: ['Cmd', 'N'], description: 'New job', category: 'actions' },
  { keys: ['Cmd', 'S'], description: 'Save', category: 'actions' },
  { keys: ['Escape'], description: 'Close dialog', category: 'actions' },
]

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === '?' && !open) {
        setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open])

  const grouped = SHORTCUTS.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {} as Record<string, Shortcut[]>)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Use these shortcuts to work faster</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold capitalize mb-3 text-muted-foreground">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                    <p className="text-sm">{shortcut.description}</p>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <div key={keyIdx} className="flex items-center gap-1">
                          {keyIdx > 0 && <span className="text-xs text-muted-foreground">+</span>}
                          <kbd className={cn(
                            'px-2 py-1 text-xs font-mono rounded border',
                            'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700',
                            'text-slate-900 dark:text-slate-100'
                          )}>
                            {key}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {Object.entries(grouped).length > 1 && <Separator className="mt-4" />}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 8. Onboarding Tooltips / Feature Tours

### Overview
Step-by-step guided tours for new features using popover tooltips.

### Feature Tour Component

```tsx
// components/FeatureTour.tsx
import { useState, useEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { X } from 'lucide-react'

interface TourStep {
  id: string
  title: string
  description: string
  targetSelector: string
  position?: 'top' | 'right' | 'bottom' | 'left'
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'step-1',
    title: 'Welcome to the project',
    description: 'Let\'s walk through the key features. Click "Next" to begin.',
    targetSelector: 'body',
    position: 'bottom',
  },
  {
    id: 'step-2',
    title: 'Create a New Job',
    description: 'Click this button to create your first job posting and upload resumes.',
    targetSelector: '[data-tour="new-job-btn"]',
    position: 'bottom',
  },
  {
    id: 'step-3',
    title: 'View Rankings',
    description: 'Once you upload resumes, your candidates will be ranked by fit. The best matches appear first.',
    targetSelector: '[data-tour="results-table"]',
    position: 'left',
  },
  {
    id: 'step-4',
    title: 'Manage Credits',
    description: 'Your credit balance is displayed in the top-right. Each ranking costs 1 credit.',
    targetSelector: '[data-tour="credit-badge"]',
    position: 'bottom',
  },
]

export function FeatureTour({ featureKey = 'onboarding' }: { featureKey?: string }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<DOMRect | null>(null)

  const tourCompleted = localStorage.getItem(`tour-${featureKey}`) === 'true'

  useEffect(() => {
    if (tourCompleted || isOpen === false) return

    const step = TOUR_STEPS[currentStep]
    const element = document.querySelector(step.targetSelector)
    if (element) {
      setPosition(element.getBoundingClientRect())
    }
  }, [currentStep, isOpen, featureKey, tourCompleted])

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleSkip = () => {
    handleComplete()
  }

  const handleComplete = () => {
    localStorage.setItem(`tour-${featureKey}`, 'true')
    setIsOpen(false)
    setCurrentStep(0)
  }

  if (tourCompleted) {
    return null
  }

  const step = TOUR_STEPS[currentStep]
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100

  return (
    <>
      {/* Backdrop highlight */}
      {isOpen && position && (
        <div
          className="fixed inset-0 bg-black/30 pointer-events-none z-30"
          style={{
            clipPath: `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${position.left + position.width / 2}px ${position.top}px, ${position.left + position.width}px ${position.top}px, ${position.left + position.width}px ${position.top + position.height}px, ${position.left}px ${position.top + position.height}px, ${position.left}px ${position.top}px, ${position.left + position.width / 2}px ${position.top}px)`,
          }}
        />
      )}

      {/* Tour Popover */}
      {isOpen && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <div
              className="fixed z-40 pointer-events-none"
              style={{
                left: position ? position.left + position.width / 2 : 0,
                top: position ? position.top + position.height + 16 : 0,
                transform: 'translateX(-50%)',
              }}
            >
              <PopoverContent
                side="bottom"
                className="w-80 pointer-events-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-base">{step.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                    </div>
                    <button
                      onClick={handleSkip}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Progress */}
                  <div className="space-y-2">
                    <Progress value={progress} className="h-1" />
                    <p className="text-xs text-muted-foreground text-center">
                      {currentStep + 1} of {TOUR_STEPS.length}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={handleSkip}>
                      Skip
                    </Button>
                    <Button size="sm" onClick={handleNext}>
                      {currentStep === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </div>
          </PopoverTrigger>
        </Popover>
      )}

      {/* Trigger Button (appears if not completed) */}
      {!isOpen && !tourCompleted && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 left-4 z-40"
        >
          Start Tour
        </Button>
      )}
    </>
  )
}

// Usage: <FeatureTour featureKey="onboarding" />
```

---

## Integration & Best Practices

### App-Level Integration

```tsx
// App.tsx
import { HelpWidget } from '@/components/HelpWidget'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { KnowledgeBaseSearch } from '@/components/KnowledgeBaseSearch'
import { FeatureTour } from '@/components/FeatureTour'

export function App() {
  return (
    <>
      {/* Global help components */}
      <KnowledgeBaseSearch />
      <HelpWidget />
      <KeyboardShortcuts />
      <FeatureTour featureKey="main-onboarding" />

      {/* Your app routes */}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/help/:category/:article" element={<HelpArticle />} />
        <Route path="/contact" element={<ContactSupportForm />} />
      </Routes>
    </>
  )
}
```

### Analytics & Tracking

```tsx
// Track help interactions
const trackHelpInteraction = async (action: string, context: any) => {
  await fetch('/api/analytics/help', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action, // 'search', 'view_article', 'helpful', 'contact'
      context,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    }),
  })
}

// In HelpArticle component:
const handleHelpful = async (helpful: boolean) => {
  await trackHelpInteraction('helpful', { articleId, helpful })
}
```

### Dark Mode Support

All components use `dark:` Tailwind classes for automatic dark mode support. No additional setup needed.

### Accessibility Checklist

- All dialogs have proper focus management
- Keyboard shortcuts use standard conventions (Cmd on Mac, Ctrl on Windows)
- Search uses ARIA listbox role
- Article headings have proper hierarchy (h2, h3)
- Tooltips and popovers are keyboard-accessible
- Color contrast meets WCAG AA standards
- Form labels properly associated with inputs

---

## Dark Mode Implementation

### Color Mapping
- Light article bg: `bg-white` → Dark: `dark:bg-slate-900`
- Light code blocks: `bg-gray-100 text-gray-900` → Dark: `dark:bg-slate-950 dark:text-slate-50`
- Light search input: `bg-white border-gray-300` → Dark: `dark:bg-slate-800 dark:border-slate-600`
- Light sidebar: `bg-gray-50` → Dark: `dark:bg-slate-950`
- Light text: `text-gray-600` → Dark: `dark:text-slate-400`

### Key Dark Mode Rules for Help Center
1. **Code blocks**: Use `dark:bg-slate-950` background with `dark:text-slate-50` for syntax highlighting visibility
2. **Search input**: Ensure legible input with `dark:bg-slate-800 dark:border-slate-600 dark:text-slate-50`
3. **Sidebar categories**: Use `dark:bg-slate-950 dark:text-slate-400` for category text with `dark:hover:bg-slate-800` for hover states

### Dark Mode Help Center Example
```tsx
export function DarkModeHelpCenter() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 p-6 bg-white dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="bg-gray-50 dark:bg-slate-950 rounded-lg p-4">
        <nav className="space-y-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="w-full text-left px-3 py-2 rounded text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              {cat.name}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <article className="md:col-span-2 space-y-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
          Getting Started
        </h1>
        
        {/* Code block with dark mode */}
        <pre className="bg-gray-100 dark:bg-slate-950 p-4 rounded-lg overflow-auto">
          <code className="text-gray-900 dark:text-slate-50 text-sm">
            {codeExample}
          </code>
        </pre>
      </article>

      {/* Table of Contents */}
      <aside className="bg-gray-50 dark:bg-slate-950 rounded-lg p-4 max-h-96 overflow-auto">
        <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-3">
          On this page
        </h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-slate-400">
          {/* TOC items */}
        </ul>
      </aside>
    </div>
  );
}
```

---

## Responsive Behavior

### Breakpoint Strategy
- **Mobile (< 640px)**: Single column, search-first layout, collapsible sidebar categories, stacked TOC
- **Tablet (640px - 1024px)**: 2-column layout (sidebar + content), collapsible categories
- **Desktop (> 1024px)**: 3-column layout (sidebar + content + TOC), fixed sidebar and TOC, full article width

### Key Responsive Rules for Help Center
1. **Layout**: Single column on mobile (`grid-cols-1`), 2 columns on tablet (`md:grid-cols-3`), 3+ on desktop (`lg:grid-cols-4`)
2. **Sidebar**: Hidden/drawer on mobile, visible on tablet+, use `md:block hidden` to toggle
3. **Search bar**: Full-width on mobile (`w-full`), constrained on desktop with `md:w-80`
4. **TOC (Table of Contents)**: Hidden on mobile/tablet, visible on desktop with `hidden lg:block`

### Responsive Help Center Example
```tsx
export function ResponsiveHelpCenter() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col md:grid md:grid-cols-3 lg:grid-cols-4 gap-6 p-4 md:p-8">
      {/* Search Bar - full width on mobile, top of layout */}
      <div className="md:col-span-3 lg:col-span-4 mb-4">
        <input
          type="search"
          placeholder="Search articles..."
          className="w-full px-4 py-2 rounded-lg border bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600"
        />
      </div>

      {/* Mobile Hamburger - hidden on tablet+ */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden mb-4 px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded-lg"
      >
        {sidebarOpen ? 'Hide Categories' : 'Show Categories'}
      </button>

      {/* Sidebar - hidden on mobile unless toggled, visible on tablet+ */}
      <aside className={`${sidebarOpen ? 'block' : 'hidden'} md:block md:col-span-1 bg-gray-50 dark:bg-slate-950 rounded-lg p-4`}>
        <nav className="space-y-1">
          {categories.map((cat) => (
            <details key={cat.id} className="group">
              <summary className="px-3 py-2 cursor-pointer text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded">
                {cat.name}
              </summary>
              <ul className="pl-4 space-y-1 mt-2">
                {cat.articles.map((art) => (
                  <li key={art.id}>
                    <a
                      href={`#${art.id}`}
                      className="text-sm text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {art.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </nav>
      </aside>

      {/* Main Content - full width on mobile, spans 2 cols on tablet, 2 cols on desktop */}
      <article className="md:col-span-2 space-y-6 text-slate-900 dark:text-slate-50">
        <h1 className="text-2xl md:text-3xl font-bold">Article Title</h1>
        <p>Article content goes here...</p>
      </article>

      {/* Table of Contents - hidden on mobile/tablet, visible on desktop */}
      <aside className="hidden lg:block bg-gray-50 dark:bg-slate-950 rounded-lg p-4 max-h-[calc(100vh-6rem)] overflow-auto sticky top-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-3 text-sm">
          On this page
        </h3>
        <ul className="space-y-2 text-xs text-gray-600 dark:text-slate-400">
          {/* TOC items */}
        </ul>
      </aside>
    </div>
  );
}
```

---

## Performance Optimization

1. **Lazy load help content:** Use React.lazy() for help pages
2. **Virtualize long FAQ lists:** Use react-window for 100+ items
3. **Cache search results:** Implement debouncing + caching
4. **Compress images:** Use WebP format for article images
5. **Code split help routes:** Separate bundle for help section

---

## Sources & Tools

- [shadcn/ui Components](https://ui.shadcn.com/docs/components) - Dialog, Accordion, Popover
- [React Hook Form](https://react-hook-form.com/) - Form handling
- [Schema.org FAQPage](https://schema.org/FAQPage) - SEO structured data
- [Web Content Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/) - A11y
- [Framer Motion](https://www.framer.com/motion/) - Smooth animations for tours
