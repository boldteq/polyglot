# Chat Component Design Patterns

**Last updated: 2026-04-04**

Production-grade chat UI components for React + TypeScript + shadcn/ui + Tailwind. Covers message bubbles, input, typing indicators, file uploads, streaming AI responses, scroll behavior, and responsive design. Copy-paste ready with full TypeScript types.

---

## 1. Chat Layout Architecture

### Full-Screen Chat Container

```typescript
// components/ChatContainer.tsx
import React, { useRef, useEffect, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  attachments?: Attachment[];
  status?: 'sending' | 'sent' | 'failed';
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface ChatContainerProps {
  messages: Message[];
  isLoading?: boolean;
  onSendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  onDeleteMessage?: (messageId: string) => void;
  placeholder?: string;
  showTimestamps?: boolean;
  maxChars?: number;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isLoading = false,
  onSendMessage,
  onDeleteMessage,
  placeholder = 'Type a message...',
  showTimestamps = true,
  maxChars = 4000,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessagesBtn, setShowNewMessagesBtn] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isAtBottom]);

  // Detect scroll position
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsAtBottom(isBottom);
      setShowNewMessagesBtn(!isBottom && messages.length > 0);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <h2 className="text-lg font-semibold text-foreground">Chat</h2>
        <p className="text-sm text-muted-foreground">You and Assistant</p>
      </div>

      {/* Messages area with auto-scroll */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-4 px-4 py-4 sm:px-6"
      >
        {messages.length === 0 ? (
          <EmptyChatState />
        ) : (
          <>
            {messages.map((message, index) => {
              const isOwnMessage = message.role === 'user';
              const prevMessage = messages[index - 1];
              // Group consecutive messages from same sender
              const showAvatar =
                !prevMessage || prevMessage.role !== message.role;

              return (
                <div key={message.id}>
                  <MessageBubble
                    message={message}
                    isOwn={isOwnMessage}
                    showAvatar={showAvatar}
                    showTimestamp={showTimestamps}
                    onDelete={
                      onDeleteMessage ? () => onDeleteMessage(message.id) : undefined
                    }
                  />
                </div>
              );
            })}

            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* New messages button */}
      {showNewMessagesBtn && (
        <div className="px-4 py-2 text-center">
          <button
            onClick={scrollToBottom}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ArrowDown className="h-4 w-4" />
            New messages
          </button>
        </div>
      )}

      {/* Input area (sticky) */}
      <div className="border-t border-border bg-background px-4 py-4 sm:px-6">
        <ChatInput
          onSendMessage={onSendMessage}
          disabled={isLoading}
          placeholder={placeholder}
          maxChars={maxChars}
        />
      </div>
    </div>
  );
};

// Empty state
const EmptyChatState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full">
    <MessageCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
    <h3 className="text-lg font-semibold text-foreground mb-2">Start a conversation</h3>
    <p className="text-muted-foreground max-w-xs text-center">
      Type a message below to begin. You can ask questions, share ideas, or get help.
    </p>
  </div>
);
```

---

## 2. Message Bubbles

### MessageBubble Component

