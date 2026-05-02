# Real-Time Features & Presence Patterns

**Last updated: 2026-04-04**

Production patterns for presence indicators, active users, live updates, collaborative editing hints, real-time notifications, activity feeds, and Supabase Realtime integration. Full React + TypeScript + shadcn/ui code, copy-paste ready.

---

## 1. Presence Indicators

### Status Indicator Dot

```typescript
// components/PresenceDot.tsx
import React from 'react';
import { cn } from '@/lib/utils';

type PresenceStatus = 'online' | 'away' | 'offline';

interface PresenceDotProps {
  status: PresenceStatus;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const PresenceDot: React.FC<PresenceDotProps> = ({
  status,
  className,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const statusColor = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    offline: 'bg-gray-400',
  };

  const isAnimated = status === 'online';

  return (
    <div
      className={cn(
        sizeClasses[size],
        statusColor[status],
        'rounded-full ring-2 ring-white ring-offset-1 flex-shrink-0',
        isAnimated && 'animate-pulse',
        className
      )}
      aria-label={`User is ${status}`}
      role="status"
    />
  );
};
```

### Avatar with Presence

```typescript
// components/AvatarWithPresence.tsx
import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PresenceDot } from './PresenceDot';

interface AvatarWithPresenceProps {
  src?: string;
  alt: string;
  fallback: string;
  status: 'online' | 'away' | 'offline';
  size?: 'sm' | 'md' | 'lg';
}

export const AvatarWithPresence: React.FC<AvatarWithPresenceProps> = ({
  src,
  alt,
  fallback,
  status,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  return (
    <div className="relative inline-block">
      <Avatar className={sizeClasses[size]}>
        {src && <AvatarImage src={src} alt={alt} />}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      {/* Position dot bottom-right */}
      <div className="absolute bottom-0 right-0 -mr-1 -mb-1">
        <PresenceDot status={status} size={size === 'lg' ? 'md' : 'sm'} />
      </div>
    </div>
  );
};
```

### Avatar Stack (Multiple Users)

```typescript
// components/AvatarStack.tsx
import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PresenceDot } from './PresenceDot';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'away' | 'offline';
}

interface AvatarStackProps {
  users: User[];
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const AvatarStack: React.FC<AvatarStackProps> = ({
  users,
  maxVisible = 3,
  size = 'md',
}) => {
  const visible = users.slice(0, maxVisible);
  const remaining = Math.max(0, users.length - maxVisible);

  const sizeClasses = {
    sm: 'h-8 w-8 -ml-2',
    md: 'h-10 w-10 -ml-3',
    lg: 'h-12 w-12 -ml-4',
  };

  const textSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className="flex items-center">
      <div className="flex">
        {visible.map((user, index) => (
          <div
            key={user.id}
            className={cn('relative', sizeClasses[size])}
            style={{ zIndex: visible.length - index }}
            title={user.name}
          >
            <Avatar className="h-full w-full border-2 border-white">
              {user.avatar && <AvatarImage src={user.avatar} />}
              <AvatarFallback className={textSize[size]}>
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 -mr-1 -mb-1">
              <PresenceDot status={user.status} size={size === 'lg' ? 'sm' : 'xs'} />
            </div>
          </div>
        ))}

        {remaining > 0 && (
          <div className={cn('relative flex items-center justify-center rounded-full bg-muted border-2 border-white font-semibold', sizeClasses[size], textSize[size])}>
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## 2. Active Users List

```typescript
// components/ActiveUsersList.tsx
import React, { useState, useEffect } from 'react';
import { AvatarWithPresence } from './AvatarWithPresence';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActiveUser {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'away' | 'offline';
  lastSeen?: Date;
}

interface ActiveUsersListProps {
  users: ActiveUser[];
  currentUserId?: string;
}

