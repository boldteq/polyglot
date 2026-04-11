# SaaS Notification Design Patterns

Comprehensive guide to designing notification systems in production SaaS applications. Covers toast notifications, alert banners, notification centers, email strategies, and error handling hierarchies.

---

## 1. Toast Notifications (via Sonner)

Toast notifications are non-blocking, temporary feedback messages that appear on screen briefly and then dismiss. Use Sonner for production-grade toast rendering in React.

### 1.1 Types & Styling

**Success Toast** (green CheckCircle icon)
- Purpose: Confirmation of completed action (save, upload, delete with undo)
- Auto-dismiss: 3 seconds
- Icon: `<CheckCircle className="w-4 h-4 text-green-600" />`
- Placement: Bottom-right (default)
- Example: "Changes saved", "File uploaded successfully"

```typescript
import { toast } from 'sonner';

// Success toast
toast.success('Resume uploaded successfully', {
  description: '1 file processed in 2.3 seconds',
  duration: 3000
});
```

**Error Toast** (red XCircle icon)
- Purpose: Indicate failed operation with recovery path
- Auto-dismiss: NEVER (user must dismiss)
- Icon: `<XCircle className="w-4 h-4 text-red-600" />`
- Placement: Bottom-right (stays visible until action)
- Always include actionable next step: "Try again", "Contact support", "View details"

```typescript
// Error toast with action
toast.error('Failed to analyze job description', {
  description: 'Network timeout. Please check your connection and try again.',
  action: {
    label: 'Retry',
    onClick: () => retryAnalyzeJd()
  },
  duration: Infinity // Never auto-dismiss
});
```

**Info Toast** (blue Info icon)
- Purpose: Neutral information, helpful context
- Auto-dismiss: 4 seconds
- Icon: `<Info className="w-4 h-4 text-blue-600" />`
- Placement: Bottom-right or top-center (for multi-step flows)

```typescript
toast.info('Tip: Use CSV to import multiple jobs at once', {
  duration: 4000
});
```

**Warning Toast** (yellow AlertTriangle icon)
- Purpose: Alert about potential issue (quota nearly full, deprecated feature, trial expiring soon)
- Auto-dismiss: 5 seconds (user can read before dismissing)
- Icon: `<AlertTriangle className="w-4 h-4 text-yellow-600" />`
- Placement: Bottom-right

```typescript
toast.warning('Your free trial expires in 2 days', {
  description: 'Upgrade to continue using the project after April 6.',
  action: {
    label: 'Upgrade now',
    onClick: () => navigateToPricing()
  },
  duration: 5000
});
```

**Loading Toast** (animated Loader2 icon)
- Purpose: Show operation in progress (uploading, processing, generating)
- Auto-dismiss: NO (replaced by success/error)
- Icon: `<Loader2 className="w-4 h-4 animate-spin" />`
- Placement: Bottom-right
- Use promise-based API to auto-transition states

```typescript
// Promise-based loading → success/error transition
toast.promise(
  uploadResumes(files),
  {
    loading: 'Uploading resumes...',
    success: (data) => `${data.count} resumes uploaded successfully`,
    error: (error) => `Upload failed: ${error.message}`
  },
  { duration: 3000 }
);
```

### 1.2 Toast with Action Button

Critical pattern for reversible actions (delete, cancel, remove):

```typescript
// Undo pattern
const deleteResume = async (resumeId: string, filename: string) => {
  // Optimistically remove from UI
  removeResumeFromUI(resumeId);

  // Show toast with undo action
  toast.success(`Deleted ${filename}`, {
    action: {
      label: 'Undo',
      onClick: async () => {
        try {
          await restoreResume(resumeId);
          refreshResumeList();
          toast.success('Restore complete');
        } catch (error) {
          toast.error('Failed to restore');
        }
      }
    },
    duration: 5000 // Give user time to click undo
  });

  // Perform actual deletion after delay
  setTimeout(async () => {
    try {
      await supabase.from('resumes').delete().eq('id', resumeId);
    } catch (error) {
      console.error('Permanent delete failed:', error);
      // Can't easily undo now, user should see error
      toast.error('Permanent delete failed. Please refresh.');
    }
  }, 4000);
};
```

### 1.3 Toast with Description (Title + Body Text)

Use description for context when the title alone is insufficient:

```typescript
toast.success('Analysis complete', {
  description: 'Ranked 24 candidates. Top match: Sarah Johnson (94% fit)',
  duration: 4000
});

toast.error('API rate limit exceeded', {
  description: 'You\'ve hit the hourly limit. Resets at 11:00 PM UTC.',
  action: {
    label: 'View details',
    onClick: () => openSettingsPage('usage')
  }
});
```

### 1.4 Positioning & Stacking

**Bottom-Right** (default, recommended for most SaaS)
- Natural eye path (users scan from top-left to bottom-right)
- Doesn't overlap with CTAs in bottom-right corners
- Works well with action buttons
- Best for: Success confirmations, undo actions, transient feedback

```typescript
// Sonner default positioning (no config needed)
toast.success('Changes saved');
```

**Top-Center** (for critical/alert messages)
- Demands attention without being intrusive
- Best for: Time-sensitive warnings, quota alerts, system messages
- Use sparingly (not for every success)

```typescript
import { Toaster } from 'sonner';

// In App.tsx, pass position prop
<Toaster position="top-center" />

// Then toasts will appear top-center
toast.warning('Maintenance window: 2:00 - 3:00 AM UTC tomorrow');
```

**Stacking Rules**
- Maximum 3 toasts visible at once
- Older toasts slide up when new ones appear
- Auto-dismiss order: oldest first
- If user has 5 pending actions, they're overwhelmed (reconsider UX)

### 1.5 Duration & Dismissal Strategy

| Type | Duration | Dismissal | Use Case |
|------|----------|-----------|----------|
| Success | 3s | Auto | Confirmation (save, upload, send) |
| Error | Infinite | User | Action required or retry needed |
| Info | 4s | Auto | Helpful tip, neutral notification |
| Warning | 5s | Auto | Alert, but not urgent |
| Loading | N/A | Replaced | Transition to success/error |

**Rule: Never dismiss error toasts automatically.** Error requires action (retry, troubleshoot, contact support). If you auto-dismiss errors, users miss them.

```typescript
// WRONG: Auto-dismiss error
toast.error('Failed to save', { duration: 3000 });

// CORRECT: Error persists until dismissed
toast.error('Failed to save', {
  duration: Infinity,
  action: {
    label: 'Retry',
    onClick: () => retryOperation()
  }
});
```

### 1.6 Usage Rules

**When to use toast:**
- One-off feedback (save success, copy confirmed, item deleted)
- Feedback that doesn't need to persist long
- Non-blocking, transient messages
- User can continue work while toast visible

**When NOT to use toast:**
- Form validation errors (use inline field errors)
- Critical warnings that need immediate action (use modal)
- Information user must act on immediately (use alert banner)
- Complex errors needing detailed explanation (use modal or error page)

