# Onboarding Patterns — SaaS UX Design

**Last updated:** 2026-04-04

Onboarding is the critical first impression that determines whether a user becomes activated or churns. These patterns minimize time-to-value and guide users through feature discovery without friction.

---

## 1. Welcome Screen

The first screen after signup. Must immediately communicate value proposition and invite action.

### Anatomy
- **Greeting**: Personalized ("Welcome, Yash!") with optional brief thank-you message
- **Hero message**: Single sentence reiterating the core value prop ("Rank resumes in minutes, not hours")
- **Visual**: Optional illustration or hero image (keep simple, brand-consistent)
- **Primary CTA**: Big button ("Get Started", "Let's Go", "Create Your First Job")
- **Secondary option**: "Take a tour" or "Skip" link (respect user autonomy)

### Component Example (shadcn/ui)
```tsx
export default function WelcomeScreen({ user, onGetStarted, onSkip }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-white px-4">
      <div className="max-w-md text-center space-y-6">
        {/* Icon/Illustration */}
        <div className="w-16 h-16 mx-auto bg-blue-100 rounded-lg flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-blue-600" />
        </div>

        {/* Greeting & Value */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">
            Welcome, {user.firstName}!
          </h1>
          <p className="text-lg text-slate-600">
            Rank resumes in minutes, not hours. Let's build your first job posting.
          </p>
        </div>

        {/* CTAs */}
        <Button
          size="lg"
          onClick={onGetStarted}
          className="w-full"
        >
          Get Started
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full"
        >
          Skip and explore
        </Button>
      </div>
    </div>
  );
}
```