export const ActiveUsersList: React.FC<ActiveUsersListProps> = ({
  users,
  currentUserId,
}) => {
  const onlineCount = users.filter((u) => u.status === 'online').length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg',
            'hover:bg-muted transition-colors',
            onlineCount > 0 ? 'text-green-600' : 'text-muted-foreground'
          )}
        >
          <Users className="h-4 w-4" />
          <span>{onlineCount} online</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Active Users ({users.length})</h3>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {users.map((user) => (
              <div
                key={user.id}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors',
                  user.id === currentUserId && 'bg-muted/50'
                )}
              >
                <AvatarWithPresence
                  src={user.avatar}
                  alt={user.name}
                  fallback={user.name.charAt(0).toUpperCase()}
                  status={user.status}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.name}
                    {user.id === currentUserId && <span className="text-xs text-muted-foreground ml-1">(You)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.status === 'online'
                      ? 'Active now'
                      : user.status === 'away'
                      ? 'Away'
                      : `Last seen ${formatRelativeTime(user.lastSeen)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const formatRelativeTime = (date?: Date): string => {
  if (!date) return 'Recently';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
```

---

## 3. Live Update Indicators

```typescript
// components/LiveUpdateIndicator.tsx
import React, { useState, useEffect } from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveUpdateIndicatorProps {
  isLive?: boolean;
  lastUpdated?: Date;
  variant?: 'pulse' | 'spinner' | 'badge';
}

export const LiveUpdateIndicator: React.FC<LiveUpdateIndicatorProps> = ({
  isLive = true,
  lastUpdated,
  variant = 'badge',
}) => {
  const [relativeTime, setRelativeTime] = useState<string>('');

  useEffect(() => {
    if (!lastUpdated) return;

    const updateTime = () => {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 60) {
        setRelativeTime('Just now');
      } else if (seconds < 3600) {
        setRelativeTime(`${Math.floor(seconds / 60)}m ago`);
      } else {
        setRelativeTime(`${Math.floor(seconds / 3600)}h ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [lastUpdated]);

  if (variant === 'pulse') {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-xs text-muted-foreground">Live</span>
      </div>
    );
  }

  if (variant === 'spinner') {
    return (
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
        <span className="text-xs text-muted-foreground">{relativeTime}</span>
      </div>
    );
  }

  // Badge variant (default)
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
      <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
      <span>Live</span>
    </div>
  );
};
```

---

## 4. Collaborative Editing Indicators

```typescript
// components/CollaborativeEditingIndicator.tsx
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarWithPresence } from './AvatarWithPresence';

interface EditingUser {
  id: string;
  name: string;
  avatar?: string;
  field: string;
}

interface CollaborativeEditingIndicatorProps {
  editingUsers: EditingUser[];
  onResolveConflict?: (action: 'keep' | 'theirs') => void;
}

export const CollaborativeEditingIndicator: React.FC<
  CollaborativeEditingIndicatorProps
> = ({ editingUsers, onResolveConflict }) => {
  if (editingUsers.length === 0) return null;

  const editingText =
    editingUsers.length === 1
      ? `${editingUsers[0].name} is editing the ${editingUsers[0].field} field`
      : `${editingUsers.map((u) => u.name).join(' and ')} are editing`;

  return (
    <div className="space-y-2">
      {/* Editing indicator banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
        <div className="h-5 w-5 text-blue-600 flex-shrink-0">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-blue-900">{editingText}</p>
        </div>
      </div>

      {/* Conflict resolution */}
      {onResolveConflict && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200">
          <div className="flex-1">
            <p className="text-sm text-orange-900">
              This was changed by another user. What would you like to do?
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResolveConflict('keep')}
              className="text-xs"
            >
              Keep mine
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResolveConflict('theirs')}
              className="text-xs"
            >
              Use theirs
            </Button>
          </div>
        </div>
      )}

      {/* Editing users avatars */}
      <div className="flex -space-x-2">
        {editingUsers.map((user) => (
          <AvatarWithPresence
            key={user.id}
            src={user.avatar}
            alt={user.name}
            fallback={user.name.charAt(0).toUpperCase()}
            status="online"
            size="sm"
          />
        ))}
      </div>
    </div>
  );
};
```

### Field-Level Editing Border

```typescript
// components/CollaborativeInput.tsx
import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CollaborativeInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  isBeingEdited?: boolean;
  editorColor?: string;
}

export const CollaborativeInput = React.forwardRef<
  HTMLInputElement,
  CollaborativeInputProps
>(({ isBeingEdited, editorColor = '#3b82f6', className, ...props }, ref) => (
  <Input
    ref={ref}
    className={cn(
      'transition-all',
      isBeingEdited && 'ring-2 ring-offset-0 ring-blue-400'
    )}
    style={
      isBeingEdited
        ? { borderColor: editorColor, boxShadow: `0 0 0 3px ${editorColor}20` }
        : undefined
    }
    {...props}
  />
));

CollaborativeInput.displayName = 'CollaborativeInput';
```

---

## 5. Real-Time Notifications

### Browser Notification Pattern

```typescript
// hooks/useNotification.ts
import { useCallback } from 'react';

export const useNotification = () => {
  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  const sendNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      const hasPermission = await requestPermission();
      if (hasPermission) {
        new Notification(title, {
          icon: '/logo.png',
          ...options,
        });
      }
    },
    [requestPermission]
  );

  return { sendNotification, requestPermission };
};
```

### Supabase Realtime Integration

```typescript
// hooks/useRealtimeSubscription.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UseRealtimeSubscriptionProps {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onData?: (payload: any) => void;
  queryKey?: (string | number)[];
}