```typescript
// GOOD: Toast for transient feedback
toast.success('Password updated');

// BAD: Toast for validation error (should be inline)
// ❌ toast.error('Email format invalid');
// ✅ <FormField error="Email format invalid" />

// GOOD: Toast for API error with recovery
toast.error('Network error', {
  action: { label: 'Retry', onClick: retry }
});

// BAD: Toast for critical security alert (should be modal/banner)
// ❌ toast.warning('Suspicious login detected');
// ✅ <AlertDialog open={true}>Suspicious login detected</AlertDialog>
```

### 1.7 Code Examples

**Complete toast flow in JobDetailView:**

```typescript
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export const JobDetailView = () => {
  const [isRanking, setIsRanking] = useState(false);

  const handleRankResumes = async () => {
    if (!jobDescription.trim()) {
      toast.error('Job description required', {
        description: 'Please enter a job description before ranking.'
      });
      return;
    }

    if (selectedFiles.length === 0) {
      toast.error('No resumes selected', {
        description: 'Upload at least 1 resume to begin ranking.'
      });
      return;
    }

    setIsRanking(true);

    // Promise-based toast with auto-transition
    toast.promise(
      rankResumes(jobDescription, selectedFiles),
      {
        loading: `Analyzing ${selectedFiles.length} resumes...`,
        success: (data) => {
          // Optionally fetch additional data on success
          refreshResults();
          return `Ranked ${data.count} candidates successfully`;
        },
        error: (error) => {
          console.error('Ranking failed:', error);
          return `Failed to rank: ${error.message}`;
        }
      }
    );

    try {
      await rankResumes(jobDescription, selectedFiles);
    } catch (error) {
      console.error('Ranking error:', error);
      // Promise toast handles error display
    } finally {
      setIsRanking(false);
    }
  };

  return (
    <Button onClick={handleRankResumes} disabled={isRanking}>
      Rank Candidates
    </Button>
  );
};
```

---

## 2. Alert Banners (Page-Level)

Full-width or contained banners for persistent, contextual alerts that sit above page content.

### 2.1 Types & Colors

**Info Banner** (blue background)
- Purpose: Neutral information (new feature availability, helpful tips)
- Background: `bg-blue-50` + `border-l-4 border-blue-600`
- Text: `text-blue-900`
- Icon: `<Info className="text-blue-600" />`
- Dismissible: Yes
- Placement: Top of content area

```typescript
<Alert className="border-l-4 border-blue-600 bg-blue-50">
  <Info className="h-4 w-4 text-blue-600" />
  <AlertTitle className="text-blue-900">Tip</AlertTitle>
  <AlertDescription className="text-blue-800">
    You can import multiple jobs using CSV. <a href="#" className="underline">Learn how</a>
  </AlertDescription>
</Alert>
```

**Warning Banner** (yellow background)
- Purpose: Non-critical alert user should know about (quota warnings, deprecations)
- Background: `bg-yellow-50` + `border-l-4 border-yellow-600`
- Text: `text-yellow-900`
- Icon: `<AlertTriangle className="text-yellow-600" />`
- Dismissible: Optional (critical warnings persist, feature deprecation dismissible)
- Placement: Top of content area

```typescript
<Alert className="border-l-4 border-yellow-600 bg-yellow-50">
  <AlertTriangle className="h-4 w-4 text-yellow-600" />
  <AlertTitle className="text-yellow-900">Limited API Calls Remaining</AlertTitle>
  <AlertDescription className="text-yellow-800">
    You have 50 API calls remaining this month. Upgrade to Premium for unlimited access.
    <Button variant="outline" size="sm" className="ml-2">Upgrade</Button>
  </AlertDescription>
</Alert>
```

**Error Banner** (red background)
- Purpose: Critical error requiring action (payment failed, email unverified, service degraded)
- Background: `bg-red-50` + `border-l-4 border-red-600`
- Text: `text-red-900`
- Icon: `<XCircle className="text-red-600" />`
- Dismissible: NO (critical issues must not be hidden)
- Placement: Top of content area

```typescript
<Alert className="border-l-4 border-red-600 bg-red-50">
  <XCircle className="h-4 w-4 text-red-600" />
  <AlertTitle className="text-red-900">Payment Failed</AlertTitle>
  <AlertDescription className="text-red-800">
    Your subscription payment failed. Your account will be downgraded in 3 days.
    <Button variant="destructive" size="sm" className="ml-2">Update Payment</Button>
  </AlertDescription>
</Alert>
```

**Success Banner** (green background)
- Purpose: Confirmation of completed action (rarely used, prefer toast)
- Background: `bg-green-50` + `border-l-4 border-green-600`
- Text: `text-green-900`
- Icon: `<CheckCircle className="text-green-600" />`
- Dismissible: Yes
- Placement: Top of content area
- Note: Usually unnecessary. Toasts work better for success feedback.

### 2.2 Banner Anatomy

```typescript
// Complete banner structure
<Alert className="border-l-4 border-yellow-600 bg-yellow-50">
  {/* Icon (20x20) */}
  <AlertTriangle className="h-5 w-5 text-yellow-600" />

  {/* Content area */}
  <div className="flex-1">
    {/* Title (bold, 14-16px) */}
    <AlertTitle className="text-yellow-900 font-semibold">
      Trial Expires Soon
    </AlertTitle>

    {/* Description (regular, 13-14px, optional) */}
    <AlertDescription className="text-yellow-800 text-sm mt-1">
      Your free trial ends April 6, 2026. Upgrade now to continue using the project.
    </AlertDescription>
  </div>

  {/* Optional dismiss button (close icon) */}
  <Button
    variant="ghost"
    size="sm"
    className="h-5 w-5 p-0"
    onClick={() => setShowBanner(false)}
  >
    <X className="h-4 w-4" />
  </Button>

  {/* Optional action button */}
  <Button variant="outline" size="sm" className="ml-auto">
    Upgrade
  </Button>
</Alert>
```

### 2.3 Full-Width vs Contained

**Full-Width Banner**
- Spans entire viewport width
- Sits above main navigation or at very top
- Use for: Critical system messages (maintenance, security breach), site-wide alerts
- Applies to all pages

```typescript
// In App.tsx, above main content
<div className="fixed top-0 left-0 right-0 z-50">
  <Alert className="rounded-none border-l-0 border-b-4 border-red-600 bg-red-50">
    {/* System maintenance alert */}
  </Alert>
</div>
<main className="pt-16">
  {/* Page content */}
</main>
```

**Contained Banner** (within Card or section)
- Sits within content area (inside Card, above content in section)
- Use for: Context-specific alerts (payment failed on billing page, email unverified on settings)
- Applies only to that section/page

```typescript
// In Settings.tsx, within AccountInfoCard
<Card>
  <CardHeader>
    <CardTitle>Account</CardTitle>
  </CardHeader>

  {/* Alert is contained within card */}
  <Alert className="border-l-4 border-blue-600 bg-blue-50 m-6">
    <Info className="h-4 w-4 text-blue-600" />
    <AlertTitle>Email Not Verified</AlertTitle>
    <AlertDescription>
      Verify your email to restore full account access.
      <Button variant="link" size="sm">Verify now</Button>
    </AlertDescription>
  </Alert>

  <CardContent>
    {/* Form fields */}
  </CardContent>
</Card>
```

### 2.4 Persistent vs Dismissible Rules

**Persistent Banners** (no close button)
- Trial expiring
- Email unverified
- Payment failed
- Account suspended
- Service degradation
- Critical security alert