```typescript
// components/MessageBubble.tsx
import React, { useState } from 'react';
import { format } from 'date-fns';
import { Copy, Trash2, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onFeedback?: (rating: 'positive' | 'negative') => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar = true,
  showTimestamp = true,
  onDelete,
  onRegenerate,
  onFeedback,
}) => {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn('flex gap-3', isOwn ? 'flex-row-reverse' : 'flex-row')}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {showAvatar && (
        <div
          className={cn(
            'h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center',
            isOwn
              ? 'bg-primary text-primary-foreground text-xs font-bold'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {isOwn ? 'You' : 'AI'}
        </div>
      )}

      {/* Bubble wrapper */}
      <div className={cn('flex flex-col', isOwn ? 'items-end' : 'items-start')}>
        {/* Message bubble */}
        <div
          className={cn(
            'max-w-xs sm:max-w-md md:max-w-lg lg:max-w-2xl px-4 py-3 rounded-2xl break-words',
            isOwn
              ? 'bg-primary text-primary-foreground rounded-br-none'
              : 'bg-muted text-foreground rounded-bl-none'
          )}
        >
          {/* Render content (plain text or markdown) */}
          <MessageContent content={message.content} />

          {/* File attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-current border-opacity-20 pt-2">
              {message.attachments.map((file) => (
                <FileAttachment key={file.id} file={file} />
              ))}
            </div>
          )}
        </div>

        {/* Timestamp */}
        {showTimestamp && (
          <span className="text-xs text-muted-foreground mt-1">
            {format(message.timestamp, 'HH:mm')}
          </span>
        )}

        {/* Action buttons (hover) */}
        {showActions && (
          <div className={cn('flex gap-1 mt-2', isOwn ? 'flex-row-reverse' : 'flex-row')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={copyToClipboard}
              title="Copy message"
            >
              <Copy className="h-4 w-4" />
            </Button>

            {!isOwn && onFeedback && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onFeedback('positive')}
                  title="Good response"
                >
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onFeedback('negative')}
                  title="Bad response"
                >
                  <ThumbsDown className="h-4 w-4" />
                </Button>
              </>
            )}

            {!isOwn && onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onRegenerate}
                title="Regenerate response"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}

            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={onDelete}
                title="Delete message"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Render message content (plain text or with markdown syntax highlighting)
const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  // TODO: Use react-markdown for full markdown support if needed
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>;
};

// File attachment component
const FileAttachment: React.FC<{ file: Attachment }> = ({ file }) => {
  const getIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🔊';
    if (type.includes('pdf')) return '📄';
    return '📎';
  };

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs hover:underline"
    >
      <span>{getIcon(file.type)}</span>
      <span className="truncate">{file.name}</span>
      <span className="flex-shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
    </a>
  );
};
```

---

## 3. Chat Input Component

```typescript
// components/ChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  maxChars?: number;
  maxFiles?: number;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message...',
  maxChars = 4000,
  maxFiles = 5,
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-expand textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        128
      )}px`;
    }
  }, [content]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (text.length <= maxChars) {
      setContent(text);
      setCharCount(text.length);
    }
  };

  const handleSend = async () => {
    if (!content.trim() && attachments.length === 0) return;
    if (isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(content, attachments.length > 0 ? attachments : undefined);
      setContent('');
      setCharCount(0);
      setAttachments([]);
      textareaRef.current?.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
      // Error toast handled by parent
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter, allow Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments: Attachment[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    const updated = [...attachments, ...newAttachments].slice(0, maxFiles);
    setAttachments(updated);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((file) => (
            <div
              key={file.id}
              className="inline-flex items-center gap-2 bg-muted px-3 py-2 rounded-md text-sm"
            >
              <Paperclip className="h-4 w-4" />
              <span className="truncate max-w-xs">{file.name}</span>
              <button
                onClick={() => removeAttachment(file.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2">
        {/* File upload button */}
        <Button
          variant="outline"
          size="icon"
          disabled={disabled || attachments.length >= maxFiles}
          onClick={() => fileInputRef.current?.click()}
          title="Attach files"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled || attachments.length >= maxFiles}
        />

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSending}
            rows={1}
            className={cn(
              'w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed',
              'max-h-32'
            )}
          />
          {maxChars && (
            <span
              className={cn(
                'absolute bottom-2 right-2 text-xs',
                charCount > maxChars * 0.9 ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {charCount}/{maxChars}
            </span>
          )}
        </div>

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={disabled || isSending || (!content.trim() && attachments.length === 0)}
          size="icon"
          className="self-end"
        >
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground">
        Press <kbd className="px-1.5 py-0.5 rounded bg-muted">Enter</kbd> to send,{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-muted">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
};
```

---

## 4. Typing Indicator

```typescript
// components/TypingIndicator.tsx
import React from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  showLabel?: boolean;
  animated?: boolean;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  showLabel = true,
  animated = true,
}) => {
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-xs text-muted-foreground">
        AI
      </div>

      {/* Typing bubble */}
      <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-1.5">
        {showLabel && <span className="text-sm text-muted-foreground">Typing</span>}
        <div className="flex gap-1.5">
          <span
            className={cn(
              'h-2 w-2 bg-muted-foreground rounded-full',
              animated && 'animate-bounce'
            )}
            style={animated ? { animationDelay: '0ms' } : undefined}
          />
          <span
            className={cn(
              'h-2 w-2 bg-muted-foreground rounded-full',
              animated && 'animate-bounce'
            )}
            style={animated ? { animationDelay: '150ms' } : undefined}
          />
          <span
            className={cn(
              'h-2 w-2 bg-muted-foreground rounded-full',
              animated && 'animate-bounce'
            )}
            style={animated ? { animationDelay: '300ms' } : undefined}
          />
        </div>
      </div>
    </div>
  );
};
```

### CSS Animation (tailwind.config.ts)

```typescript
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      keyframes: {
        bounce: {
          '0%, 80%, 100%': {
            transform: 'translateY(0)',
            opacity: '1',
          },
          '40%': {
            transform: 'translateY(-10px)',
            opacity: '0.7',
          },
        },
      },
      animation: {
        bounce: 'bounce 1.4s infinite',
      },
    },
  },
};
```

---

## 5. Message Types

### System Message

```typescript
// components/SystemMessage.tsx
export const SystemMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="flex justify-center py-4">
    <div className="px-3 py-1 rounded-full bg-muted text-center text-xs text-muted-foreground">
      {content}
    </div>
  </div>
);
```

### Image Message

```typescript
// components/ImageMessage.tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