export const useRealtimeSubscription = ({
  table,
  event = '*',
  filter,
  onData,
  queryKey,
}: UseRealtimeSubscriptionProps) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let channel = supabase
      .channel(`${table}:${event}`)
      .on(
        'postgres_changes',
        {
          event: event as any,
          schema: 'public',
          table: table,
          filter: filter,
        },
        (payload) => {
          // Call custom handler if provided
          if (onData) {
            onData(payload);
          }

          // Invalidate related React Query cache
          if (queryKey) {
            queryClient.invalidateQueries({ queryKey });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, filter, onData, queryKey, queryClient]);
};
```

### Real-Time Toast Notifications

```typescript
// hooks/useRealtimeNotifications.ts
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRealtimeSubscription } from './useRealtimeSubscription';

export const useRealtimeNotifications = () => {
  useRealtimeSubscription({
    table: 'notifications',
    event: 'INSERT',
    filter: `user_id=eq.${supabase.auth.user()?.id}`,
    onData: (payload) => {
      const notification = payload.new;
      toast[notification.type](notification.message, {
        description: notification.description,
        action: notification.action_label && {
          label: notification.action_label,
          onClick: () => {
            // Handle action
            window.location.href = notification.action_url || '#';
          },
        },
      });
    },
  });
};
```

---

## 6. Activity Feed

```typescript
// components/ActivityFeed.tsx
import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type ActivityType =
  | 'created'
  | 'updated'
  | 'commented'
  | 'assigned'
  | 'status_changed';