Rule: User cannot hide persistent banners. They persist across page reloads.

```typescript
// Persistent banner (no dismiss option)
{shouldShowPaymentFailedBanner && (
  <Alert className="border-l-4 border-red-600 bg-red-50">
    <XCircle className="h-4 w-4 text-red-600" />
    <AlertTitle>Payment Failed</AlertTitle>
    <AlertDescription>
      Update your payment method to continue using the project.
    </AlertDescription>
    {/* No close button */}
  </Alert>
)}
```

**Dismissible Banners** (with close X button)
- Feature announcements
- Helpful tips
- Non-urgent updates
- New feature promotion
- Changelog highlights

Rule: Store dismissal state in localStorage to prevent spam.

```typescript
// Dismissible banner with persistent dismissal state
const [showNewFeatureBanner, setShowNewFeatureBanner] = useState(() => {
  const stored = localStorage.getItem('banner_new_feature_dismissed');
  return stored !== 'true';
});

const dismissBanner = () => {
  setShowNewFeatureBanner(false);
  localStorage.setItem('banner_new_feature_dismissed', 'true');
};

return (
  <>
    {showNewFeatureBanner && (
      <Alert className="border-l-4 border-blue-600 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle>New Feature Available</AlertTitle>
        <AlertDescription>
          Email ingestion is now available for the project Plus members.
        </AlertDescription>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 ml-auto p-0"
          onClick={dismissBanner}
        >
          <X className="h-4 w-4" />
        </Button>
      </Alert>
    )}
  </>
);
```

### 2.5 Single Banner Rule

Best practice: Show only one banner at a time. Multiple banners overwhelm users.

```typescript
// Priority ordering for multiple banner conditions
const getPrimaryBanner = () => {
  if (paymentFailed) return 'error'; // Highest priority
  if (emailUnverified) return 'warning';
  if (trialExpiringIn3Days) return 'warning';
  if (newFeatureAvailable) return 'info'; // Lowest priority
  return null;
};

const primaryBannerType = getPrimaryBanner();

return (
  <>
    {primaryBannerType === 'error' && <PaymentFailedBanner />}
    {primaryBannerType === 'warning' && (
      emailUnverified ? <EmailVerifyBanner /> : <TrialExpiringBanner />
    )}
    {primaryBannerType === 'info' && <NewFeatureBanner />}
  </>
);
```

---

## 3. Inline Alerts (Within Forms/Sections)

Small contextual alerts for field-specific or section-specific feedback.

### 3.1 Anatomy & Placement

```typescript
// Inline alert with left border
<div className="border-l-4 border-red-600 bg-red-50 p-3 rounded-r">
  <div className="flex gap-2">
    <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
    <div>
      <p className="text-sm font-medium text-red-900">
        This field is required
      </p>
      <p className="text-sm text-red-800">
        Enter a valid job title to continue.
      </p>
    </div>
  </div>
</div>
```

### 3.2 Field-Level Validation Context

```typescript
// Within form field component
<FormField
  label="Email"
  type="email"
  {...emailField}
/>

{/* Inline validation alert below field */}
{emailField.error && (
  <div className="border-l-4 border-red-600 bg-red-50 p-2 rounded-r mt-2 text-sm">
    <p className="text-red-900">{emailField.error}</p>
  </div>
)}
```

### 3.3 Section-Specific Warnings

```typescript
// In CandidateRow, warning about candidate fit
<Card>
  <CardHeader>
    <CardTitle>John Smith</CardTitle>
  </CardHeader>

  {/* Red flags section */}
  {result.redFlags && result.redFlags.length > 0 && (
    <div className="border-l-4 border-yellow-600 bg-yellow-50 p-3 mx-6 my-3 rounded-r">
      <AlertTriangle className="h-4 w-4 text-yellow-600 inline mr-2" />
      <span className="text-sm text-yellow-900 font-medium">
        {result.redFlags.length} potential concern{result.redFlags.length !== 1 ? 's' : ''}
      </span>
      <ul className="mt-2 text-sm text-yellow-800 list-disc list-inside">
        {result.redFlags.map(flag => (
          <li key={flag}>{flag}</li>
        ))}
      </ul>
    </div>
  )}

  <CardContent>
    {/* Candidate details */}
  </CardContent>
</Card>
```

---

## 4. Confirmation Dialogs (AlertDialog)

Modal for destructive or high-stakes actions that require explicit user confirmation.

### 4.1 Anatomy & Destructive Patterns

```typescript
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';

// Destructive action confirmation
<AlertDialog open={openDeleteConfirm} onOpenChange={setOpenDeleteConfirm}>
  <AlertDialogContent>
    {/* Title: specific action + item name */}
    <AlertDialogTitle>Delete Job: "Senior Engineer"?</AlertDialogTitle>

    {/* Description: consequences clearly stated */}
    <AlertDialogDescription>
      This action cannot be undone. All ranked candidates and results for this job will be permanently deleted.
    </AlertDialogDescription>

    {/* Actions: Cancel (left) + Destructive (right) */}
    <div className="flex justify-end gap-3">
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDeleteJob}
        className="bg-red-600 hover:bg-red-700 text-white"
      >
        Delete Job
      </AlertDialogAction>
    </div>
  </AlertDialogContent>
</AlertDialog>
```

### 4.2 Button Ordering Rule

**Critical Rule: Destructive action ALWAYS on RIGHT**

Why? Reading direction is left-to-right. User's eye lands on Cancel first, reducing accidental clicks.

```typescript
// CORRECT: Destructive on right
<div className="flex gap-3">
  <Button variant="outline">Cancel</Button>
  <Button variant="destructive">Delete</Button> {/* RIGHT */}
</div>

// WRONG: Destructive on left (dangerous!)
// ❌
// <Button variant="destructive">Delete</Button>
// <Button variant="outline">Cancel</Button>
```

### 4.3 Type-to-Confirm for High-Stakes Actions

For dangerous operations (delete account, delete all data, downgrade plan):

```typescript
const [confirmText, setConfirmText] = useState('');

<AlertDialog open={openDeleteAccount} onOpenChange={setOpenDeleteAccount}>
  <AlertDialogContent>
    <AlertDialogTitle>Delete Account Permanently</AlertDialogTitle>
    <AlertDialogDescription>
      <p className="mb-4">
        This action is permanent. All data will be deleted and cannot be recovered.
      </p>
      <p className="font-semibold mb-2">Type DELETE to confirm:</p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
        placeholder="Type DELETE"
        className="w-full border rounded px-2 py-1"
      />
    </AlertDialogDescription>

    <div className="flex justify-end gap-3">
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDeleteAccount}
        disabled={confirmText !== 'DELETE'}
        className="bg-red-600 disabled:opacity-50"
      >
        Delete Account
      </AlertDialogAction>
    </div>
  </AlertDialogContent>
</AlertDialog>
```

### 4.4 When to Use AlertDialog

**Use AlertDialog:**
- Destructive operations (delete, remove, cancel subscription)
- Actions with significant consequences (downgrade plan, export all data)
- Changes user cannot undo
- Quota changes (increase/decrease limits)

