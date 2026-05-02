# Authentication Pages: SaaS Design Patterns

Comprehensive patterns for login, signup, password reset, two-factor authentication, and social login flows. Built on research from 2024-2025 best practices and empirical conversion data.

---

## Table of Contents

1. [Login Page Layout](#login-page-layout)
2. [Signup Page](#signup-page)
3. [Social Login Buttons](#social-login-buttons)
4. [Magic Link Flow](#magic-link-flow)
5. [Password UX](#password-ux)
6. [Forgot Password Flow](#forgot-password-flow)
7. [Two-Factor Authentication](#two-factor-authentication)
8. [Email Verification Banner](#email-verification-banner)
9. [Background Patterns & Visual Design](#background-patterns--visual-design)
10. [Split Layout (Desktop)](#split-layout-desktop)
11. [Responsive Design](#responsive-design)
12. [Redirect Logic](#redirect-logic)
13. [Invite & Waitlist Page](#invite--waitlist-page)
14. [Multi-Tenant Workspace Selector](#multi-tenant-workspace-selector)
15. [Component Composition with shadcn/ui](#component-composition-with-shadcnui)
16. [Complete Code Examples](#complete-code-examples)

---

## Login Page Layout

**Core Principle:** Eliminate distractions. Users should see only the login form and nothing else.

### Structure

```
Center Card Container (max-w-sm, mx-auto)
├── CardHeader
│   ├── Logo (48×48px, center)
│   └── "Welcome back" (text-2xl font-bold)
├── CardContent
│   ├── Email/Username Input
│   ├── Password Input
│   ├── "Remember me" Checkbox (optional)
│   └── "Forgot password?" Link (right-align)
└── CardFooter
    ├── "Sign in" Button (full-width)
    └── "Don't have an account? Sign up" Link (center, text-sm)
```

### Key Characteristics

- **Form width:** max-w-sm (384px) on desktop
- **Padding:** px-4 py-6 inside Card
- **Spacing:** gap-4 between form fields
- **Background:** Subtle gradient or pattern (see Visual Design section)
- **Card style:** rounded-lg, border-0, shadow-lg on desktop, shadow-md on mobile

### Research Insights

- Focus on the form only—no navigation, no other links, no hero content
- Pre-fill user profile if they've previously signed in (mobile pattern from YouTube)
- Keep interface "calm, clear, and approachable"
- Offer 2-3 primary authentication methods; tuck secondary methods behind "Other methods" link

### shadcn/ui Implementation

```tsx
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function LoginCard() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="Logo" className="h-12 w-12" />
          </div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <a
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </a>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox id="remember" />
            <Label htmlFor="remember" className="text-sm font-normal">
              Remember me
            </Label>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full">Sign in</Button>
          <div className="text-center text-sm">
            Don't have an account?{" "}
            <a href="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </a>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
```

---

## Signup Page

**Core Principle:** Minimize fields. Every field you remove increases conversion by ~15-20%.

### Best Practice: Email-Only Initial Signup

Modern SaaS trends show the strongest conversion by capturing only email on signup, then collecting profile info (name, company) during onboarding.

### Two-Approach Structure

#### Approach A: Email + Password (Traditional)

```
Card
├── Header: "Create account" + "Already have an account? Sign in"
├── Content
│   ├── Name Input
│   ├── Email Input
│   ├── Password Input (with strength indicator)
│   ├── Password Confirm Input
│   └── Terms/Privacy Notice (text only, NOT checkbox)
└── Footer
    ├── "Create account" Button
    └── Social Login Options (optional)
```

#### Approach B: Email-Only with Magic Link (Recommended)

```
Card
├── Header: "Get started"
├── Content
│   └── Email Input
└── Footer
    ├── "Continue with email" Button
    ├── Divider: "Or continue with"
    └── Social Login Buttons
```

### Field Optimization Data

- **Removing 1 field:** +10-15% conversion
- **Removing 2 fields:** +20-35% conversion
- **Form layout:** Single column converts better than two-column
- **Label alignment:** Labels above fields (left-aligned) reduce cognitive load

### Password Requirements UX

If using password signup, communicate requirements clearly:

```
Password must contain:
✓ At least 8 characters
✓ One uppercase letter
✓ One number
✓ One special character (!@#$%^&*)
```

Show green checkmarks as requirements are met (real-time validation).

### Terms & Privacy Notice

**Do NOT use a checkbox** ("I agree to terms..."). Instead, place plain text below the submit button:

```
By signing up, you agree to our Terms of Service and Privacy Policy.
```

This reduces friction and is legally equivalent.

### shadcn/ui Implementation (Email-Only)

```tsx
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function SignupCard() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="Logo" className="h-12 w-12" />
          </div>
          <h1 className="text-2xl font-bold">Get started</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Already have an account?{" "}
            <a href="/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full">Continue with email</Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="w-full">
              <svg className="mr-2 h-4 w-4" {...} />
              Google
            </Button>
            <Button variant="outline" className="w-full">
              <svg className="mr-2 h-4 w-4" {...} />
              GitHub
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            By signing up, you agree to our{" "}
            <a href="/terms" className="hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="hover:underline">
              Privacy Policy
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
```

---

## Social Login Buttons

**Critical:** Follow official brand guidelines exactly. Providers enforce strict rules on logo usage, colors, padding, and button text.

### Button Specifications

All social buttons should be **full-width** and **44px minimum height** (WCAG touch target).

#### Google

- **Background:** White (#FFFFFF)
- **Text Color:** Dark gray (#3C4043)
- **Border:** 1px solid #DADCE0
- **Icon:** Official Google "G" logo (colorful)
- **Text:** "Continue with Google"
- **Font:** 14px, 500 weight

```tsx
<Button
  variant="outline"
  className="w-full h-11 border-[#DADCE0] bg-white text-[#3C4043] hover:bg-[#F8F9FA]"
>
  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
    {/* Google G logo */}
  </svg>
  Continue with Google
</Button>
```

#### Apple

- **Background:** Black (#000000) for dark mode, white for light mode
- **Text Color:** White (black mode), Black (light mode)
- **Icon:** Official Apple logo
- **Text:** "Continue with Apple"
- **Font:** 14px, 500 weight

```tsx
<Button
  className="w-full h-11 bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100"
>
  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
    {/* Apple logo */}
  </svg>
  Continue with Apple
</Button>
```

#### GitHub

- **Background:** Dark gray (#24292E) or black
- **Text Color:** White
- **Icon:** GitHub Octocat logo
- **Text:** "Continue with GitHub"
- **Font:** 14px, 500 weight

```tsx
<Button className="w-full h-11 bg-gray-900 text-white hover:bg-gray-800">
  <svg className="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
    {/* GitHub Octocat */}
  </svg>
  Continue with GitHub
</Button>
```

#### Microsoft

- **Background:** Light gray or official Microsoft blue
- **Text Color:** Dark gray or white
- **Icon:** Official Microsoft logo
- **Text:** "Continue with Microsoft"

### Personalization: User Preference Detection

If analytics show a returning user previously used Google to sign in, make that button appear **first or visually highlighted**:

```tsx
export function SocialLoginButtons({ preferredProvider }) {
  const providers = [
    { id: "google", label: "Google", color: "#4285F4" },
    { id: "github", label: "GitHub", color: "#24292E" },
    { id: "apple", label: "Apple", color: "#000000" },
  ];

  // Sort with preferred provider first
  const sorted = preferredProvider
    ? [
        providers.find(p => p.id === preferredProvider),
        ...providers.filter(p => p.id !== preferredProvider),
      ]
    : providers;

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((provider) => (
        <Button
          key={provider.id}
          variant={provider.id === preferredProvider ? "default" : "outline"}
          className="w-full h-11"
        >
          {/* Button content */}
        </Button>
      ))}
    </div>
  );
}
```

### Divider Pattern

Standard divider between email and social login:

```tsx
<div className="relative my-6">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t border-border" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-background px-2 text-muted-foreground font-medium">
      Or continue with
    </span>
  </div>
</div>
```

### Research Insights

- Each button needs **44×44px minimum** clickable area (touch device requirement)
- **Visibility is critical**—social buttons must be immediately visible (not below the fold)
- Returning users recognize their previous provider; highlighting it removes friction
- Button order matters—put most-used providers first

---

## Magic Link Flow

**Core Pattern:** Email → Confirmation screen → Email verification → Auto-redirect → Success

### Step 1: Email Input

```tsx
<Card>
  <CardHeader>
    <h1 className="text-2xl font-bold">Sign in to the project</h1>
    <p className="text-sm text-muted-foreground mt-2">
      Enter your email and we'll send you a magic link
    </p>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
      />
    </div>
  </CardContent>
  <CardFooter>
    <Button className="w-full">Send magic link</Button>
  </CardFooter>
</Card>
```

### Step 2: Confirmation Screen

After email submission, show:

```tsx
<Card className="w-full max-w-sm">
  <CardHeader className="text-center">
    <div className="flex justify-center mb-4">
      <Mail className="h-12 w-12 text-primary" />
    </div>
    <h1 className="text-2xl font-bold">Check your inbox</h1>
    <p className="text-sm text-muted-foreground mt-2">
      We've sent a magic link to <strong>you@example.com</strong>
    </p>
  </CardHeader>

  <CardContent className="space-y-4">
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        The link expires in <strong>15 minutes</strong>. Check your spam folder
        if you don't see it.
      </AlertDescription>
    </Alert>
  </CardContent>

  <CardFooter className="flex flex-col gap-3">
    <div className="text-center text-sm">
      Didn't receive it?{" "}
      <Button variant="link" className="p-0">
        Resend link
      </Button>
    </div>
    <Button variant="outline" className="w-full">
      Try different email
    </Button>
  </CardFooter>
</Card>
```

### Step 3: Token Verification

**Best Practice Token Expiration:** 15 minutes

When user clicks link:
1. Extract token from URL
2. Verify token (not expired, not used)
3. If valid: immediately sign in user
4. If invalid/expired: show error + resend option

```tsx
export async function verifyMagicLink(token: string) {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token,
      type: "email",
    });

    if (error) throw error;

    // Auto-redirect
    window.location.href = "/dashboard";
  } catch (err) {
    // Show error: "Link expired or invalid. Resend link?"
  }
}
```

### Step 4: Auto-Redirect & Success Toast

```tsx
useEffect(() => {
  const hash = window.location.hash;
  if (hash.includes("access_token")) {
    // Token in URL, already signed in
    toast.success("Signed in successfully!");
    navigate("/dashboard");
  }
}, []);
```

### Research Insights

- **Token expiration:** 15-30 minutes is industry standard (most common: 15 min)
- **Email clarity:** Ensure email template clearly shows it's a magic link (pre-authenticated)
- **Mobile responsive:** Link must work on all devices
- **Tracking metrics:** Monitor % of links clicked within 5/15/60 minutes to detect delivery issues
- **User warnings:** Tell users the link is pre-authenticated (don't forward)

---

## Password UX

### Show/Hide Toggle

```tsx
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordInput() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor="password">Password</Label>
      <div className="relative">
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
```

### Password Strength Indicator

**4-segment strength meter:** Weak → Fair → Good → Strong

```tsx
import { useState } from "react";

const strengthLevels = [
  { label: "Weak", color: "#EF4444", minScore: 0 },
  { label: "Fair", color: "#F97316", minScore: 2 },
  { label: "Good", color: "#EAAA08", minScore: 3 },
  { label: "Strong", color: "#22C55E", minScore: 4 },
];

export function PasswordStrengthMeter({ password }: { password: string }) {
  const score = calculatePasswordStrength(password);
  const level = strengthLevels.find(l => score >= l.minScore) || strengthLevels[0];

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < score ? `bg-[${level.color}]` : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span style={{ color: level.color }} className="font-semibold">{level.label}</span>
      </p>
    </div>
  );
}

function calculatePasswordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++; // 8+ chars
  if (/[A-Z]/.test(password)) score++; // Has uppercase
  if (/[0-9]/.test(password)) score++; // Has number
  if (/[!@#$%^&*]/.test(password)) score++; // Has special char
  return score;
}
```

### Real-Time Validation Hints

```tsx
export function PasswordRequirements({ password }: { password: string }) {
  const requirements = [
    { text: "At least 8 characters", met: password.length >= 8 },
    { text: "One uppercase letter", met: /[A-Z]/.test(password) },
    { text: "One number", met: /[0-9]/.test(password) },
    { text: "One special character (!@#$%^&*)", met: /[!@#$%^&*]/.test(password) },
  ];

  return (
    <div className="space-y-2 text-sm">
      {requirements.map((req, i) => (
        <div key={i} className="flex items-center gap-2">
          {req.met ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <X className="h-4 w-4 text-gray-300" />
          )}
          <span className={req.met ? "text-foreground" : "text-muted-foreground"}>
            {req.text}
          </span>
        </div>
      ))}
    </div>
  );
}
```

---

## Forgot Password Flow

### Step 1: Email Entry

```tsx
<Card className="w-full max-w-sm">
  <CardHeader className="text-center">
    <h1 className="text-2xl font-bold">Reset password</h1>
    <p className="text-sm text-muted-foreground mt-2">
      Enter your email and we'll send you a link to reset it
    </p>
  </CardHeader>

  <CardContent className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input
      id="email"
      type="email"
      placeholder="you@example.com"
      autoComplete="email"
    />
  </CardContent>

  <CardFooter className="flex flex-col gap-3">
    <Button className="w-full">Send reset link</Button>
    <Button variant="outline" className="w-full">
      Back to sign in
    </Button>
  </CardFooter>
</Card>
```

### Step 2: Confirmation

Same as magic link confirmation (check inbox screen).

### Step 3: Reset Form

When user clicks reset link, show password entry form:

```tsx
<Card className="w-full max-w-sm">
  <CardHeader className="text-center">
    <h1 className="text-2xl font-bold">Create new password</h1>
  </CardHeader>

  <CardContent className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="password">New password</Label>
      <PasswordInput id="password" />
    </div>
    <div className="space-y-2">
      <Label htmlFor="confirm">Confirm password</Label>
      <Input
        id="confirm"
        type="password"
        placeholder="••••••••"
      />
    </div>
    <PasswordRequirements password={password} />
  </CardContent>

  <CardFooter>
    <Button className="w-full">Reset password</Button>
  </CardFooter>
</Card>
```

### Step 4: Success

```tsx
<Card className="w-full max-w-sm">
  <CardHeader className="text-center">
    <div className="flex justify-center mb-4">
      <CheckCircle className="h-12 w-12 text-green-600" />
    </div>
    <h1 className="text-2xl font-bold">Password reset</h1>
    <p className="text-sm text-muted-foreground mt-2">
      Your password has been successfully reset
    </p>
  </CardHeader>

  <CardFooter>
    <Button className="w-full" onClick={() => navigate("/login")}>
      Back to sign in
    </Button>
  </CardFooter>
</Card>
```

---

## Two-Factor Authentication

### Setup Flow

**Step 1: Choose Method**

```tsx
<Card>
  <CardHeader>
    <h1 className="text-2xl font-bold">Two-factor authentication</h1>
    <p className="text-sm text-muted-foreground mt-2">
      Add extra security to your account
    </p>
  </CardHeader>

  <CardContent className="space-y-3">
    {[
      { id: "sms", label: "Text message (SMS)", icon: MessageSquare },
      { id: "email", label: "Email", icon: Mail },
      { id: "totp", label: "Authenticator app", icon: Lock },
    ].map((method) => (
      <Button
        key={method.id}
        variant="outline"
        className="w-full justify-start h-auto p-4"
      >
        <method.icon className="mr-3 h-5 w-5" />
        <div className="text-left">
          <p className="font-medium">{method.label}</p>
          <p className="text-xs text-muted-foreground">
            {method.id === "sms" && "Receive codes via text"}
            {method.id === "email" && "Receive codes via email"}
            {method.id === "totp" && "Use an authenticator app (more secure)"}
          </p>
        </div>
      </Button>
    ))}
  </CardContent>
</Card>
```

**Step 2: Verification**

For SMS/email, show OTP input:

```tsx
export function OTPInput() {
  const [otp, setOtp] = useState("");

  return (
    <div className="space-y-4">
      <Label htmlFor="otp">Enter the code from your authenticator app</Label>
      <Input
        id="otp"
        type="text"
        inputMode="numeric"
        placeholder="000000"
        maxLength={6}
        value={otp}
        onChange={(e) => {
          const val = e.target.value.replace(/[^0-9]/g, "");
          setOtp(val);
          // Auto-submit when 6 digits entered
          if (val.length === 6) handleSubmit(val);
        }}
        autoComplete="one-time-code"
        className="text-center text-2xl tracking-widest font-mono"
      />
      <p className="text-xs text-muted-foreground text-center">
        {6 - otp.length} characters remaining
      </p>
    </div>
  );
}
```

**Key UX Patterns:**

- **Input type:** Use `type="text" inputMode="numeric"` (not `type="number"`)
- **Auto-submit:** Submit form when 6 digits entered
- **Auto-fill:** Set `autoComplete="one-time-code"` for OS-level OTP population
- **Character counter:** Show "5 remaining" to guide user
- **Error message:** "Invalid code. Try again or request a new one."

**Step 3: Backup Codes**

After successful 2FA setup, generate and display backup codes:

```tsx
<Alert variant="destructive">
  <AlertTriangle className="h-4 w-4" />
  <AlertDescription>
    Save these codes in a safe place. You can use them if you lose access to your
    authenticator device.
  </AlertDescription>
</Alert>

<div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-2">
  {backupCodes.map((code, i) => (
    <div key={i} className="flex justify-between">
      <span>{code.substring(0, 4)}</span>
      <span>{code.substring(4)}</span>
    </div>
  ))}
</div>

<Button variant="outline" className="w-full">
  <Download className="mr-2 h-4 w-4" />
  Download codes
</Button>
```

### Login with 2FA

```tsx
<Card>
  <CardHeader>
    <h1 className="text-2xl font-bold">Verify it's you</h1>
    <p className="text-sm text-muted-foreground mt-2">
      Enter the code from your authenticator app
    </p>
  </CardHeader>

  <CardContent>
    <OTPInput />
  </CardContent>

  <CardFooter className="flex flex-col gap-2">
    <Button className="w-full">Verify</Button>
    <Button variant="link" className="w-full">
      Can't access your authenticator? Use a backup code
    </Button>
  </CardFooter>
</Card>
```

### Research Insights

- **Support multiple methods:** SMS, email, TOTP, biometric—not everyone has the same devices
- **Step-by-step clarity:** One action per screen
- **Technical explanations:** Describe Google Authenticator when users select it
- **Step-up authentication:** Low-security actions (view basic info) don't need 2FA; sensitive actions (change password, access billing) do

---

## Email Verification Banner

### Display Pattern

Show a persistent banner at the top of the app until email is verified.

```tsx
import { AlertCircle, X } from "lucide-react";
import { useState } from "react";

export function EmailVerificationBanner({ email, onDismiss }: Props) {
  const [show, setShow] = useState(true);

  if (!show) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              Please verify your email to unlock all features
            </p>
            <p className="text-amber-800 mt-1">
              Check <strong>{email}</strong> for a verification link.{" "}
              <Button variant="link" className="p-0 text-amber-700 hover:text-amber-800">
                Resend link
              </Button>
              {" or "}
              <Button variant="link" className="p-0 text-amber-700 hover:text-amber-800">
                change email
              </Button>
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShow(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
```

### Auto-Verification Check

```tsx
useEffect(() => {
  // Check on window focus
  const handleFocus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email_confirmed_at) {
      setEmailVerified(true);
      toast.success("Email verified!");
    }
  };

  window.addEventListener("focus", handleFocus);
  return () => window.removeEventListener("focus", handleFocus);
}, []);
```

### Research Insights

- **Persistent but dismissible:** Shows until verified, can be closed (appears next day)
- **Auto-check on focus:** When user returns from email client, re-verify status
- **Not blocking:** Users can still access app, just with limited features

---

## Background Patterns & Visual Design

### Gradient Background Options

#### Subtle Mesh Gradient

```tsx
<div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
  {/* Content */}
</div>
```

#### Animated Gradient (Optional)

```css
@keyframes gradient-shift {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.gradient-bg {
  background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
  background-size: 400% 400%;
  animation: gradient-shift 15s ease infinite;
}
```

#### Grid Pattern

```tsx
<div className="min-h-screen bg-background relative">
  <div className="absolute inset-0 bg-grid-pattern opacity-5" />
  {/* Content */}
</div>
```

#### Glassmorphism Card Option

```tsx
<div className="backdrop-blur-md bg-white/10 rounded-lg border border-white/20 shadow-xl">
  {/* Content */}
</div>
```

### Recommended: Simple Gradient

For production SaaS, keep it simple:

```tsx
<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4">
  {/* Card with shadow */}
</div>
```

---

## Split Layout (Desktop)

Desktop-only pattern: left side (value prop) + right side (form).

```tsx
export function LoginSplitLayout() {
  return (
    <div className="grid lg:grid-cols-2 min-h-screen">
      {/* Left: Value Prop & Testimonial */}
      <div className="hidden lg:flex flex-col justify-center px-12 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="max-w-md">
          <h2 className="text-4xl font-bold mb-6">
            Rank hundreds of resumes in seconds
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Let AI do the hard work. Score, rank, and interview the best candidates
            automatically.
          </p>

          <div className="space-y-4">
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <span>Resume scoring with AI</span>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <span>Instant ranking</span>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
              <span>Export & interview notes</span>
            </div>
          </div>

          {/* Testimonial */}
          <div className="mt-12 pt-8 border-t">
            <p className="italic mb-3">
              "Saved us 20 hours a week on resume screening. Incredible."
            </p>
            <p className="font-semibold text-sm">Sarah Chen</p>
            <p className="text-xs text-muted-foreground">Founder, TechStaff Inc.</p>
          </div>
        </div>
      </div>

      {/* Right: Auth Form */}
      <div className="flex items-center justify-center px-4">
        <LoginCard />
      </div>
    </div>
  );
}
```

**Responsive Behavior:**

- **Desktop (lg):** 50/50 split, left side visible
- **Tablet/Mobile:** Right side only, full width

---

## Responsive Design

### Mobile-First Approach

```tsx
export function ResponsiveAuthLayout() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Mobile: Full width, padding */}
      {/* Desktop: Split layout */}
    </div>
  );
}
```

### Key Mobile Patterns

1. **Form width:** `max-w-sm` centered, `px-4` padding
2. **Spacing:** `gap-4` between fields (larger on mobile)
3. **Touch targets:** All buttons `h-11` or taller (min 44px)
4. **No horizontal scroll:** All content fits in viewport
5. **Reduced distractions:** Hero section, testimonials hidden on mobile

### Mobile Input Optimization

```tsx
<Input
  type="email"
  inputMode="email"
  autoComplete="email"
  spellCheck="false"
/>

<Input
  type="password"
  autoComplete="current-password"
/>

<Input
  type="text"
  inputMode="numeric"
  placeholder="000000"
  autoComplete="one-time-code"
  // For OTP inputs
/>
```

---

## Redirect Logic

### Pre-Login Redirect Storage

Store the intended URL before redirecting to login:

```tsx
// Before redirecting to login
sessionStorage.setItem("intendedUrl", location.pathname);
navigate("/login");
```

### Post-Login Redirect

After successful authentication, check for stored URL:

```tsx
const handleLoginSuccess = async () => {
  const intendedUrl = sessionStorage.getItem("intendedUrl");
  sessionStorage.removeItem("intendedUrl");

  navigate(intendedUrl || "/dashboard");
};
```

### Protected Route Pattern

```tsx
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

export function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <SkeletonPage />;
  if (!user) {
    // Store intended URL
    sessionStorage.setItem("intendedUrl", location.pathname);
    return <Navigate to="/login" />;
  }

  return children;
}
```

---

## Invite & Waitlist Page

### Invite Link Handler

```tsx
export function InviteSignup({ token }: { token: string }) {
  const [status, setStatus] = useState<"initial" | "submitted" | "verified">("initial");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br px-4">
      {status === "initial" && (
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Gift className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">You're invited!</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Join thousands of recruiters already using the project
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <Input type="email" placeholder="you@example.com" />
            <Input type="text" placeholder="Your name" />
          </CardContent>

          <CardFooter>
            <Button className="w-full" onClick={() => setStatus("submitted")}>
              Claim your spot
            </Button>
          </CardFooter>
        </Card>
      )}

      {status === "submitted" && (
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">You're on the list</h1>
            <p className="text-sm text-muted-foreground mt-2">
              We'll send you access details soon
            </p>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
```

### Waitlist Position Tracker

```tsx
<Card>
  <CardContent className="pt-6">
    <div className="text-center">
      <p className="text-4xl font-bold text-primary">#4,287</p>
      <p className="text-sm text-muted-foreground mt-2">
        in line for early access
      </p>
    </div>
    <Progress value={45} className="mt-4" />
    <p className="text-xs text-muted-foreground text-center mt-2">
      ~200 spots available
    </p>
  </CardContent>
</Card>
```

---

## Multi-Tenant Workspace Selector

For users who belong to multiple organizations:

```tsx
export function WorkspaceSelector() {
  const [workspaces, setWorkspaces] = useState([]);
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center text-sm font-bold">
              TR
            </div>
            <span>TechStaff Inc.</span>
          </div>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} onClick={() => switchWorkspace(ws.id)}>
            <div className="flex items-center gap-2 flex-1">
              <div className="h-6 w-6 rounded bg-muted text-xs flex items-center justify-center font-bold">
                {ws.name.substring(0, 1)}
              </div>
              <span>{ws.name}</span>
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem>Create workspace</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## Component Composition with shadcn/ui

### Required Components

- **Card** — Main container
- **Input** — Text, email, password fields
- **Button** — Primary, secondary, outline variants
- **Label** — Field labels
- **Checkbox** — Checkbox input
- **Separator** — Dividers
- **Alert / AlertDescription** — Error/warning messages
- **DropdownMenu** — Auth menu, workspace selector
- **Dialog / AlertDialog** — Modals

### Import Pattern

```tsx
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
```

### Styling Classes

Always use Tailwind utilities:

```tsx
// Center form
<div className="flex min-h-screen items-center justify-center">

// Form spacing
<div className="space-y-4">

// Button sizing
<Button className="w-full h-11">

// Text hierarchy
<h1 className="text-2xl font-bold">
<p className="text-sm text-muted-foreground">
```

---

## Complete Code Examples

### Example 1: Full Login Page

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Call auth API
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error("Invalid email or password");
      }

      // Redirect
      const intendedUrl = sessionStorage.getItem("intendedUrl") || "/dashboard";
      sessionStorage.removeItem("intendedUrl");
      navigate(intendedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="the project" className="h-12 w-12" />
          </div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to your account
          </p>
        </CardHeader>

        <CardContent className="space-y-4" asChild>
          <form onSubmit={handleSubmit}>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="remember" />
              <Label htmlFor="remember" className="text-sm font-normal">
                Remember me
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <div className="text-center text-sm">
            Don't have an account?{" "}
            <a href="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </a>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
```

### Example 2: Signup with Social Login

```tsx
import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Mail, Github } from "lucide-react";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Handle signup
  };

  const handleOAuth = (provider: "google" | "github") => {
    // Redirect to OAuth provider
    window.location.href = `/api/auth/${provider}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="the project" className="h-12 w-12" />
          </div>
          <h1 className="text-2xl font-bold">Get started</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create your account in seconds
          </p>
        </CardHeader>

        <CardContent className="space-y-4" asChild>
          <form onSubmit={handleEmailSignup}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Continue with email"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground font-medium">
                Or continue with
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => handleOAuth("google")}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                {/* Google logo */}
              </svg>
              Google
            </Button>
            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => handleOAuth("github")}
            >
              <Github className="mr-2 h-4 w-4" />
              GitHub
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            By signing up, you agree to our{" "}
            <a href="/terms" className="hover:underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="hover:underline">
              Privacy Policy
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
```

---

## Responsive Design

### Breakpoint Behavior

- **sm (640px):** Full-width form, no illustration, social buttons stack vertically
- **md (768px):** Split layout begins, illustration appears but reduced width
- **lg (1024px):** Full split layout (50/50), horizontal social buttons
- **xl (1280px):** Wider illustration area, centered form

### Layout Transformations

**Split Layout: Hide Illustration on Mobile:**
```tsx
{/* Desktop: 50/50 split */}
<div className="min-h-screen flex">
  <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-900 flex-col justify-center px-12">
    {/* Illustration/Marketing content */}
  </div>
  <div className="w-full lg:w-1/2 flex items-center justify-center p-4 md:p-6">
    {/* Form */}
  </div>
</div>

{/* Mobile: Full-width form only */}
```

**Social Login: Horizontal → Vertical:**
```tsx
{/* Desktop: 2 columns */}
<div className="grid grid-cols-2 gap-3">
  <Button>Google</Button>
  <Button>GitHub</Button>
</div>

{/* Mobile: Stacked vertically */}
<div className="md:hidden space-y-2">
  <Button className="w-full h-11">Google</Button>
  <Button className="w-full h-11">GitHub</Button>
</div>
```

**OAuth Consent: Modal → Bottom Sheet:**
```tsx
{/* Desktop: Modal dialog */}
<div className="hidden md:block">
  <AlertDialog open={showConsent}>
    {/* OAuth flow consent dialog */}
  </AlertDialog>
</div>

{/* Mobile: Bottom sheet for easier interaction */}
<Sheet open={showConsent}>
  <SheetContent side="bottom" className="h-96">
    {/* OAuth consent with larger targets */}
  </SheetContent>
</Sheet>
```

**Password Requirements: Inline → Collapsible:**
```tsx
{/* Desktop: Always visible checklist */}
<div className="hidden md:block space-y-2 mt-4">
  <p className="text-sm text-gray-600">Password must contain:</p>
  <ul className="text-xs space-y-1">
    <li className={upperCase ? 'text-green-600' : 'text-gray-500'}>At least one uppercase letter</li>
    <li className={hasNumber ? 'text-green-600' : 'text-gray-500'}>At least one number</li>
  </ul>
</div>

{/* Mobile: Collapsible accordion */}
<Collapsible open={showRequirements} onOpenChange={setShowRequirements}>
  <CollapsibleTrigger className="text-sm md:hidden">
    Password requirements
  </CollapsibleTrigger>
  <CollapsibleContent>
    {/* Checklist */}
  </CollapsibleContent>
</Collapsible>
```

### Touch Targets

- **Form inputs:** 44px height on mobile (not 40px)
- **Social buttons:** 44x44px minimum, full-width on mobile
- **Links:** 44px tap area including text
- **Checkboxes:** 44x44px inclusive touch area
- **Password toggle:** 44px icon button minimum

### Code Example

```tsx
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

export const ResponsiveAuthPage = () => {
  const isMobile = useIsMobile();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasMinLength = password.length >= 8;

  return (
    <div className="min-h-screen flex bg-white dark:bg-background">
      {/* Desktop Only: Left Illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-900 flex-col justify-center px-8 md:px-12">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-bold text-white">Welcome</h1>
            <p className="text-lg text-blue-100">
              AI-powered resume screening in minutes
            </p>
          </div>
          <ul className="space-y-3 text-blue-100 text-sm">
            <li>✓ Screen 100s of resumes</li>
            <li>✓ AI-powered ranking</li>
            <li>✓ Instant insights</li>
          </ul>
        </div>
      </div>

      {/* Form Area: Responsive width and padding */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 md:p-6 lg:p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Logo */}
          <div className="flex justify-center lg:hidden mb-4">
            <Logo className="h-8 w-8" />
          </div>

          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl font-bold">Create account</h2>
            <p className="text-sm md:text-base text-gray-600">
              Get started in seconds
            </p>
          </div>

          {/* Email Input: 44px on mobile */}
          <div className="space-y-2">
            <Label className="text-sm md:text-base font-medium">Email</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              className="h-10 md:h-11 text-base"
            />
          </div>

          {/* Password Input with toggle */}
          <div className="space-y-2">
            <Label className="text-sm md:text-base font-medium">Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 md:h-11 text-base pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Desktop: Password requirements always visible */}
          <div className="hidden md:block space-y-2 text-sm bg-gray-50 p-4 rounded-lg">
            <p className="font-medium text-gray-900">Password must contain:</p>
            <ul className="space-y-1">
              <li className={`text-sm ${hasUpper ? 'text-green-600' : 'text-gray-500'}`}>
                ✓ At least one uppercase letter
              </li>
              <li className={`text-sm ${hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                ✓ At least one number
              </li>
              <li className={`text-sm ${hasMinLength ? 'text-green-600' : 'text-gray-500'}`}>
                ✓ At least 8 characters
              </li>
            </ul>
          </div>

          {/* Mobile: Collapsible password requirements */}
          <Collapsible open={showRequirements} onOpenChange={setShowRequirements} className="md:hidden">
            <CollapsibleTrigger className="text-sm text-blue-600 hover:underline">
              {showRequirements ? 'Hide' : 'Show'} password requirements
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 text-sm bg-gray-50 p-3 rounded mt-2">
              <ul className="space-y-1">
                <li className={hasUpper ? 'text-green-600' : 'text-gray-500'}>
                  ✓ Uppercase letter
                </li>
                <li className={hasNumber ? 'text-green-600' : 'text-gray-500'}>
                  ✓ Number
                </li>
                <li className={hasMinLength ? 'text-green-600' : 'text-gray-500'}>
                  ✓ 8+ characters
                </li>
              </ul>
            </CollapsibleContent>
          </Collapsible>

          {/* Submit Button */}
          <Button className="w-full h-11 md:h-10 text-base md:text-sm">
            Create account
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase bg-white px-2">
              <span className="text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Social Buttons: 2-col on desktop, stacked on mobile */}
          <div className="hidden md:grid md:grid-cols-2 md:gap-3">
            <Button variant="outline" className="h-10">
              <Google className="w-4 h-4 mr-2" />
              Google
            </Button>
            <Button variant="outline" className="h-10">
              <Github className="w-4 h-4 mr-2" />
              GitHub
            </Button>
          </div>

          {/* Mobile: Stacked buttons, full-width */}
          <div className="md:hidden space-y-2">
            <Button variant="outline" className="w-full h-11">
              <Google className="w-4 h-4 mr-2" />
              Google
            </Button>
            <Button variant="outline" className="w-full h-11">
              <Github className="w-4 h-4 mr-2" />
              GitHub
            </Button>
          </div>

          {/* Footer Links */}
          <p className="text-center text-xs md:text-sm text-gray-600">
            Already have an account?{' '}
            <a href="/login" className="text-blue-600 hover:underline font-medium">
              Sign in
            </a>
          </p>
          <p className="text-center text-xs text-gray-500">
            By signing up, you agree to our{' '}
            <a href="/terms" className="hover:underline">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy" className="hover:underline">
              Privacy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
```

### Mobile-Specific Considerations

- **Form padding:** p-4 on mobile, p-6-8 on desktop
- **Illustration:** Hidden on sm/md, appears on lg+
- **Social buttons:** Stack vertically on mobile, full-width (h-11)
- **Inputs:** 44px height on mobile to avoid iOS zoom
- **Password requirements:** Collapsible on mobile, always visible on desktop
- **Link sizes:** Ensure 44px tap target for "Sign up" / "Sign in" links
- **Card width:** max-w-md container keeps form readable on all screens

---

## Dark Mode

Authentication pages benefit from dark mode for users signing in during late hours. Key focus: maintaining contrast on form inputs, ensuring social buttons remain distinct, and ensuring links/dividers are visible.

### CSS Variable Mapping

**Light Mode (default):**
```css
--background: 0 0% 100%        /* Page background, split layout */
--foreground: 0 0% 3.6%        /* Text, labels */
--card: 0 0% 100%              /* Card backgrounds */
--border: 0 0% 89.8%           /* Form borders, dividers */
--input: 0 0% 89.8%            /* Input backgrounds */
--muted-foreground: 0 0% 45.1% /* Helper text, placeholders */
--destructive: 0 84.2% 60.2%   /* Error states */
```

**Dark Mode:**
```css
--background: 0 0% 3.6%        /* Near black */
--foreground: 0 0% 98%         /* Off white text */
--card: 0 0% 8%                /* Slightly lighter than background */
--border: 0 0% 20%             /* Subtle dark borders */
--input: 0 0% 14.9%            /* Dark input field */
--muted-foreground: 0 0% 63.9% /* Lighter secondary text */
--destructive: 0 84.2% 60.2%   /* Red consistent */
```

### Component-Level Overrides

#### Split Layout (Left Text, Right Form)

```tsx
<div className="min-h-screen flex dark:bg-background">
  {/* Left side */}
  <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-900 dark:from-blue-950 dark:to-blue-900 flex-col justify-center px-8">
    <div className="space-y-4">
      <h1 className="text-4xl font-bold dark:text-white">Welcome back</h1>
      <p className="text-lg dark:text-blue-100">Sign in to your account to continue</p>
    </div>
  </div>

  {/* Right side - form */}
  <div className="w-full lg:w-1/2 flex items-center justify-center dark:bg-background p-6">
    {/* Form goes here */}
  </div>
</div>
```

#### Email Input Field

```tsx
<div className="space-y-2">
  <Label htmlFor="email" className="dark:text-foreground">
    Email address
  </Label>
  <Input
    id="email"
    type="email"
    placeholder="you@example.com"
    className={cn(
      'dark:bg-input dark:border-border dark:text-foreground',
      'dark:placeholder:text-muted-foreground',
      'dark:focus:ring-ring dark:focus:ring-2'
    )}
  />
</div>
```

#### Password Visibility Toggle

```tsx
<div className="space-y-2">
  <Label htmlFor="password" className="dark:text-foreground">
    Password
  </Label>
  <div className="relative">
    <Input
      id="password"
      type={showPassword ? 'text' : 'password'}
      placeholder="••••••••"
      className={cn(
        'dark:bg-input dark:border-border dark:text-foreground',
        'dark:placeholder:text-muted-foreground',
        'dark:focus:ring-ring dark:focus:ring-2 pr-10'
      )}
    />
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="absolute right-2 top-1/2 -translate-y-1/2 dark:text-muted-foreground dark:hover:text-foreground"
      onClick={() => setShowPassword(!showPassword)}
    >
      {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
    </Button>
  </div>
</div>
```

#### Magic Link Card

```tsx
<Card className="w-full max-w-sm dark:bg-card dark:border-border">
  <CardHeader className="text-center">
    <div className="flex justify-center mb-4">
      <Mail className="h-12 w-12 dark:text-foreground" />
    </div>
    <h1 className="text-2xl font-bold dark:text-foreground">Check your inbox</h1>
    <p className="text-sm dark:text-muted-foreground mt-2">
      We've sent a magic link to <strong className="dark:text-foreground">you@example.com</strong>
    </p>
  </CardHeader>
  <CardContent className="space-y-4">
    <Alert className="dark:bg-blue-950/30 dark:border-blue-800">
      <AlertCircle className="h-4 w-4 dark:text-blue-400" />
      <AlertDescription className="dark:text-blue-300">
        The link expires in <strong>15 minutes</strong>
      </AlertDescription>
    </Alert>
  </CardContent>
</Card>
```

#### Social Login Buttons

```tsx
<div className="grid grid-cols-2 gap-3">
  <Button
    variant="outline"
    className="dark:bg-muted dark:border-border dark:text-foreground dark:hover:bg-border"
    onClick={() => handleOAuth('google')}
  >
    <Google className="mr-2 h-4 w-4" />
    Google
  </Button>
  <Button
    variant="outline"
    className="dark:bg-muted dark:border-border dark:text-foreground dark:hover:bg-border"
    onClick={() => handleOAuth('github')}
  >
    <Github className="mr-2 h-4 w-4" />
    GitHub
  </Button>
</div>
```

#### Divider with "Or Continue With"

```tsx
<div className="relative my-6">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t dark:border-border" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-background dark:bg-background px-2 dark:text-muted-foreground font-medium">
      Or continue with
    </span>
  </div>
</div>
```

#### Sign In/Sign Up Links

```tsx
<p className="text-center text-xs dark:text-muted-foreground">
  Don't have an account?{' '}
  <a href="/signup" className="text-primary dark:text-primary hover:underline font-medium">
    Sign up
  </a>
</p>
```

#### Brand Logo Handling

```tsx
<div className="flex justify-center mb-8">
  {isDark ? (
    <Logo variant="dark" className="h-8" />
  ) : (
    <Logo variant="light" className="h-8" />
  )}
</div>
```

### Common Dark Mode Mistakes in Auth Pages

1. **Divider lines invisible:** The "Or continue with" divider must use `dark:border-border`. Pure gray borders disappear on dark backgrounds.
2. **Social buttons indistinct:** Don't rely on color alone. Ensure social buttons have visible borders in dark mode (`dark:border-border`).
3. **Brand logo hard to see:** If logo is a colorful graphic, it may lose visibility. Provide a light version for dark mode using a `variant` prop.
4. **Input focus ring missing:** Always set `dark:focus:ring-ring` which is a lighter color for dark mode.
5. **Email input placeholder text invisible:** Use `dark:placeholder:text-muted-foreground` to ensure placeholders have sufficient contrast.
6. **Link colors too subtle:** Sign up/login toggle links need `dark:text-primary` to stand out from secondary text.
7. **Alert/confirmation backgrounds clash:** Magic link confirmation cards need explicit `dark:bg-card` and `dark:border-border`.
8. **Password toggle button hard to click:** Ensure toggle button is visible with `dark:text-muted-foreground dark:hover:text-foreground`.

### Code Example: Complete Dark Mode Auth Page

```tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DarkModeAuthPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isDark] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLinkSent(true);
  };

  if (magicLinkSent) {
    return (
      <div className="min-h-screen bg-background dark:bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm dark:bg-card dark:border-border">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <Mail className="h-12 w-12 dark:text-foreground text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold dark:text-foreground">Check your inbox</h1>
            <p className="text-sm dark:text-muted-foreground mt-2">
              We've sent a magic link to <strong className="dark:text-foreground">{email}</strong>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="dark:bg-blue-950/30 dark:border-blue-800">
              <AlertCircle className="h-4 w-4 dark:text-blue-400" />
              <AlertDescription className="dark:text-blue-300">
                Link expires in 15 minutes. Check spam folder if not found.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="w-full dark:bg-muted dark:border-border dark:text-foreground"
              onClick={() => setMagicLinkSent(false)}
            >
              Try different email
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex dark:bg-background">
      {/* Left Gradient */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-900 dark:from-blue-950 dark:to-slate-900 flex-col justify-center px-12">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-white">the project</h1>
          <p className="text-xl text-blue-100 dark:text-blue-300">
            AI-powered resume screening in minutes
          </p>
        </div>
      </div>

      {/* Right Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center dark:bg-background p-6">
        <Card className="w-full max-w-md dark:bg-card dark:border-border">
          <CardHeader className="space-y-2 pb-6">
            <h2 className="text-2xl font-bold dark:text-foreground">Sign in</h2>
            <p className="text-sm dark:text-muted-foreground">
              Enter your email and we'll send you a magic link
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="dark:text-foreground">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(
                    'dark:bg-input dark:border-border dark:text-foreground',
                    'dark:placeholder:text-muted-foreground dark:focus:ring-ring'
                  )}
                  required
                />
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t dark:border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-card px-2 dark:text-muted-foreground font-medium">
                    Or continue with
                  </span>
                </div>
              </div>

              {/* Social Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  type="button"
                  className="dark:bg-muted dark:border-border dark:text-foreground dark:hover:bg-border"
                >
                  Google
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  className="dark:bg-muted dark:border-border dark:text-foreground dark:hover:bg-border"
                >
                  GitHub
                </Button>
              </div>

              {/* Submit Button */}
              <Button type="submit" className="w-full mt-4">
                Send magic link
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-4">
            <p className="text-center text-xs dark:text-muted-foreground">
              Don't have an account?{' '}
              <a href="/signup" className="text-primary dark:text-primary hover:underline font-medium">
                Sign up
              </a>
            </p>
            <p className="text-center text-xs dark:text-muted-foreground">
              By signing in, you agree to our{' '}
              <a href="/terms" className="hover:underline">
                Terms
              </a>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
```

---

## References

Based on research from 2024-2025 industry standards:

- [Discover the Best SaaS Login Page Design - UI Examples](https://saaswebsites.com/page-categories/login-form-page/)
- [55 SaaS Login Design Examples in 2025](https://www.saasframe.io/categories/login)
- [50+ login page examples for SaaS designers](https://www.eleken.co/blog-posts/login-page-examples)
- [Best Sign Up Flows (2026): 15 UX Examples That Convert](https://www.eleken.co/blog-posts/sign-up-flow)
- [Login & Signup UX: The 2025 Guide to Best Practices](https://www.authgear.com/post/login-signup-ux-guide)
- [Clerk authentication components documentation](https://clerk.com/)
- [How to use magic links for better UX - LogRocket](https://blog.logrocket.com/ux-design/how-to-use-magic-links/)
- [The beginner's guide to magic links](https://postmarkapp.com/blog/magic-links)
- [Social Login Button Design Guidelines](https://medium.com/@sabarivasan/designing-with-social-login-buttons-the-right-way-a-deep-dive-into-idp-guidelines-618742589c85)
- [Multi-factor authentication design: Security meets usability](https://blog.logrocket.com/ux-design/authentication-ui-ux/)
- [2FA UX patterns: Designing setup flows](https://blog.logrocket.com/ux-design/2fa-user-flow-best-practices/)