### Best Practices
- ✓ Appears only once (don't repeat on every login)
- ✓ Takes <15 seconds to read
- ✓ Respects user choice (offer skip without friction)
- ✓ Always personalize with user's first name
- ✓ Illustration is optional but enhances warmth

---

## 2. Setup Wizard (Multi-Step)

Linear, step-by-step flow that breaks complex onboarding into digestible chunks.

### Anatomy
- **Progress bar**: Visual indicator at top (e.g., "Step 2 of 4")
- **Step title**: Clear, single-focused heading
- **Form fields**: Only 1-3 fields per step (avoid cognitive load)
- **Description**: Optional helper text explaining *why* you're asking
- **Navigation buttons**: "Back" (except step 1), "Next"/"Continue" (disabled until valid), "Skip" (if optional)
- **Estimated time**: "Takes ~2 minutes" below the form

### Component Example
```tsx
const steps = [
  {
    id: 'job-title',
    title: 'What's the job title?',
    description: 'This helps us tailor resume analysis to the role.',
    fields: ['jobTitle'],
    optional: false,
  },
  {
    id: 'location',
    title: 'Where is this role?',
    description: 'Optional, but helps match location preferences.',
    fields: ['location'],
    optional: true,
  },
  {
    id: 'experience',
    title: 'Years of experience required?',
    description: 'Minimum years to consider.',
    fields: ['minExperience'],
    optional: false,
  },
  {
    id: 'email-inbox',
    title: 'Enable email ingestion?',
    description: 'Let candidates email resumes directly to your inbox.',
    fields: ['enableEmailIngest'],
    optional: true,
  },
];

export default function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  const step = steps[currentStep];
  const isValid = step.optional || step.fields.every(f => formData[f]);

  return (
    <div className="w-full max-w-md mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-600">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm text-slate-500">
            ~2 minutes
          </span>
        </div>
        <Progress
          value={(currentStep + 1) / steps.length * 100}
          className="h-2"
        />
      </div>

      {/* Step Content */}
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">{step.title}</h2>
          {step.description && (
            <p className="text-sm text-slate-600">{step.description}</p>
          )}
        </div>

        {/* Form Fields */}
        <form className="space-y-4">
          {step.id === 'job-title' && (
            <Input
              placeholder="e.g., Senior Software Engineer"
              value={formData.jobTitle || ''}
              onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
            />
          )}
          {step.id === 'location' && (
            <Input
              placeholder="e.g., San Francisco, CA"
              value={formData.location || ''}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          )}
          {step.id === 'experience' && (
            <Select value={formData.minExperience || ''} onValueChange={(v) => setFormData({ ...formData, minExperience: v })}>
              <SelectTrigger><SelectValue placeholder="Select years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No minimum</SelectItem>
                <SelectItem value="1">1+ years</SelectItem>
                <SelectItem value="3">3+ years</SelectItem>
                <SelectItem value="5">5+ years</SelectItem>
              </SelectContent>
            </Select>
          )}
          {step.id === 'email-inbox' && (
            <label className="flex items-center space-x-2">
              <Checkbox
                checked={formData.enableEmailIngest || false}
                onCheckedChange={(v) => setFormData({ ...formData, enableEmailIngest: v })}
              />
              <span className="text-sm text-slate-700">Enable email ingestion</span>
            </label>
          )}
        </form>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          onClick={() => setCurrentStep(currentStep + 1)}
          disabled={!isValid}
          className="flex-1"
        >
          {currentStep === steps.length - 1 ? 'Complete' : 'Next'}
        </Button>
      </div>

      {/* Skip Link */}
      {step.optional && (
        <button
          onClick={() => setCurrentStep(currentStep + 1)}
          className="w-full mt-3 text-sm text-slate-500 hover:text-slate-600 underline"
        >
          Skip this step
        </button>
      )}
    </div>
  );
}
```

### Best Practices
- ✓ Max 4-5 steps (longer wizards have higher abandonment)
- ✓ Show progress (progress bar + step counter)
- ✓ Allow "Back" button (users need to correct mistakes)
- ✓ Disable Next until valid (don't let users progress with errors)
- ✓ Offer Skip for truly optional steps
- ✓ Each step should take <30 seconds
- ✓ Estimated time: "Takes ~2 minutes"

---

## 3. Onboarding Checklist

Persistent sidebar or banner widget tracking completion of setup milestones. Drives activation by showing progress toward "fully set up" state.

### Anatomy
- **Header**: "Setup progress" or "Complete setup" with progress bar or count (e.g., "3 of 6")
- **Checklist items**: 4-6 items, each with checkbox, icon, title, optional description
- **Item states**: Uncompleted (checkbox empty), in-progress (spinner), completed (checkmark + strike-through)
- **CTA buttons**: Each item can have an action button ("Add team", "Verify email", etc.)
- **Dismiss**: Close button (but re-appear on login if incomplete) or "Show later" option
- **Completion message**: Celebration message or confetti when all items checked

### Component Example
```tsx
const checklistItems = [
  {
    id: 'verify-email',
    icon: Mail,
    title: 'Verify your email',
    description: 'Confirm your email address',
    status: 'pending', // pending | in-progress | completed
    action: { label: 'Send verification', onClick: () => {} },
  },
  {
    id: 'first-job',
    icon: Briefcase,
    title: 'Create your first job',
    description: 'Post a job and upload resumes',
    status: 'completed',
    action: null,
  },
  {
    id: 'team-invite',
    icon: Users,
    title: 'Invite team members',
    description: 'Add collaborators to your workspace',
    status: 'pending',
    action: { label: 'Invite team', onClick: () => {} },
  },
  {
    id: 'billing',
    icon: CreditCard,
    title: 'Set up billing',
    description: 'Add payment method for credits',
    status: 'pending',
    action: { label: 'Add payment', onClick: () => {} },
  },
  {
    id: 'integrations',
    icon: Zap,
    title: 'Connect integrations',
    description: 'Sync with ATS or email',
    status: 'pending',
    action: { label: 'Browse integrations', onClick: () => {} },
  },
];

export default function OnboardingChecklist() {
  const [items, setItems] = useState(checklistItems);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const completed = items.filter(i => i.status === 'completed').length;
  const total = items.length;
  const percent = Math.round((completed / total) * 100);

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center font-semibold text-sm hover:bg-blue-700"
      >
        {percent}%
      </button>
    );
  }

  return (
    <div className="w-80 bg-white border border-slate-200 rounded-lg shadow-md p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Complete setup</h3>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">{completed} of {total} done</span>
          <span className="text-blue-600 font-semibold">{percent}%</span>
        </div>
        <Progress value={percent} className="h-2" />
      </div>

      {/* Checklist Items */}
      <div className="space-y-3">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={cn(
                'flex gap-3 p-3 rounded border transition-colors',
                item.status === 'completed'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              )}
            >
              {/* Checkbox */}
              <div className="flex-shrink-0 mt-1">
                {item.status === 'in-progress' ? (
                  <div className="w-5 h-5 rounded border-2 border-blue-400 border-t-blue-600 animate-spin" />
                ) : (
                  <Checkbox
                    checked={item.status === 'completed'}
                    disabled
                    className={cn(
                      'w-5 h-5',
                      item.status === 'completed' && 'bg-green-600 border-green-600'
                    )}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0',
                    item.status === 'completed' ? 'text-green-600' : 'text-slate-400'
                  )} />
                  <div>
                    <p className={cn(
                      'text-sm font-medium',
                      item.status === 'completed'
                        ? 'text-slate-500 line-through'
                        : 'text-slate-900'
                    )}>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                {item.action && item.status !== 'completed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={item.action.onClick}
                    className="mt-2 text-xs"
                  >
                    {item.action.label}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion Message */}
      {completed === total && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
          <p className="text-sm font-semibold text-green-900">All set!</p>
          <p className="text-xs text-green-700 mt-1">You're ready to start ranking resumes.</p>
        </div>
      )}
    </div>
  );
}
```

### Best Practices
- ✓ Show 4-6 items max (more items → lower completion)
- ✓ Prioritize: verification, first key action, then features
- ✓ Allow dismiss but surface again on login (or use sticky banner)
- ✓ Show progress as a % or count (motivates completion)
- ✓ Use green checkmarks for completed items (psychological reward)
- ✓ Each item should link to a quick action (not buried in settings)
- ✓ Collapse to floating badge on mobile
- ✓ Celebrate completion (confetti, toast, or message)

---

## 4. Empty States with Education

First-time empty states should teach, not just say "nothing here." Guide users to immediate value.

### Anatomy (First-Time)
- **Illustration or icon**: Brand-consistent, friendly (48-64px icon or custom SVG)
- **Headline**: "Create your first [thing]" (action-oriented, not passive)
- **Description**: 1-2 sentences explaining what they can do next
- **Primary CTA**: Prominent button with action verb ("Create job", "Upload resume", "Start ranking")
- **Secondary CTA**: Optional link to docs/help ("Learn more", "Watch tutorial")

### Component Example
```tsx
export default function FirstTimeEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-96 bg-gradient-to-b from-slate-50 to-white px-4">
      <div className="max-w-sm text-center space-y-6">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto bg-blue-100 rounded-xl flex items-center justify-center">
          <BriefcaseIcon className="w-10 h-10 text-blue-600" />
        </div>

        {/* Headline & Description */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">
            Create your first job posting
          </h2>
          <p className="text-slate-600">
            Start by posting a job description. We'll use it to score and rank your resumes.
          </p>
        </div>

        {/* Primary CTA */}
        <Button size="lg" className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Create a job
        </Button>

        {/* Secondary CTAs */}
        <div className="flex gap-2 justify-center text-sm">
          <Link href="/docs/getting-started" className="text-blue-600 hover:underline">
            Getting started guide
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/demo" className="text-blue-600 hover:underline">
            Watch demo
          </Link>
        </div>
      </div>
    </div>
  );
}

// No-Results Empty State (Search/Filter)
export function NoResultsEmptyState({ searchTerm, onClear }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-96 bg-slate-50 px-4">
      <div className="max-w-sm text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-slate-200 rounded-lg flex items-center justify-center">
          <Search className="w-8 h-8 text-slate-400" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">
            No results for "{searchTerm}"
          </h3>
          <p className="text-sm text-slate-600">
            Try different keywords or adjust your filters.
          </p>
        </div>

        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}

// Error Empty State
export function ErrorEmptyState({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-96 bg-red-50 px-4">
      <div className="max-w-sm text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-red-100 rounded-lg flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>

        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-red-900">
            Something went wrong
          </h3>
          <p className="text-sm text-red-700">
            Failed to load your resumes. Please try again.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={onRetry} className="flex-1">
            Try again
          </Button>
          <Button variant="outline" className="flex-1">
            Contact support
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Best Practices
- ✓ Always include an action button (don't just apologize)
- ✓ Illustrations should be simple, brand-consistent (not clipart)
- ✓ Use active voice: "Create your first job" not "No jobs found"
- ✓ Keep copy concise (2-3 lines max)
- ✓ Link to help/docs for first-time states
- ✓ Visually separate states by color/tone (error = red, empty = gray, success = green)

---

## 5. Tooltips & Feature Tours

Lightweight, contextual guidance for discovering features without disrupting workflow.

### Tooltip Pattern
```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function FeatureTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm">
            <HelpCircle className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-sm">
            Skill matching uses NLP to compare job requirements with resume skills. Higher score = better match.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

### Feature Tour (Intro.js Style)
```tsx
// Highlight a specific element with context
export function FeatureTour({ step }) {
  const steps = [
    {
      element: '.job-title-input',
      title: 'Paste your job description',
      description: 'Any format works—we'll extract requirements automatically.',
      position: 'bottom',
    },
    {
      element: '.file-upload',
      title: 'Upload resumes',
      description: 'PDF, DOCX, or plain text. Drag and drop or click to browse.',
      position: 'top',
    },
    {
      element: '.score-cards',
      title: 'See instant rankings',
      description: 'Candidates ranked by overall fit, with skill-by-skill breakdowns.',
      position: 'bottom',
    },
  ];

  const current = steps[step];
  if (!current) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-40 pointer-events-none" />
  );
}
```

### Best Practices
- ✓ Keep tooltip text short (<50 words)
- ✓ Use tooltips only for non-obvious features (icons, advanced buttons)
- ✓ Tours should be skippable and max 3-4 steps
- ✓ Avoid tooltips on first-time features (use welcome screen instead)
- ✓ Show tours only on first login (not on every visit)

---

## 6. Progressive Disclosure

Show only what the user needs, reveal advanced features as they gain expertise.

### Implementation Pattern
```tsx
// Start simple: basic job creation form
export function SimpleJobForm() {
  return (
    <form className="space-y-4">
      <TextField label="Job Title" placeholder="e.g., Senior Engineer" />
      <TextArea label="Job Description" placeholder="Paste JD here..." />
      <Button>Continue</Button>
    </form>
  );
}

// After first job: reveal advanced options
export function AdvancedJobForm({ isReturningUser }) {
  const [showAdvanced, setShowAdvanced] = useState(isReturningUser);

  return (
    <form className="space-y-4">
      <TextField label="Job Title" />
      <TextArea label="Job Description" />

      {/* Accordion for advanced options */}
      <Accordion type="single" collapsible>
        <AccordionItem value="weights">
          <AccordionTrigger>Scoring weights (advanced)</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium">Must-have requirements</label>
              <Slider min={0} max={100} defaultValue={[50]} />
            </div>
            <div>
              <label className="text-sm font-medium">Nice-to-have skills</label>
              <Slider min={0} max={100} defaultValue={[30]} />
            </div>
            <div>
              <label className="text-sm font-medium">Experience level</label>
              <Slider min={0} max={100} defaultValue={[20]} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button>Continue</Button>
    </form>
  );
}
```

### Best Practices
- ✓ Hide 60% of features on first use
- ✓ Use accordions, tabs, or "Show more" toggles
- ✓ Reveal advanced features only after key action (first job created, first ranking completed)
- ✓ Label advanced features clearly ("Advanced", "For power users")
- ✓ Remember user preference (if they expand advanced, keep it open next time)

---

## 7. Sample Data & Templates

Pre-populate with realistic data so users immediately see value without doing work.

### Pattern
```tsx
const sampleJobs = [
  {
    id: 'sample-1',
    title: 'Senior Product Manager',
    description: `Senior Product Manager, Enterprise SaaS

Requirements:
- 5+ years in B2B SaaS product management
- Experience with enterprise sales cycles
- Strong SQL knowledge for data analysis
- Portfolio of 2+ successful product launches

Nice to have:
- Experience with developer tools or infrastructure
- Background in analytics or data platforms`,
    isSample: true,
  },
];

export function EmptyStateWithTemplate() {
  const [useTemplate, setUseTemplate] = useState(false);

  if (useTemplate) {
    return <JobDetailView job={sampleJobs[0]} isSample={true} />;
  }

  return (
    <div className="flex gap-4">
      <Button onClick={() => setUseTemplate(true)} variant="outline" className="flex-1">
        <Zap className="w-4 h-4 mr-2" />
        Try a sample job
      </Button>
      <Button className="flex-1">
        <Plus className="w-4 h-4 mr-2" />
        Create your own
      </Button>
    </div>
  );
}
```

### Best Practices
- ✓ Provide 1-2 sample datasets for quick exploration
- ✓ Mark samples visually ("Example", "Sample data")
- ✓ Allow users to fork samples into their own
- ✓ Delete samples after user creates first real item
- ✓ Use realistic industry examples, not placeholder Lorem ipsum

---

## 8. Activation Metrics

Define what "onboarded" means for your product. Track these KPIs to measure effectiveness.

### Critical User Journey
```
Signup
  ↓ (welcome screen)
Email verified
  ↓ (wizard: job setup)
First job created
  ↓ (automatic, AI processing)
First ranking completed
  ↓ (user views results)
✓ ACTIVATED (user is now engaged)
```

### Measurement
- **Welcome screen → Email verified**: Track conversion (e.g., 85% verify within 24h)
- **Email verified → First job created**: Time to first action (target: <5 min)
- **First job created → First ranking**: Processing time + result view (target: <30 sec)
- **7-day retention**: % of activated users returning after 7 days (target: >60%)
- **30-day retention**: % returning after 30 days (target: >40%)

### Targeting
- Users who drop off at email verification → send verification email reminder after 1 hour
- Users who start wizard but abandon → show incentive toast ("Complete setup and get 50 free credits")
- Users who create job but don't view results → monitor job status and surface on return

---

## 9. Email Onboarding Sequence

Transactional email flow that complements in-app onboarding.

### Sequence
1. **Welcome (sent immediately)**
   - Subject: "Welcome to the project! Get started in 2 minutes"
   - Content: Link to app, key benefits, CTA to create first job
   - Metric: Open rate (track click-through to app)

2. **Email verification reminder (if not verified after 1 hour)**
   - Subject: "Confirm your email to unlock resume ranking"
   - Content: Verification link + explanation of why
   - Metric: Conversion to verified

3. **Post-first-job (after user completes setup wizard)**
   - Subject: "Your first job is live! Here's what the project will do next"
   - Content: Explain the AI ranking process, set expectations for time
   - Metric: Email engagement

4. **First ranking ready (when results are available)**
   - Subject: "Resumes ranked! Your top candidates are ready"
   - Content: Link to view results, sample findings, next steps
   - Metric: App re-engagement

5. **Re-engagement (if no activity after 3 days)**
   - Subject: "You're closer than you think to your perfect hire"
   - Content: Tips for using rankings, quick start link
   - Metric: Return engagement rate

---

## 10. Re-Engagement Patterns

Patterns for users who return after inactivity (inactive >7 days).

### Return Flow
```tsx
export function ReEngagementBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Alert className="bg-blue-50 border-blue-200 mb-4">
      <Zap className="w-4 h-4 text-blue-600" />
      <AlertTitle>Welcome back! 👋</AlertTitle>
      <AlertDescription>
        You have 3 jobs waiting to be ranked. Get started with a quick demo or jump to your most recent job.
        <div className="mt-3 flex gap-2">
          <Button size="sm">See your jobs</Button>
          <Button size="sm" variant="outline">Watch demo</Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

### Best Practices
- ✓ Show banner only on first return after 7+ day absence
- ✓ Remind of progress ("You have 3 incomplete jobs")
- ✓ Offer warm re-entry (demo, recent items)
- ✓ Don't interrupt: make dismissible
- ✓ Send email 1 day before expected return (push re-engagement)

---

## 11. Role-Based Onboarding

Different flows for different user types (admin, team member, viewer).

### Pattern
```tsx
interface OnboardingConfig {
  role: 'admin' | 'member' | 'viewer';
  steps: Step[];
}

const roleConfigs: Record<string, OnboardingConfig> = {
  admin: {
    role: 'admin',
    steps: [
      { id: 'workspace-setup', title: 'Workspace name & logo' },
      { id: 'team-invite', title: 'Invite team members' },
      { id: 'billing-setup', title: 'Add payment method' },
      { id: 'first-job', title: 'Post your first job' },
      { id: 'integrations', title: 'Connect ATS (optional)' },
    ],
  },
  member: {
    role: 'member',
    steps: [
      { id: 'profile', title: 'Complete your profile' },
      { id: 'permissions', title: 'Set your permissions' },
      { id: 'first-ranking', title: 'Review your first ranking' },
    ],
  },
  viewer: {
    role: 'viewer',
    steps: [
      { id: 'welcome', title: 'Welcome to the project' },
      { id: 'view-results', title: 'View ranking results' },
    ],
  },
};

export function RoleBasedOnboarding({ userRole }) {
  const config = roleConfigs[userRole];
  return <SetupWizard steps={config.steps} />;
}
```

### Best Practices
- ✓ Admin gets: billing, team, integrations, workspace setup
- ✓ Member gets: profile, permissions, familiarization
- ✓ Viewer gets: minimal steps, focus on understanding results
- ✓ Skip irrelevant steps (don't force non-admins through billing)

---

## Dark Mode Implementation

### Color Mapping
- Light card: `bg-white` → Dark: `dark:bg-slate-900`
- Light step indicator: `bg-gray-200` → Dark: `dark:bg-slate-700`
- Light progress bar: `bg-gray-200` → Dark: `dark:bg-slate-700`
- Light text: `text-slate-900` → Dark: `dark:text-slate-50`
- Light input: `bg-white border-gray-300` → Dark: `dark:bg-slate-800 dark:border-slate-600`

### Key Dark Mode Rules for Onboarding
1. **Progress bar**: Use `dark:bg-slate-700` for the track, keep filled portion bright (`bg-blue-600`)
2. **Step indicators**: Make background darker (`dark:bg-slate-700`) and text lighter (`dark:text-slate-50`)
3. **Form inputs**: Ensure good contrast with `dark:bg-slate-800 dark:border-slate-600 dark:text-slate-50`

### Dark Mode Onboarding Example
```tsx
export function DarkModeWizard() {
  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white dark:bg-slate-900 rounded-lg">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Step 2 of 4
          </span>
        </div>
        <Progress
          value={50}
          className="h-2 bg-slate-200 dark:bg-slate-700"
        />
      </div>

      {/* Step Title */}
      <div className="space-y-2 mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Where is this role located?
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Optional, but helps match preferences
        </p>
      </div>

      {/* Form Input */}
      <input
        type="text"
        placeholder="e.g., San Francisco, CA"
        className="w-full px-4 py-2 rounded-lg border bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600 text-slate-900 dark:text-slate-50 placeholder:dark:text-slate-500"
      />
    </div>
  );
}
```

---

## Responsive Behavior

### Breakpoint Strategy
- **Mobile (< 640px)**: Full-screen steps (single column), stacked buttons, swipe or next/back navigation
- **Tablet (640px - 1024px)**: Centered card (max-width 500px), standard button layout
- **Desktop (> 1024px)**: Centered card (max-width 600px), progress indicator prominent

### Key Responsive Rules for Onboarding
1. **Card width**: Full width on mobile (`w-full`), max-width on tablet+ (`max-w-md`) with padding adjustments
2. **Typography**: Smaller on mobile (`text-xl`) → larger on desktop (`text-2xl`) using `sm:text-2xl`
3. **Button layout**: Stacked on mobile, side-by-side on desktop using `flex-col sm:flex-row`
4. **Steps visibility**: Show current step only on mobile, optionally show progress steps on desktop

### Responsive Onboarding Example
```tsx
export function ResponsiveSetupWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md">
        {/* Progress Bar - smaller on mobile */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
              Step {currentStep + 1} of 4
            </span>
          </div>
          <Progress
            value={(currentStep + 1) / 4 * 100}
            className="h-2"
          />
        </div>

        {/* Step Content - responsive typography */}
        <div className="space-y-4 sm:space-y-6 mb-8">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
              What is the job title?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              This helps tailor resume analysis
            </p>
          </div>

          {/* Input field */}
          <input
            type="text"
            placeholder="e.g., Senior Software Engineer"
            className="w-full px-3 sm:px-4 py-2 rounded-lg border bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600"
          />
        </div>

        {/* Buttons - stacked on mobile, row on desktop */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            disabled={currentStep === 0}
            className="sm:flex-1 text-sm sm:text-base"
          >
            Back
          </Button>
          <Button
            className="sm:flex-1 text-sm sm:text-base"
          >
            {currentStep === 3 ? 'Complete' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## References & Further Reading

- [SaaS Onboarding Best Practices 2025](https://www.insaim.design/blog/saas-onboarding-best-practices-for-2025-examples)
- [Onboarding UX Patterns — Userpilot](https://userpilot.medium.com/onboarding-ux-patterns-and-best-practices-in-saas-c46bcc7d562f)
- [Progressive Disclosure in SaaS UX](https://lollypop.design/blog/2025/may/progressive-disclosure/)
- [User Onboarding Checklists Best Practices](https://userpilot.com/blog/user-onboarding-checklist-tips/)
- [Onboarding Checklist Examples](https://www.appcues.com/blog/best-checklist-examples)
- [SaaS Onboarding Examples & Checklist](https://www.candu.ai/blog/best-saas-onboarding-examples-checklist-practices-for-2025)