**Don't use AlertDialog:**
- Non-destructive actions (edit, update, save)
- Questions that are helpful but optional ("Want tips?" → dismissible modal, not AlertDialog)
- Warnings that don't require action (use toast or banner instead)

```typescript
// GOOD: AlertDialog for delete
<AlertDialog>
  <AlertDialogTitle>Delete resume?</AlertDialogTitle>
  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
</AlertDialog>

// GOOD: Toast for confirmation
toast.success('Resume deleted');

// BAD: AlertDialog for save (not destructive)
// ❌ <AlertDialog><AlertDialogTitle>Save changes?</AlertDialogTitle></AlertDialog>
// ✅ Just save silently + toast for confirmation
```

---

## 5. Notification Center (In-App Inbox)

Centralized hub for users to view, filter, and manage all in-app notifications.

### 5.1 Notification Center Button & Badge

```typescript
// In AppHeader
import { Bell, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const NotificationCenter = ({ unreadCount }) => {
  const [open, setOpen] = useState(false);
  const { notifications, markAllAsRead } = useNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0 rounded-lg shadow-lg">
        {/* Notification panel content */}
      </PopoverContent>
    </Popover>
  );
};
```

### 5.2 Notification Panel Layout

```typescript
// Inside PopoverContent
<div className="divide-y">
  {/* Header */}
  <div className="flex items-center justify-between p-4 bg-gray-50">
    <h3 className="font-semibold text-sm">Notifications</h3>
    {unreadCount > 0 && (
      <Button
        variant="ghost"
        size="sm"
        onClick={markAllAsRead}
        className="text-xs text-blue-600"
      >
        Mark all read
      </Button>
    )}
  </div>

  {/* Notification list */}
  <div className="max-h-96 overflow-y-auto">
    {notifications.length === 0 ? (
      /* Empty state */
      <div className="p-8 text-center">
        <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-600">You're all caught up</p>
      </div>
    ) : (
      /* Grouped by date */
      <>
        {Object.entries(groupByDate(notifications)).map(([date, items]) => (
          <div key={date}>
            {/* Date group header */}
            <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 sticky top-0">
              {date}
            </div>

            {/* Notification items */}
            {items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
              />
            ))}
          </div>
        ))}
      </>
    )}
  </div>

  {/* Footer */}
  <div className="px-4 py-2 bg-gray-50 text-center border-t">
    <Button
      variant="ghost"
      size="sm"
      className="text-xs text-blue-600"
      onClick={() => navigateToNotificationsPage()}
    >
      View all notifications
    </Button>
  </div>
</div>
```

### 5.3 Notification Item Component

```typescript
const NotificationItem = ({ notification }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'px-4 py-3 border-l-4 cursor-pointer transition',
        notification.read
          ? 'border-transparent bg-white hover:bg-gray-50'
          : 'border-blue-600 bg-blue-50 hover:bg-blue-100'
      )}
      onClick={() => markAsRead(notification.id)}
    >
      {/* Notification header */}
      <div className="flex gap-3">
        {/* Icon/Avatar */}
        <div className="flex-shrink-0">
          {notification.type === 'job_completed' && (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          {notification.type === 'payment_received' && (
            <CreditCard className="h-4 w-4 text-blue-600" />
          )}
          {notification.type === 'error' && (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {notification.title}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {notification.description}
          </p>

          {/* Timestamp + Read indicator */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500">
              {formatTimeAgo(notification.createdAt)}
            </span>
            {!notification.read && (
              <span className="h-2 w-2 rounded-full bg-blue-600" />
            )}
          </div>
        </div>

        {/* Actions (on hover) */}
        <div className="flex-shrink-0 opacity-0 hover:opacity-100 transition">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              deleteNotification(notification.id);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
```

### 5.4 Grouping by Date

```typescript
const groupByDate = (notifications: Notification[]) => {
  const now = new Date();
  const groups: Record<string, Notification[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: []
  };

  notifications.forEach((notification) => {
    const date = new Date(notification.createdAt);
    const daysAgo = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (daysAgo === 0) {
      groups['Today'].push(notification);
    } else if (daysAgo === 1) {
      groups['Yesterday'].push(notification);
    } else if (daysAgo <= 7) {
      groups['This Week'].push(notification);
    } else {
      groups['Older'].push(notification);
    }
  });

  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([_, items]) => items.length > 0)
  );
};
```

### 5.5 Full Notifications Page

```typescript
// pages/Notifications.tsx
export const NotificationsPage = () => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'job' | 'billing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { notifications } = useNotifications();

  const filtered = notifications.filter((n) => {
    if (filter === 'unread' && n.read) return false;
    if (filter === 'job' && !n.type.includes('job')) return false;
    if (filter === 'billing' && !n.type.includes('payment')) return false;
    if (searchQuery && !n.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <>
      <AppHeader />
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Notifications</h1>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {(['all', 'unread', 'job', 'billing'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="search"
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};
```

---

## 6. Email Notifications

Multi-channel transactional email strategy with user preference controls.

### 6.1 Email Categories

**Transactional Emails** (always send, no preference)
- Password reset
- Email verification
- Login alert (suspicious activity)
- Payment receipt/invoice
- API key revoked
- Account security event

**Notification Emails** (user controls frequency)
- Job ranking complete
- New feature available
- Weekly digest
- Monthly usage report
- Trial expiring (1 week, 3 days, 1 day before)
- Plan downgrade warning

**Marketing Emails** (must be opt-in)
- Product updates/changelog
- Feature announcements
- Case studies / customer stories
- Promotional offers
- Re-engagement campaigns
- Newsletter

### 6.2 Email Preference Matrix