export const ImageMessage: React.FC<{ url: string; alt?: string }> = ({
  url,
  alt = 'Message image',
}) => (
  <Dialog>
    <DialogTrigger asChild>
      <img
        src={url}
        alt={alt}
        className="max-w-xs rounded-lg cursor-zoom-in hover:opacity-80 transition-opacity"
      />
    </DialogTrigger>
    <DialogContent className="max-w-3xl">
      <img src={url} alt={alt} className="w-full rounded-lg" />
    </DialogContent>
  </Dialog>
);
```

### AI Streaming Response

```typescript
// components/StreamingMessage.tsx
import { useEffect, useState } from 'react';

interface StreamingMessageProps {
  stream: ReadableStream<Uint8Array>;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({ stream }) => {
  const [content, setContent] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const read = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          setIsComplete(true);
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        setContent((prev) => prev + chunk);
      }
    };

    read();
  }, [stream]);

  return (
    <div className="max-w-2xl px-4 py-3 rounded-2xl rounded-bl-none bg-muted">
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      {!isComplete && <span className="animate-pulse">▊</span>}
    </div>
  );
};
```

---

## 6. Scroll Behavior & Infinite History

```typescript
// hooks/useInfiniteChat.ts
import { useCallback, useRef, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

export const useInfiniteChat = (conversationId: string) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousHeightRef = useRef<number>(0);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages?offset=${pageParam}&limit=20`
      );
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
  });

  const messages = data?.pages.flatMap((page) => page.messages) ?? [];

  // Load more on scroll to top
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop < 50 && hasNextPage && !isFetchingNextPage) {
        // Store scroll height before fetching
        previousHeightRef.current = container.scrollHeight;
        fetchNextPage();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Maintain scroll position when loading older messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && previousHeightRef.current) {
      const heightDiff = container.scrollHeight - previousHeightRef.current;
      container.scrollTop += heightDiff;
    }
  }, [messages.length]);

  return { messages, messagesContainerRef, isFetchingNextPage };
};
```

---

## 7. Responsive Design

Mobile optimizations:

```typescript
// components/ChatContainer.tsx - Mobile adjustments

// In the main component:
<div className="flex flex-col h-screen bg-background">
  {/* Header - compact on mobile */}
  <div className="border-b border-border px-3 py-2 sm:px-6 sm:py-3">
    <h2 className="text-base sm:text-lg font-semibold text-foreground">Chat</h2>
  </div>

  {/* Messages - no horizontal padding on mobile to use space better */}
  <div className="flex-1 overflow-y-auto space-y-3 px-3 py-3 sm:px-6 sm:py-4">
    {/* Messages render here */}
  </div>

  {/* Input - full width on mobile */}
  <div className="border-t border-border bg-background px-3 py-3 sm:px-6 sm:py-4">
    <ChatInput {...props} />
  </div>
</div>

// Tailwind mobile-first config
<div
  className={cn(
    'max-w-xs sm:max-w-md md:max-w-lg lg:max-w-2xl px-4 py-3',
    // On mobile, use almost full width with padding
    'w-11/12'
  )}
>
  {/* Message content */}
</div>
```

---

## 8. Accessibility

```typescript
// components/ChatContainer.tsx - a11y features

export const ChatContainer: React.FC<ChatContainerProps> = (props) => {
  return (
    <div
      className="flex flex-col h-screen bg-background"
      role="main"
      aria-label="Chat conversation"
    >
      {/* Header */}
      <header className="border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Chat</h1>
      </header>

      {/* Messages list */}
      <div
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-atomic="false"
        className="flex-1 overflow-y-auto"
      >
        {/* Messages */}
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-4">
        <ChatInput
          aria-label="Message input"
          {...props}
        />
      </div>
    </div>
  );
};

// MessageBubble.tsx - a11y
<div
  className={cn('flex gap-3')}
  role="article"
  aria-label={`Message from ${message.role}: ${message.content.substring(0, 50)}`}
>
  {/* Message content */}
</div>
```

---

## 9. Dark Mode Support

All components automatically support dark mode via Tailwind CSS classes:

```typescript
// Uses shadcn/ui color system which respects prefers-color-scheme
// bg-background → white in light mode, slate-950 in dark mode
// text-foreground → black in light mode, slate-50 in dark mode
// bg-muted → slate-100 in light mode, slate-800 in dark mode
```

---

## Copy-Paste Usage Example

```typescript
// pages/ChatPage.tsx
import React, { useState, useCallback } from 'react';
import { ChatContainer, Message, Attachment } from '@/components/ChatContainer';
import { toast } from 'sonner';

export const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        content,
        role: 'user',
        timestamp: new Date(),
        attachments,
        status: 'sending',
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        // Send to API
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, attachments }),
        });

        if (!response.ok) throw new Error('Failed to send message');

        // Add assistant message
        const data = await response.json();
        const assistantMessage: Message = {
          id: Date.now().toString(),
          content: data.content,
          role: 'assistant',
          timestamp: new Date(),
          status: 'sent',
        };

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === userMessage.id ? { ...msg, status: 'sent' } : msg
          )
        );
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        toast.error('Failed to send message');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === userMessage.id ? { ...msg, status: 'failed' } : msg
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return (
    <ChatContainer
      messages={messages}
      isLoading={isLoading}
      onSendMessage={handleSendMessage}
      placeholder="Ask me anything..."
      showTimestamps={true}
      maxChars={4000}
    />
  );
};
```

---

## Dark Mode Implementation

### Color Mapping
```tsx
// Light mode → Dark mode token mapping for chat
// These follow design-tokens.md and dark-mode.md standards

// Backgrounds
bg-background     → dark:bg-gray-950
bg-muted          → dark:bg-gray-800
border-border     → dark:border-gray-800

// Text
text-foreground   → dark:text-gray-50
text-muted-foreground → dark:text-gray-400

// Message bubbles
bg-primary        → dark:bg-primary (semantic)
text-primary-foreground → dark:text-gray-50
```

### Key Dark Mode Rules for Chat
- Use semantic color tokens (`bg-background`, `text-foreground`) not raw colors
- User message bubble: `bg-primary text-primary-foreground` (maintains contrast)
- Assistant message: `bg-muted dark:bg-gray-800 text-foreground`
- Input field: `bg-background dark:bg-gray-900 border-border dark:border-gray-700`
- Test: switch to dark mode → messages visible, input readable, no white text on light backgrounds

---

## Responsive Behavior

### Breakpoint Strategy
```tsx
// Mobile-first responsive for chat
// sm: 640px | md: 768px | lg: 1024px | xl: 1280px

// Layout shifts:
// Mobile (< 640px):      full-screen chat, header compact, slide-out conversation list
// Tablet (640-1023px):   split pane (conversation list left, chat right)
// Desktop (1024px+):     three-pane (list + chat + details), full width
```

### Key Responsive Rules for Chat
- Touch targets: min 44x44px on mobile
- Header: `px-3 py-2 sm:px-6 sm:py-3`
- Messages container: `space-y-3 px-3 py-3 sm:px-6 sm:py-4`
- Message bubbles: `max-w-xs sm:max-w-md md:max-w-lg lg:max-w-2xl`
- Input area: `px-3 py-3 sm:px-6 sm:py-4`
- Hide conversation list on mobile: `hidden sm:block`