interface Activity {
  id: string;
  type: ActivityType;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
  title: string;
  description?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface ActivityFeedProps {
  activities: Activity[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  isLoading = false,
  onLoadMore,
  hasMore = false,
}) => {
  const getActivityIcon = (type: ActivityType) => {
    const icons = {
      created: '✨',
      updated: '📝',
      commented: '💬',
      assigned: '👤',
      status_changed: '🔄',
    };
    return icons[type];
  };

  const getActivityColor = (type: ActivityType) => {
    const colors = {
      created: 'bg-blue-100 text-blue-700',
      updated: 'bg-purple-100 text-purple-700',
      commented: 'bg-green-100 text-green-700',
      assigned: 'bg-orange-100 text-orange-700',
      status_changed: 'bg-gray-100 text-gray-700',
    };
    return colors[type];
  };

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="space-y-6">
        {activities.map((activity, index) => (
          <div key={activity.id} className="relative flex gap-4">
            {/* Timeline line */}
            {index !== activities.length - 1 && (
              <div className="absolute left-5 top-12 h-6 w-0.5 bg-border" />
            )}

            {/* Timeline dot */}
            <div className={cn(
              'relative z-10 h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
              getActivityColor(activity.type)
            )}>
              {getActivityIcon(activity.type)}
            </div>

            {/* Activity content */}
            <div className="flex-1 pt-1">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar className="h-6 w-6">
                      {activity.user.avatar && (
                        <AvatarImage src={activity.user.avatar} />
                      )}
                      <AvatarFallback className="text-xs">
                        {activity.user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{activity.user.name}</span>
                  </div>
                  <p className="text-sm text-foreground font-medium">{activity.title}</p>
                  {activity.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {activity.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                </span>
              </div>

              {/* Metadata chips */}
              {activity.metadata && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(activity.metadata).map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground"
                    >
                      <strong>{key}:</strong> {String(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoading}
          className="w-full py-2 text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isLoading ? 'Loading...' : 'Load more activities'}
        </button>
      )}

      {/* Empty state */}
      {activities.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No activities yet</p>
        </div>
      )}
    </div>
  );
};
```

---

## 7. Supabase Presence Tracking

### Presence Hook

```typescript
// hooks/usePresence.ts
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  lastSeen: Date;
}

interface UsePresenceProps {
  channelName: string;
  userId: string;
  userInfo: Omit<PresenceUser, 'lastSeen'>;
}

export const usePresence = ({
  channelName,
  userId,
  userInfo,
}: UsePresenceProps) => {
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    // Create channel
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    // Subscribe to presence events
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state)
          .flat()
          .map((presence: any) => ({
            ...presence,
            lastSeen: new Date(presence.lastSeen || Date.now()),
          }));
        setPresenceUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        setPresenceUsers((prev) => [
          ...prev,
          ...newPresences.map((p: any) => ({
            ...p,
            lastSeen: new Date(p.lastSeen || Date.now()),
          })),
        ]);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setPresenceUsers((prev) => prev.filter((u) => u.id !== key));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track this user's presence
          await channel.track({
            id: userId,
            ...userInfo,
            lastSeen: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [channelName, userId, userInfo]);

  return presenceUsers;
};
```

### Usage Example

```typescript
// pages/CollaborativePage.tsx
import { usePresence } from '@/hooks/usePresence';
import { ActiveUsersList } from '@/components/ActiveUsersList';

export const CollaborativePage: React.FC = () => {
  const { data: session } = useSessionQuery();

  const presenceUsers = usePresence({
    channelName: 'document-123',
    userId: session?.user.id || '',
    userInfo: {
      id: session?.user.id || '',
      name: session?.user.user_metadata?.full_name || 'Anonymous',
      avatar: session?.user.user_metadata?.avatar_url,
    },
  });

  return (
    <div>
      <ActiveUsersList
        users={presenceUsers.map((u) => ({
          ...u,
          status: isUserRecent(u.lastSeen) ? 'online' : 'away',
        }))}
        currentUserId={session?.user.id}
      />
    </div>
  );
};

const isUserRecent = (lastSeen: Date, threshold = 5 * 60 * 1000) => {
  return Date.now() - lastSeen.getTime() < threshold;
};
```

---

## 8. Broadcast (Custom Events)

```typescript
// hooks/useBroadcast.ts
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseBroadcastProps<T = any> {
  channelName: string;
  eventName: string;
  onMessage?: (data: T) => void;
}

export const useBroadcast = <T = any>({
  channelName,
  eventName,
  onMessage,
}: UseBroadcastProps<T>) => {
  const [channel, setChannel] = useState<any>(null);

  useEffect(() => {
    const ch = supabase.channel(channelName);

    ch.on('broadcast', { event: eventName }, ({ payload }) => {
      onMessage?.(payload.data);
    }).subscribe();

    setChannel(ch);

    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelName, eventName, onMessage]);

  const broadcast = async (data: T) => {
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: eventName,
        payload: { data },
      });
    }
  };

  return { broadcast };
};
```

---

## 9. Status Badge

```typescript
// components/StatusBadge.tsx
import React from 'react';
import { cn } from '@/lib/utils';

type Status = 'online' | 'away' | 'offline' | 'busy';

interface StatusBadgeProps {
  status: Status;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
}) => {
  const statusConfig = {
    online: { color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
    away: { color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
    offline: { color: 'bg-gray-100 text-gray-800', dot: 'bg-gray-400' },
    busy: { color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        sizeClasses[size],
        statusConfig[status].color
      )}
    >
      <span
        className={cn('h-2 w-2 rounded-full', statusConfig[status].dot)}
      />
      {label || status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};
```

---

## Best Practices

1. **Debounce presence updates** — 300ms delay to prevent excessive events
2. **Timeout offline status** — 3 seconds without heartbeat = offline
3. **Clean up on unmount** — unsubscribe from channels and remove tracks
4. **Cache presence locally** — reduce server queries with client-side cache
5. **Batch updates** — group multiple events into single state update
6. **Test connectivity** — handle network loss gracefully with retry logic
7. **Accessibility** — announce live updates to screen readers with `aria-live`

---

## Dark Mode Implementation

### Color Mapping
```tsx
// Light mode → Dark mode token mapping for real-time features
// These follow design-tokens.md and dark-mode.md standards

// Backgrounds
bg-white          → dark:bg-gray-950
bg-green-100      → dark:bg-green-950
bg-yellow-100     → dark:bg-yellow-950
bg-gray-100       → dark:bg-gray-900

// Text
text-green-800    → dark:text-green-200
text-yellow-800   → dark:text-yellow-200
text-gray-800     → dark:text-gray-200

// Status indicators
bg-green-500      → dark:bg-green-500 (semantic, no change)
```

### Key Dark Mode Rules for Real-Time
- Use semantic color tokens (`bg-card`, `text-foreground`) not raw colors
- Presence indicators: maintain color meaning (green=online) with sufficient contrast
- Status badges: `bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200`
- Activity feed: `bg-card dark:bg-gray-900` with `border-border dark:border-gray-800`
- Test: switch to dark mode → status dots visible, activity feed readable, badges distinct

---

## Responsive Behavior

### Breakpoint Strategy
```tsx
// Mobile-first responsive for real-time features
// sm: 640px | md: 768px | lg: 1024px | xl: 1280px

// Layout shifts:
// Mobile (< 640px):      compact presence indicators, stacked activity feed, simplified live updates
// Tablet (640-1023px):   side-by-side presence panel + content
// Desktop (1024px+):     full presence panel, live cursors visible, activity timeline layout
```

### Key Responsive Rules for Real-Time
- Touch targets: min 44x44px on mobile
- Presence dot: `h-2 w-2 sm:h-3 sm:w-3 lg:h-4 lg:w-4`
- Avatar stack: hide overflow count on mobile: `hidden sm:block`
- Activity feed: `space-y-3 sm:space-y-4 lg:space-y-6`
- Presence panel: `fixed inset-0 sm:static` (slide-out on mobile)
- Editing indicators: `ring-2 sm:ring-4` (smaller focus ring on mobile)