```typescript
// Notification preferences card
type NotificationType = 'job_ranking' | 'feature_update' | 'billing' | 'security';
type Channel = 'email' | 'in_app';

interface NotificationPreference {
  type: NotificationType;
  channel: Channel;
  enabled: boolean;
  frequency?: 'real_time' | 'daily' | 'weekly' | 'off';
}

const NotificationPreferencesCard = () => {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([
    // Initial preferences from DB
  ]);

  const togglePreference = (type: NotificationType, channel: Channel) => {
    setPreferences(prefs =>
      prefs.map(p =>
        p.type === type && p.channel === channel
          ? { ...p, enabled: !p.enabled }
          : p
      )
    );
  };

  const updateFrequency = (type: NotificationType, frequency: string) => {
    setPreferences(prefs =>
      prefs.map(p =>
        p.type === type
          ? { ...p, frequency: frequency as any }
          : p
      )
    );
  };

  const handleSave = async () => {
    await updateNotificationPreferences(preferences);
    toast.success('Notification preferences updated');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Matrix: rows = notification types, columns = channels */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 font-semibold">Notification Type</th>
              <th className="text-center py-2 font-semibold">Email</th>
              <th className="text-center py-2 font-semibold">In-App</th>
              <th className="text-left py-2 font-semibold">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {/* Job Ranking Complete */}
            <tr className="border-b hover:bg-gray-50">
              <td className="py-3">
                <p className="font-medium">Job Ranking Complete</p>
                <p className="text-xs text-gray-600">When resume analysis finishes</p>
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  checked={preferences.find(p => p.type === 'job_ranking' && p.channel === 'email')?.enabled}
                  onChange={() => togglePreference('job_ranking', 'email')}
                  className="cursor-pointer"
                />
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  checked={preferences.find(p => p.type === 'job_ranking' && p.channel === 'in_app')?.enabled}
                  onChange={() => togglePreference('job_ranking', 'in_app')}
                  className="cursor-pointer"
                />
              </td>
              <td>
                <select
                  value={preferences.find(p => p.type === 'job_ranking')?.frequency || 'real_time'}
                  onChange={(e) => updateFrequency('job_ranking', e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="real_time">Real-time</option>
                  <option value="daily">Daily digest</option>
                  <option value="weekly">Weekly digest</option>
                  <option value="off">Off</option>
                </select>
              </td>
            </tr>

            {/* Feature Updates */}
            <tr className="border-b hover:bg-gray-50">
              <td className="py-3">
                <p className="font-medium">Feature Updates</p>
                <p className="text-xs text-gray-600">New features and improvements</p>
              </td>
              <td className="text-center">
                <input type="checkbox" defaultChecked />
              </td>
              <td className="text-center">
                <input type="checkbox" defaultChecked />
              </td>
              <td>
                <select defaultValue="weekly" className="border rounded px-2 py-1 text-xs">
                  <option>Weekly</option>
                  <option>Off</option>
                </select>
              </td>
            </tr>

            {/* Billing Alerts */}
            <tr className="border-b hover:bg-gray-50">
              <td className="py-3">
                <p className="font-medium">Billing Alerts</p>
                <p className="text-xs text-gray-600">Payment received, plan changes</p>
              </td>
              <td className="text-center">
                <input type="checkbox" defaultChecked disabled />
              </td>
              <td className="text-center">
                <input type="checkbox" defaultChecked disabled />
              </td>
              <td>
                <span className="text-xs text-gray-600">Always on</span>
              </td>
            </tr>

            {/* Security Alerts */}
            <tr className="hover:bg-gray-50">
              <td className="py-3">
                <p className="font-medium">Security Alerts</p>
                <p className="text-xs text-gray-600">Login, password, sensitive changes</p>
              </td>
              <td className="text-center">
                <input type="checkbox" defaultChecked disabled />
              </td>
              <td className="text-center">
                <input type="checkbox" defaultChecked disabled />
              </td>
              <td>
                <span className="text-xs text-gray-600">Always on</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Legal: Unsubscribe link */}
        <p className="text-xs text-gray-600 mt-6 italic">
          You can always unsubscribe from marketing emails by clicking the link in the email footer.
        </p>
      </CardContent>

      <CardFooter>
        <Button onClick={handleSave}>Save Preferences</Button>
      </CardFooter>
    </Card>
  );
};
```

### 6.3 Email Unsubscribe Requirement

Every marketing email must include an unsubscribe link (legal requirement):

```typescript
// Email template footer
const EmailFooter = ({ userId, emailType }: { userId: string; emailType: string }) => {
  const unsubscribeLink = `${BASE_URL}/email/unsubscribe?user_id=${userId}&type=${emailType}&token=${generateToken()}`;

  return (
    <footer style={{ borderTop: '1px solid #e0e0e0', marginTop: '2rem', paddingTop: '1rem' }}>
      <p style={{ fontSize: '12px', color: '#666' }}>
        <a href={unsubscribeLink} style={{ color: '#0066cc' }}>
          Unsubscribe from {emailType} emails
        </a>
        {' '} | {' '}
        <a href={`${BASE_URL}/settings/notifications`} style={{ color: '#0066cc' }}>
          Manage preferences
        </a>
      </p>
    </footer>
  );
};
```

---

## 7. In-App Messaging

Feature announcements, changelogs, tooltips, and contextual guidance.

### 7.1 Feature Announcement Modal

```typescript
// Modal on first visit after feature release
const FeatureAnnouncementModal = ({ featureKey, onDismiss }) => {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => {
    // Mark feature as seen in user settings
    markFeatureAsViewed(featureKey);
    setDismissed(true);
    onDismiss();
  };

  if (dismissed) return null;

  return (
    <Dialog open={!dismissed} onOpenChange={handleDismiss}>
      <DialogContent className="max-w-sm">
        {/* Feature image/icon */}
        <div className="w-full h-48 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg mb-6 flex items-center justify-center">
          <Sparkles className="h-16 w-16 text-white" />
        </div>

        {/* Title + description */}
        <DialogHeader>
          <DialogTitle>Email Ingestion (Beta)</DialogTitle>
          <DialogDescription>
            Forward resumes directly to your the project inbox. No more uploads needed.
          </DialogDescription>
        </DialogHeader>

        {/* Feature highlights */}
        <ul className="space-y-3 my-4">
          <li className="flex gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm">Automatic ranking when resumes arrive</span>
          </li>
          <li className="flex gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm">No credit cost for email ingestion (Premium)</span>
          </li>
          <li className="flex gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-sm">Works with Gmail, Outlook, custom domains</span>
          </li>
        </ul>

        {/* CTA + dismiss */}
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            Dismiss
          </Button>
          <Button onClick={() => navigateTo('/settings/integrations')}>
            Set Up Email Inbox
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

### 7.2 Changelog Modal

```typescript
// Triggered from "What's new?" link in settings
const ChangelogModal = ({ open, onOpenChange }) => {
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    fetchChangelog().then(setChangelog);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What's New in the project</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {changelog.map((entry) => (
            <div key={entry.id} className="border-l-4 border-blue-600 pl-4">
              <h3 className="font-semibold text-sm">{entry.title}</h3>
              <p className="text-xs text-gray-600 mb-2">{formatDate(entry.date)}</p>
              <p className="text-sm text-gray-700 mb-3">{entry.description}</p>

              {entry.features && (
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                  {entry.features.map((feature, i) => (
                    <li key={i}>{feature}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

### 7.3 Contextual Tooltips

```typescript
// Help text on hover for complex features
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

<TooltipProvider>
  <div className="flex gap-2 items-center">
    <label className="text-sm font-medium">Confidence Threshold</label>
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm">
          Only show candidates with a confidence score above this threshold. Higher threshold = fewer but higher-quality matches.
        </p>
      </TooltipContent>
    </Tooltip>
  </div>

  <Slider
    value={[threshold]}
    onValueChange={([value]) => setThreshold(value)}
    min={50}
    max={100}
    step={5}
    className="mt-2"
  />
</TooltipProvider>
```

---

## 8. Error Handling Hierarchy

Strategy for showing errors to users, from best to worst.

### 8.1 Hierarchy (Most to Least Preferred)

1. **Inline field validation** (form input)
2. **Inline section alert** (below related content)
3. **Toast notification** (transient feedback)
4. **Alert dialog** (requires action)
5. **Full error page** (catastrophic, show last)

### 8.2 Examples by Hierarchy Level

**Level 1: Inline Field Validation**
```typescript
// BEST: User knows immediately what's wrong and where
<FormField
  label="Email"
  value={email}
  error={emailError}
  helperText="Must be a valid email address"
/>

{emailError && (
  <p className="text-sm text-red-600 mt-1">{emailError}</p>
)}
```

**Level 2: Inline Section Alert**
```typescript
// For errors within a specific section
{resumeUploadError && (
  <Alert className="border-l-4 border-red-600 bg-red-50 mb-4">
    <XCircle className="h-4 w-4 text-red-600" />
    <AlertTitle>Upload Failed</AlertTitle>
    <AlertDescription>
      {resumeUploadError} Please check file format and try again.
    </AlertDescription>
  </Alert>
)}
```

**Level 3: Toast Notification**
```typescript
// For transient feedback the user can dismiss
toast.error('Failed to save job description', {
  action: {
    label: 'Retry',
    onClick: () => saveJobDescription()
  }
});
```

**Level 4: Alert Dialog**
```typescript
// For errors requiring explicit action/acknowledgment
<AlertDialog>
  <AlertDialogTitle>Payment Processing Error</AlertDialogTitle>
  <AlertDialogDescription>
    Your payment could not be processed. Please update your payment method or try a different card.
  </AlertDialogDescription>
  <AlertDialogAction onClick={() => navigateToPaymentSettings()}>
    Update Payment Method
  </AlertDialogAction>
</AlertDialog>
```

**Level 5: Error Page**
```typescript
// LAST RESORT: Only for unrecoverable system errors
<div className="min-h-screen flex items-center justify-center bg-gray-50">
  <div className="text-center">
    <AlertTriangle className="h-16 w-16 text-red-600 mx-auto mb-4" />
    <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
    <p className="text-gray-600 mt-2">500 Internal Server Error</p>
    <Button className="mt-6" onClick={() => location.reload()}>
      Reload Page
    </Button>
  </div>
</div>
```

### 8.3 Error Message Guidelines

**Never show raw error messages to users:**
```typescript
// BAD (raw error):
// "TypeError: Cannot read property 'results' of undefined"

// GOOD (user-friendly):
// "Failed to load candidates. Please refresh the page."
```

**Always include actionable next step:**
```typescript
// BAD:
toast.error('Failed');

// GOOD:
toast.error('Upload failed', {
  description: 'File exceeds 50MB limit. Try compressing the PDF.',
  action: { label: 'Learn more', onClick: () => openHelpArticle() }
});
```

**Validate early, show errors close to cause:**
```typescript
// BAD: Wait until submission to show errors
const handleSubmit = async () => {
  try {
    await submitForm();
    toast.success('Saved');
  } catch (error) {
    // Too late—user has already filled entire form
    toast.error('Validation failed');
  }
};

// GOOD: Validate as user types
const handleJobDescriptionChange = (text: string) => {
  setJobDescription(text);

  // Validate and show error immediately
  if (text.length < 50) {
    setJobDescriptionError('Description too short (min 50 characters)');
  } else {
    setJobDescriptionError(null);
  }
};
```

---

## 9. Success Feedback Patterns

Celebrating user wins and confirming completed actions.

### 9.1 Quick Actions (Toast Only)

```typescript
// Copy to clipboard
const copyApiKey = async (key: string) => {
  await navigator.clipboard.writeText(key);
  toast.success('Copied to clipboard');
};

// Mark as done
const markResumeDone = async (resumeId: string) => {
  await supabase.from('resumes').update({ status: 'archived' }).eq('id', resumeId);
  toast.success('Resume archived');
};

// Send message
const sendMessage = async (message: string) => {
  await api.sendMessage(message);
  toast.success('Message sent');
};
```

### 9.2 Completed Flows (Redirect + Toast)

```typescript
// Create new job → redirect to job detail + toast
const handleCreateJob = async (jobData: JobData) => {
  const { data, error } = await supabase
    .from('jobs')
    .insert([jobData])
    .select()
    .single();

  if (error) {
    toast.error('Failed to create job');
    return;
  }

  // Redirect + toast
  navigate(`/jobs/${data.id}`);
  toast.success('Job created successfully');
};
```

### 9.3 Milestones (Confetti + Modal)

```typescript
// Celebrate user milestone
const MilestoneModal = ({ milestone, onClose }: { milestone: 'first_job' | 'ranked_100' }) => {
  useEffect(() => {
    // Confetti animation
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, []);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="text-center">
        <Trophy className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
        <DialogTitle className="text-2xl">
          {milestone === 'first_job' && 'Welcome to the project!'}
          {milestone === 'ranked_100' && 'You\'ve Ranked 100 Candidates!'}
        </DialogTitle>
        <DialogDescription className="text-base mt-4">
          {milestone === 'first_job' && 'Your first job is live. Start uploading resumes to see the magic of AI-powered ranking.'}
          {milestone === 'ranked_100' && 'You\'re a pro recruiter now. Check out Pro features for even more power.'}
        </DialogDescription>
        <Button onClick={onClose} className="mt-6 w-full">
          Get Started
        </Button>
      </DialogContent>
    </Dialog>
  );
};
```

### 9.4 Background Tasks (Loading → Success)

```typescript
// Export → loading toast → success with download button
const handleExportResults = async () => {
  const toastId = toast.loading('Generating export...');

  try {
    const csv = await generateResultsCSV(results);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    toast.dismiss(toastId);
    toast.success('Export complete', {
      action: {
        label: 'Download',
        onClick: () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = `rankora_export_${Date.now()}.csv`;
          a.click();
        }
      }
    });
  } catch (error) {
    toast.dismiss(toastId);
    toast.error('Export failed');
  }
};
```

---

---

## Dark Mode

Notifications demand careful dark mode treatment—toasts, alerts, and dialogs must remain visible and readable. Sonner's dark theme config, semantic color choices for alerts, and proper contrast are critical.

### CSS Variable Mapping

**Light Mode (default):**
```css
--background: 0 0% 100%        /* Toast, alert backgrounds */
--foreground: 0 0% 3.6%        /* Text in toasts */
--destructive: 0 84.2% 60.2%   /* Error/danger notifications */
--success: 142 71.2% 29.3%     /* Success alerts */
--warning: 38 92.1% 50.2%      /* Warning alerts */
--info: 217 91.2% 59.8%        /* Info toasts */
--border: 0 0% 89.8%           /* Toast borders */
```

**Dark Mode:**
```css
--background: 0 0% 8%          /* Dark toast background */
--foreground: 0 0% 98%         /* Light text on dark toasts */
--destructive: 0 84.2% 60.2%   /* Red consistent */
--success: 142 71.2% 40%       /* Lighter green for dark */
--warning: 38 92.1% 50.2%      /* Orange consistent */
--info: 217 91.2% 59.8%        /* Blue consistent */
--border: 0 0% 20%             /* Dark toast borders */
```

### Component-Level Overrides

#### Sonner Toaster Configuration

```tsx
import { Toaster } from 'sonner';

export const App = () => (
  <>
    <Toaster
      position="top-right"
      theme="system"
      richColors
      expand={true}
      duration={4000}
      style={{
        '--sonner-toast-background': 'hsl(var(--background))',
        '--sonner-toast-text': 'hsl(var(--foreground))',
        '--sonner-toast-border': 'hsl(var(--border))',
      } as React.CSSProperties}
    />
    {/* App content */}
  </>
);
```

#### Success Toast

```tsx
toast.success('Resume ranked successfully!', {
  description: '125 candidates ranked. Highest match: 94%',
  className: 'dark:bg-card dark:text-foreground dark:border-border',
  descriptionClassName: 'dark:text-muted-foreground',
});
```

#### Error Toast

```tsx
toast.error('Ranking failed', {
  description: 'Please try again or contact support',
  action: {
    label: 'Retry',
    onClick: retryRanking,
  },
  className: 'dark:bg-destructive/10 dark:text-destructive dark:border-destructive/50',
});
```

#### Info/Warning Toast

```tsx
toast.info('Limited time offer', {
  description: 'Get 50% off annual plans. Offer ends in 2 days.',
  className: 'dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
});
```

#### Alert Banner (Persistent)

```tsx
<Alert className={cn(
  'dark:border-border dark:bg-card',
  type === 'error' && 'dark:border-destructive/50 dark:bg-destructive/5',
  type === 'warning' && 'dark:border-amber-800/50 dark:bg-amber-950/30',
  type === 'success' && 'dark:border-green-800/50 dark:bg-green-950/30',
)}>
  <AlertCircle className={cn(
    'h-4 w-4',
    type === 'error' && 'dark:text-destructive text-red-600',
    type === 'warning' && 'dark:text-amber-400 text-amber-600',
    type === 'success' && 'dark:text-green-400 text-green-600',
  )} />
  <AlertTitle className="dark:text-foreground">{title}</AlertTitle>
  <AlertDescription className="dark:text-muted-foreground">
    {description}
  </AlertDescription>
</Alert>
```

#### Notification Center Panel

```tsx
<div className="w-96 dark:bg-card dark:border-border border rounded-lg shadow-lg">
  <div className="border-b dark:border-border p-4 flex items-center justify-between">
    <h2 className="font-semibold dark:text-foreground">Notifications</h2>
    <Badge className="dark:bg-primary dark:text-primary-foreground">5</Badge>
  </div>
  <div className="divide-y dark:divide-border max-h-96 overflow-y-auto">
    {notifications.map((notif) => (
      <div
        key={notif.id}
        className={cn(
          'p-4 hover:bg-muted/50 dark:hover:bg-muted/50 cursor-pointer transition',
          !notif.read && 'bg-muted/30 dark:bg-muted/20'
        )}
      >
        <div className="flex gap-3">
          <div className={cn(
            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
            !notif.read && 'bg-blue-500'
          )} />
          <div className="flex-1">
            <p className="text-sm dark:text-foreground">{notif.title}</p>
            <p className="text-xs dark:text-muted-foreground mt-1">{notif.message}</p>
            <p className="text-xs dark:text-muted-foreground/60 mt-2">{notif.time}</p>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
```

#### Unread Indicator Dot

```tsx
<Button variant="ghost" size="icon" className="relative">
  <Bell className="w-5 h-5" />
  {unreadCount > 0 && (
    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 dark:bg-red-400 rounded-full animate-pulse" />
  )}
</Button>
```

#### Inline Alert (Within Forms)

```tsx
{errors.length > 0 && (
  <Alert className="dark:bg-destructive/5 dark:border-destructive/50">
    <AlertCircle className="h-4 w-4 dark:text-destructive text-red-600" />
    <AlertTitle className="dark:text-foreground">Please fix the following:</AlertTitle>
    <AlertDescription className="dark:text-muted-foreground">
      <ul className="list-disc pl-5 space-y-1">
        {errors.map((err) => <li key={err}>{err}</li>)}
      </ul>
    </AlertDescription>
  </Alert>
)}
```

### Common Dark Mode Mistakes in Notifications

1. **Sonner dark theme not configured:** Always set `theme="system"` and pass custom CSS variables for proper dark mode.
2. **Toast text too light:** Default toast text may become invisible. Ensure text color is mapped to `--foreground`.
3. **Error/success colors don't adapt:** Alert backgrounds need dark mode variants. Use semantic classes like `dark:bg-destructive/5`.
4. **Unread badges hard to see:** Red unread dots may clash. Use `dark:bg-red-400` (lighter) instead of pure red.
5. **Banner descriptions invisible:** Secondary text in alerts must use `dark:text-muted-foreground`, not gray.
6. **Notification center too dark:** Notification panel background should be `dark:bg-card` (slightly lighter than page background).
7. **Dialog overlay too light:** Confirmation dialogs need `dark:bg-background/80` for proper overlay contrast.
8. **Action buttons in toasts hard to click:** Toast action buttons need visible styling in dark mode.

### Code Example: Complete Dark Mode Notification System

```tsx
'use client';

import { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Bell, Check, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DarkModeNotifications = () => {
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: 'Ranking complete',
      message: '125 resumes ranked. Top match: 94%',
      time: '2 minutes ago',
      read: false,
    },
    {
      id: 2,
      title: 'Payment successful',
      message: '1,000 credits added to your account',
      time: '1 hour ago',
      read: true,
    },
  ]);

  const showSuccessToast = () => {
    toast.success('Operation completed!', {
      description: 'Your changes have been saved successfully.',
      className: 'dark:bg-card dark:text-foreground dark:border-border',
      descriptionClassName: 'dark:text-muted-foreground',
    });
  };

  const showErrorToast = () => {
    toast.error('Something went wrong', {
      description: 'Please try again or contact support',
      action: {
        label: 'Retry',
        onClick: () => console.log('Retry'),
      },
      className: 'dark:bg-destructive/10 dark:text-destructive dark:border-destructive/50',
    });
  };

  const showWarningToast = () => {
    toast.warning('Trial ending soon', {
      description: '2 days remaining. Upgrade to continue.',
      className: 'dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    });
  };

  return (
    <div className="min-h-screen dark:bg-background p-6 space-y-8">
      <Toaster
        position="top-right"
        theme="system"
        richColors
        expand={true}
        style={{
          '--sonner-toast-background': 'hsl(var(--card))',
          '--sonner-toast-text': 'hsl(var(--foreground))',
          '--sonner-toast-border': 'hsl(var(--border))',
        } as React.CSSProperties}
      />

      {/* Header */}
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold dark:text-foreground">Notification Patterns</h1>
        <p className="dark:text-muted-foreground mt-2">Dark mode examples</p>
      </div>

      {/* Alert Banners */}
      <div className="max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold dark:text-foreground">Alert Banners</h2>

        {/* Success Alert */}
        <Alert className="dark:border-green-800/50 dark:bg-green-950/30">
          <Check className="h-4 w-4 dark:text-green-400 text-green-600" />
          <AlertTitle className="dark:text-foreground">Payment confirmed</AlertTitle>
          <AlertDescription className="dark:text-muted-foreground">
            1,000 credits have been added to your account
          </AlertDescription>
        </Alert>

        {/* Warning Alert */}
        <Alert className="dark:border-amber-800/50 dark:bg-amber-950/30">
          <AlertCircle className="h-4 w-4 dark:text-amber-400 text-amber-600" />
          <AlertTitle className="dark:text-foreground">Trial ending soon</AlertTitle>
          <AlertDescription className="dark:text-muted-foreground">
            Your free trial expires in 2 days. Upgrade now to continue screening.
          </AlertDescription>
        </Alert>

        {/* Error Alert */}
        <Alert className="dark:border-destructive/50 dark:bg-destructive/5">
          <XCircle className="h-4 w-4 dark:text-destructive text-red-600" />
          <AlertTitle className="dark:text-foreground">Email verification failed</AlertTitle>
          <AlertDescription className="dark:text-muted-foreground">
            Please check your email and try again, or contact support.
          </AlertDescription>
        </Alert>

        {/* Info Alert */}
        <Alert className="dark:border-blue-800/50 dark:bg-blue-950/30">
          <Info className="h-4 w-4 dark:text-blue-400 text-blue-600" />
          <AlertTitle className="dark:text-foreground">New feature available</AlertTitle>
          <AlertDescription className="dark:text-muted-foreground">
            Try our new AI-powered skill gap analysis. Learn more.
          </AlertDescription>
        </Alert>
      </div>

      {/* Toast Buttons */}
      <div className="max-w-2xl space-y-4">
        <h2 className="text-lg font-semibold dark:text-foreground">Toast Examples</h2>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={showSuccessToast} className="dark:bg-green-600 dark:hover:bg-green-700">
            Success Toast
          </Button>
          <Button onClick={showErrorToast} className="dark:bg-red-600 dark:hover:bg-red-700">
            Error Toast
          </Button>
          <Button onClick={showWarningToast} className="dark:bg-amber-600 dark:hover:bg-amber-700">
            Warning Toast
          </Button>
        </div>
      </div>

      {/* Notification Center */}
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold dark:text-foreground mb-4">Notification Center</h2>
        <div className="w-full dark:bg-card dark:border-border border rounded-lg shadow-lg">
          <div className="border-b dark:border-border p-4 flex items-center justify-between">
            <h3 className="font-semibold dark:text-foreground">Notifications</h3>
            <Badge className="dark:bg-primary dark:text-primary-foreground">
              {notifications.filter((n) => !n.read).length}
            </Badge>
          </div>
          <div className="divide-y dark:divide-border">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={cn(
                  'p-4 hover:bg-muted/50 dark:hover:bg-muted/50 cursor-pointer transition',
                  !notif.read && 'bg-muted/30 dark:bg-muted/20'
                )}
              >
                <div className="flex gap-3">
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    !notif.read && 'bg-blue-500'
                  )} />
                  <div className="flex-1">
                    <p className="text-sm dark:text-foreground font-medium">{notif.title}</p>
                    <p className="text-sm dark:text-muted-foreground mt-1">{notif.message}</p>
                    <p className="text-xs dark:text-muted-foreground/60 mt-2">{notif.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## Implementation Checklist

- [ ] Sonner `<Toaster />` installed in App.tsx with correct position
- [ ] Toast duration strategy: success 3s, error infinite, info 4s, warning 5s
- [ ] Error toasts always have retry/action button
- [ ] Alert banners for persistent messages (payment, email verify, trial)
- [ ] Single banner rule: only show highest-priority banner
- [ ] AlertDialog for destructive actions, destructive button on RIGHT
- [ ] Notification center with bell icon and unread count badge
- [ ] Grouped notification list (Today, Yesterday, This Week, Older)
- [ ] Email notification preferences with matrix UI
- [ ] Unsubscribe link in all marketing emails
- [ ] Error hierarchy respected: inline validation > section alert > toast > dialog > error page
- [ ] No raw error messages—always user-friendly copy
- [ ] Success flows redirect + toast (completed actions)
- [ ] Milestone celebrations with confetti modal
- [ ] Loading toasts transition to success/error automatically

---

## Responsive Design

### Breakpoint Behavior

- **sm (640px):** Notification center full-screen, toasts top-center, alert banners full-width, dialogs bottom sheets
- **md (768px):** Notification sidebar collapsible, toasts centered, alerts with prominent dismiss
- **lg (1024px):** Notification panel optional, toasts bottom-right, alerts inline
- **xl (1280px):** Full notification panel with filtering, toasts bottom-right

### Layout Transformations

**Notification Center: Side Panel → Full-Screen:**
```tsx
{/* Desktop: Side panel on lg+ */}
<div className="hidden lg:flex lg:w-80 border-l bg-white flex-col max-h-96">
  <NotificationList />
</div>

{/* Mobile: Full-screen sheet */}
<Sheet open={notificationsOpen}>
  <SheetContent side="right" className="lg:hidden w-full">
    <NotificationList />
  </SheetContent>
</Sheet>
```

**Toast Position: Bottom-Right → Top-Center:**
```tsx
<Toaster
  position={isMobile ? 'top-center' : 'bottom-right'}
  offset={isMobile ? 16 : 0}
/>
```

**Alert Banners: Inline → Full-Width:**
```tsx
{/* Desktop: May be inline */}
<Alert className="col-span-1">Message</Alert>

{/* Mobile: Full-width, stacked */}
<Alert className="w-full mb-4 flex gap-3">
  <Icon className="flex-shrink-0 mt-0.5" />
  <div className="flex-1">Message</div>
  <Button size="icon" className="h-8 w-8 flex-shrink-0" />
</Alert>
```

**Confirmation Dialogs: Modal → Bottom Sheet:**
```tsx
{/* Desktop: Centered modal */}
<AlertDialog open={show}>
  <AlertDialogContent className="max-w-sm">
    {/* Content */}
  </AlertDialogContent>
</AlertDialog>

{/* Mobile: Bottom sheet */}
<Sheet open={show}>
  <SheetContent side="bottom" className="h-auto">
    {/* Full-width buttons */}
  </SheetContent>
</Sheet>
```

### Touch Targets

- **Close button:** 44x44px minimum
- **Notification items:** Full-width card, 56px+ height
- **Alert dismiss:** 44x44px icon button
- **Toast action:** 44px height minimum
- **Confirm buttons:** 44px height, full-width on mobile
- **Bell icon:** 44x44px clickable area

### Mobile-Specific Considerations

- **Toast position:** top-center on sm/md, bottom-right on lg+
- **Alert banners:** Full-width stack on mobile
- **Notification panel:** Sheet on mobile (<lg), sidebar on lg+
- **Dialogs:** Bottom sheets on mobile (easier reach), centered on desktop
- **Button height:** h-11 (44px) on mobile, h-10 (40px) on desktop
- **Spacing:** p-4 on mobile, p-6 on desktop

---


## Sources

- [React Toastify: The Complete Guide (2026)](https://deadsimplechat.com/blog/react-toastify-the-complete-guide/)
- [Sonner: Toast Library for React](https://sonner.emilkowal.ski/)
- [Building a Toast Component](https://emilkowal.ski/ui/building-a-toast-component)
- [SaaS Notification Center Patterns](https://nicelydone.club/tags/notification-center)
- [Notification UI/UX Interface Design Patterns](https://www.saasui.design/pattern/notification)
- [Building Collaborative SaaS with Notifications](https://www.magicbell.com/blog/building-collaborative-and-productive-saas-applications-with-notifications-pt-2)
- [Alert Banner Best Practices](https://www.kalamuna.com/blog/alert-banner-best-practices-web-design-disaster-part-1)
- [Carbon Design System: Notification Pattern](https://carbondesignsystem.com/patterns/notification-pattern/)
- [Designing a Scalable Notification System](https://www.magicbell.com/blog/notification-system-design)
- [In-App Notification Design Best Practices](https://www.magicbell.com/blog/in-app-notification-design)
