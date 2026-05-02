# Billing UI: SaaS Design Patterns

Comprehensive patterns for pricing pages, subscription management, billing portals, credit systems, and payment flows. Built on research from 2024-2025 best practices and conversion optimization data.

---

## Table of Contents

1. [Pricing Page Layout](#pricing-page-layout)
2. [Feature Comparison Table](#feature-comparison-table)
3. [Free Tier Design](#free-tier-design)
4. [Usage Meters & Progress](#usage-meters--progress)
5. [Upgrade Modal](#upgrade-modal)
6. [Downgrade Flow](#downgrade-flow)
7. [Payment Form](#payment-form)
8. [Invoice History](#invoice-history)
9. [Plan Badge](#plan-badge)
10. [Credit System UI](#credit-system-ui)
11. [Trial Banner](#trial-banner)
12. [Payment Failed Banner](#payment-failed-banner)
13. [Enterprise Custom Pricing](#enterprise-custom-pricing)
14. [Billing Portal Dashboard](#billing-portal-dashboard)
15. [Annual/Monthly Toggle](#annualmonthly-toggle)
16. [Complete Code Examples](#complete-code-examples)

---

## Pricing Page Layout

**Core Principle:** 3 tiers is optimal. More creates decision paralysis. Highlight one "best value" plan.

### Structure

```
Hero Section (headline + description)
│
Annual/Monthly Toggle (top-right, with savings badge)
│
3-Column Grid
├── Starter Card
│   ├── Plan name (Starter)
│   ├── Price (large, $29/mo)
│   ├── Billing period ("per month")
│   ├── Feature list (Check icons for included, Minus for excluded)
│   └── CTA Button (Secondary)
│
├── Pro Card (HIGHLIGHTED - "Most Popular")
│   ├── Badge (top-center, "Most Popular")
│   ├── Plan name (Pro)
│   ├── Price (large, $79/mo, or savings badge on annual)
│   ├── Billing period
│   ├── Feature list
│   └── CTA Button (Primary/Prominent)
│
└── Enterprise Card
    ├── Plan name (Enterprise)
    ├── "Custom pricing" badge
    ├── Feature description (Everything in Pro, plus...)
    └── CTA Button ("Contact sales")
```

### Key Characteristics

- **Card styling:** Elevated "Pro" with primary color header, border highlight, or shadow
- **Responsive:** 3-col on desktop → 1-col stack on mobile, recommended plan first
- **Transparency:** Always show prices (if available)
- **Feature count:** 5-7 most relevant features per plan
- **CTA button:** Full-width, minimum 44px height, clear visual hierarchy

### Research Insights

- **Monthly/Annual toggle:** Single most impactful element (25-35% annual uptake increase)
- **Feature comparison table:** 15-30% higher conversion for B2B SaaS
- **Whitespace:** Pages with more whitespace convert 28% better
- **Mobile optimization:** Mobile-optimized pricing pages convert 2.3x better
- **3 tiers:** Optimal number (fewer limits revenue, more causes paralysis)

### shadcn/ui Implementation

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Minus } from "lucide-react";
import { useState } from "react";

export function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(true);

  const plans = [
    {
      name: "Starter",
      monthlyPrice: 29,
      annualPrice: 290,
      description: "For solo recruiters",
      features: [
        { text: "Up to 50 resumes/month", included: true },
        { text: "Basic scoring", included: true },
        { text: "Email export", included: true },
        { text: "API access", included: false },
        { text: "Priority support", included: false },
      ],
      cta: "Start free trial",
    },
    {
      name: "Pro",
      monthlyPrice: 79,
      annualPrice: 790,
      description: "For hiring teams",
      popular: true,
      savings: "Save $158/year",
      features: [
        { text: "Unlimited resumes", included: true },
        { text: "Advanced scoring + skills matching", included: true },
        { text: "Team workspace (5 seats)", included: true },
        { text: "API access", included: true },
        { text: "Priority support", included: true },
      ],
      cta: "Start free trial",
    },
    {
      name: "Enterprise",
      monthlyPrice: null,
      annualPrice: null,
      description: "For large organizations",
      features: [
        { text: "Everything in Pro", included: true },
        { text: "Unlimited team seats", included: true },
        { text: "Custom integrations", included: true },
        { text: "Dedicated account manager", included: true },
        { text: "SLA & custom contracts", included: true },
      ],
      cta: "Contact sales",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Start free. Upgrade anytime. No hidden fees.
        </p>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className={isAnnual ? "text-muted-foreground" : "text-foreground font-medium"}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-8 w-14 rounded-full transition-colors ${
              isAnnual ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`h-7 w-7 rounded-full bg-white shadow-lg transition-transform ${
                isAnnual ? "translate-x-7" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className={isAnnual ? "text-foreground font-medium" : "text-muted-foreground"}>
            Annual
          </span>
          {isAnnual && (
            <Badge variant="outline" className="ml-2">
              Save 20%
            </Badge>
          )}
        </div>

        {/* Pricing Grid */}
        <div className="grid md:grid-cols-3 gap-8 lg:gap-6">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative flex flex-col transition-all ${
                plan.popular
                  ? "md:scale-105 border-primary shadow-xl"
                  : "hover:shadow-lg"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <Badge className="bg-primary text-white">Most Popular</Badge>
                </div>
              )}

              {plan.popular && (
                <div className="h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
              )}

              <CardHeader className={plan.popular ? "bg-primary/5" : ""}>
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {plan.description}
                </p>

                <div className="mt-6 mb-2">
                  {plan.monthlyPrice !== null ? (
                    <>
                      <span className="text-5xl font-bold">
                        ${isAnnual ? Math.floor(plan.annualPrice! / 12) : plan.monthlyPrice}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </>
                  ) : (
                    <div className="text-2xl font-semibold">Custom pricing</div>
                  )}
                </div>

                {isAnnual && plan.savings && (
                  <Badge variant="outline" className="w-fit mt-2 text-green-700 bg-green-50">
                    {plan.savings}
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="flex-1 flex flex-col pt-6">
                <Button
                  className={`mb-6 w-full h-11 ${
                    plan.popular
                      ? "bg-primary text-white"
                      : "variant-outline"
                  }`}
                >
                  {plan.cta}
                </Button>

                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex gap-3">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Minus className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      )}
                      <span
                        className={
                          feature.included ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Feature Comparison Table

### Desktop: Full Table with Sticky Header

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, X } from "lucide-react";

export function FeatureComparisonTable() {
  const features = [
    {
      category: "Resume Management",
      items: [
        { name: "Resumes/month", starter: "50", pro: "Unlimited", enterprise: "Unlimited" },
        { name: "Storage", starter: "5 GB", pro: "Unlimited", enterprise: "Unlimited" },
        { name: "Retention", starter: "30 days", pro: "Unlimited", enterprise: "Unlimited" },
      ],
    },
    {
      category: "Scoring & Analysis",
      items: [
        { name: "GPT-4o Scoring", starter: true, pro: true, enterprise: true },
        { name: "Skills matching", starter: false, pro: true, enterprise: true },
        { name: "Custom weights", starter: false, pro: true, enterprise: true },
      ],
    },
    {
      category: "Team & Collaboration",
      items: [
        { name: "Team seats", starter: "1", pro: "5", enterprise: "Unlimited" },
        { name: "Shared jobs", starter: false, pro: true, enterprise: true },
        { name: "Admin controls", starter: false, pro: true, enterprise: true },
      ],
    },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            <TableHead className="w-48">Feature</TableHead>
            <TableHead className="text-center w-32">Starter</TableHead>
            <TableHead className="text-center w-32">Pro</TableHead>
            <TableHead className="text-center w-32">Enterprise</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {features.map((category) => (
            <>
              <TableRow className="bg-muted/50">
                <TableCell colSpan={4} className="font-semibold text-sm">
                  {category.category}
                </TableCell>
              </TableRow>
              {category.items.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="font-medium text-sm">{item.name}</TableCell>
                  <TableCell className="text-center text-sm">
                    {typeof item.starter === "boolean" ? (
                      item.starter ? (
                        <Check className="h-5 w-5 text-green-600 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      )
                    ) : (
                      item.starter
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {typeof item.pro === "boolean" ? (
                      item.pro ? (
                        <Check className="h-5 w-5 text-green-600 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      )
                    ) : (
                      item.pro
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {typeof item.enterprise === "boolean" ? (
                      item.enterprise ? (
                        <Check className="h-5 w-5 text-green-600 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      )
                    ) : (
                      item.enterprise
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### Mobile: Accordion Tabs

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function FeatureComparisonMobile() {
  return (
    <Tabs defaultValue="starter" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="starter">Starter</TabsTrigger>
        <TabsTrigger value="pro">Pro</TabsTrigger>
        <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
      </TabsList>

      <TabsContent value="starter" className="space-y-4 mt-4">
        {/* Starter features */}
      </TabsContent>

      <TabsContent value="pro" className="space-y-4 mt-4">
        {/* Pro features */}
      </TabsContent>

      <TabsContent value="enterprise" className="space-y-4 mt-4">
        {/* Enterprise features */}
      </TabsContent>
    </Tabs>
  );
}
```

---

## Free Tier Design

### Usage Limits Display

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export function FreeTierLimits() {
  const limits = [
    { name: "Resumes analyzed", used: 48, limit: 50, critical: true },
    { name: "API requests", used: 890, limit: 1000, critical: false },
    { name: "Storage used", used: 2.4, limit: 5, critical: false, unit: "GB" },
  ];

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Free plan limits</h3>
        <p className="text-sm text-muted-foreground mt-1">
          You're using most of your free quota
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {limits.map((limit) => (
          <div key={limit.name}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{limit.name}</span>
              <span className="text-sm text-muted-foreground">
                {limit.used} / {limit.limit}
                {limit.unit && ` ${limit.unit}`}
              </span>
            </div>
            <Progress
              value={(limit.used / limit.limit) * 100}
              className="h-2"
            />
            {limit.critical && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Upgrade to continue analyzing resumes
                </AlertDescription>
              </Alert>
            )}
          </div>
        ))}

        <Button className="w-full mt-4">Upgrade to Pro</Button>
      </CardContent>
    </Card>
  );
}
```

### Soft Upgrade CTA

At 80% usage, show a soft upgrade nudge (not blocking):

```tsx
<Alert className="bg-amber-50 border-amber-200">
  <AlertTriangle className="h-4 w-4 text-amber-600" />
  <AlertDescription className="text-amber-900">
    You're approaching your monthly limit.{" "}
    <Button variant="link" className="p-0 h-auto text-amber-700">
      Upgrade now
    </Button>{" "}
    for unlimited access.
  </AlertDescription>
</Alert>
```

---

## Usage Meters & Progress

### Advanced Usage Dashboard

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export function UsageMeters() {
  const usage = [
    {
      name: "API Calls",
      current: 23400,
      limit: 100000,
      color: "bg-green-500",
      percentage: 23,
    },
    {
      name: "Storage",
      current: 78,
      limit: 100,
      color: "bg-yellow-500",
      percentage: 78,
      unit: "GB",
    },
    {
      name: "Team Members",
      current: 8,
      limit: 10,
      color: "bg-orange-500",
      percentage: 80,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {usage.map((meter) => (
        <Card key={meter.name}>
          <CardHeader className="pb-3">
            <h3 className="text-sm font-medium">{meter.name}</h3>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-bold">{meter.current}</span>
                <span className="text-sm text-muted-foreground">
                  / {meter.limit} {meter.unit || ""}
                </span>
              </div>
              <Progress value={meter.percentage} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {meter.percentage}% used
              </p>
            </div>

            {meter.percentage >= 80 && (
              <Button variant="outline" className="w-full text-xs">
                Upgrade plan
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### Color Coding

- **Green (0-70%):** Safe zone
- **Yellow (70-90%):** Warning zone
- **Red (90-100%):** Critical zone

---

## Upgrade Modal

### AlertDialog Pattern

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function UpgradeModal({ open, onOpenChange, currentPlan, newPlan }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Upgrade to {newPlan.name}</AlertDialogTitle>
          <AlertDialogDescription>
            You're about to upgrade your plan
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Current vs New Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current plan</p>
              <p className="font-semibold">{currentPlan.name}</p>
              <p className="text-2xl font-bold mt-2">
                ${currentPlan.monthlyPrice}
                <span className="text-sm text-muted-foreground">/mo</span>
              </p>
            </div>

            <div className="border-l">
              <p className="text-xs text-muted-foreground mb-1 pl-4">
                New plan
              </p>
              <p className="font-semibold pl-4">{newPlan.name}</p>
              <p className="text-2xl font-bold mt-2 pl-4 text-primary">
                ${newPlan.monthlyPrice}
                <span className="text-sm">/mo</span>
              </p>
            </div>
          </div>

          {/* Billing Info */}
          <div className="bg-muted p-3 rounded-lg text-sm">
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">
                Prorated for current period (7 days)
              </span>
              <span className="font-semibold">+$11.75</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Next renewal (monthly)
              </span>
              <span className="font-semibold">${newPlan.monthlyPrice}</span>
            </div>
          </div>

          {/* Feature Additions */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              New features included
            </p>
            <ul className="space-y-1 text-sm">
              <li className="flex gap-2">
                <span className="text-green-600">✓</span>
                <span>Unlimited team members</span>
              </li>
              <li className="flex gap-2">
                <span className="text-green-600">✓</span>
                <span>Advanced analytics</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-primary">
            Upgrade now
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Activation

```tsx
<Button onClick={() => setUpgradeOpen(true)}>Upgrade to Pro</Button>
```

---

## Downgrade Flow

### Warning Dialog

```tsx
export function DowngradeWarning({ open, onOpenChange }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            Downgrade to Starter?
          </AlertDialogTitle>
          <AlertDialogDescription>
            You'll lose access to some features
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4 border-y">
          <div>
            <p className="text-sm font-semibold mb-2">You'll lose access to:</p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <X className="h-4 w-4 text-destructive" />
                <span>Team collaboration (5 → 1 seat)</span>
              </li>
              <li className="flex gap-2">
                <X className="h-4 w-4 text-destructive" />
                <span>Unlimited resumes (→ 50/month)</span>
              </li>
              <li className="flex gap-2">
                <X className="h-4 w-4 text-destructive" />
                <span>API access</span>
              </li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <p className="text-sm text-amber-900">
              Downgrade takes effect at the end of your current billing period
              (May 15, 2025). Your data is safe.
            </p>
          </div>

          {/* Retention Offer */}
          <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
            <p className="text-sm font-semibold text-green-900 mb-2">
              Need a discount? 🎉
            </p>
            <p className="text-sm text-green-800 mb-3">
              We can offer you 40% off Pro for 3 months
            </p>
            <Button size="sm" variant="outline" className="text-green-700">
              Accept offer
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <AlertDialogCancel>Keep Pro</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive">
            Confirm downgrade
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

---

## Payment Form

### Stripe Elements Integration

```tsx
import { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function PaymentForm({ planName, planPrice }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [saveCard, setSaveCard] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError("");

    try {
      const cardElement = elements.getElement(CardElement);
      const { token } = await stripe.createToken(cardElement);

      if (!token) throw new Error("Failed to create payment token");

      // Create payment intent
      const response = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "pro",
          saveCard,
        }),
      });

      const { clientSecret } = await response.json();

      // Confirm payment
      const { paymentIntent, error: confirmError } =
        await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElement },
        });

      if (confirmError) throw confirmError;
      if (paymentIntent?.status === "succeeded") {
        // Handle success
        window.location.href = "/dashboard?upgrade=success";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <h2 className="text-xl font-bold">{planName}</h2>
        <p className="text-3xl font-bold mt-2">
          ${planPrice}
          <span className="text-sm text-muted-foreground">/month</span>
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Card Element */}
          <div className="border rounded-lg p-4">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: "16px",
                    color: "rgb(31, 41, 55)",
                    "::placeholder": {
                      color: "rgb(156, 163, 175)",
                    },
                  },
                },
              }}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Save Card Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="save-card"
              checked={saveCard}
              onCheckedChange={setSaveCard}
            />
            <Label htmlFor="save-card" className="text-sm font-normal">
              Save this card for future purchases
            </Label>
          </div>

          {/* Powered by Stripe */}
          <div className="flex items-center justify-center py-3">
            <img
              src="/stripe-badge.svg"
              alt="Powered by Stripe"
              className="h-6"
            />
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" disabled={processing}>
            {processing ? "Processing..." : `Subscribe for $${planPrice}/mo`}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            You can cancel anytime. No questions asked.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

### Card Brand Auto-Detection

```tsx
const [cardBrand, setCardBrand] = useState<string | null>(null);

<CardElement
  onChange={(e) => {
    setCardBrand(e.brand);
  }}
/>

{cardBrand && (
  <div className="absolute right-3 top-1/2 -translate-y-1/2">
    <img
      src={`/card-brands/${cardBrand}.svg`}
      alt={cardBrand}
      className="h-6"
    />
  </div>
)}
```

---

## Invoice History

### DataTable with Sorting & Filtering

```tsx
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ChevronUp, ChevronDown } from "lucide-react";

export function InvoiceHistory() {
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const invoices = [
    {
      id: "INV-2025-003",
      date: "2025-03-15",
      description: "the project Pro (Mar 15 - Apr 14)",
      amount: 79.00,
      status: "paid",
    },
    {
      id: "INV-2025-002",
      date: "2025-02-15",
      description: "the project Pro (Feb 15 - Mar 14)",
      amount: 79.00,
      status: "paid",
    },
    {
      id: "INV-2025-001",
      date: "2025-01-15",
      description: "the project Starter (Jan 15 - Feb 14)",
      amount: 29.00,
      status: "paid",
    },
  ];

  const handleSort = (key: "date" | "amount") => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  };

  const sorted = [...invoices].sort((a, b) => {
    let aVal = sortBy === "date" ? a.date : a.amount;
    let bVal = sortBy === "date" ? b.date : b.amount;

    if (typeof aVal === "string") aVal = new Date(aVal).getTime();
    if (typeof bVal === "string") bVal = new Date(bVal).getTime();

    return sortOrder === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>
              <button
                onClick={() => handleSort("date")}
                className="flex items-center gap-1 hover:text-foreground"
              >
                Date
                {sortBy === "date" &&
                  (sortOrder === "asc" ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  ))}
              </button>
            </TableHead>
            <TableHead>Description</TableHead>
            <TableHead>
              <button
                onClick={() => handleSort("amount")}
                className="flex items-center gap-1 hover:text-foreground"
              >
                Amount
                {sortBy === "amount" &&
                  (sortOrder === "asc" ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  ))}
              </button>
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-medium">
                {new Date(invoice.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell>{invoice.description}</TableCell>
              <TableCell>${invoice.amount.toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadInvoice(invoice.id)}
                >
                  <Download className="h-4 w-4" />
                  PDF
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

## Plan Badge

### Header/Sidebar Badge

```tsx
import { Badge } from "@/components/ui/badge";

export function PlanBadge({ plan }: { plan: "free" | "pro" | "enterprise" }) {
  const variants = {
    free: "outline",
    pro: "default",
    enterprise: "secondary",
  };

  const labels = {
    free: "Free",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  return (
    <Badge variant={variants[plan]}>
      {labels[plan]}
    </Badge>
  );
}
```

### In Sidebar

```tsx
<div className="px-4 py-3 border-b">
  <p className="text-xs text-muted-foreground mb-2">Current plan</p>
  <PlanBadge plan={user.plan} />
</div>
```

---

## Credit System UI

### Balance Card

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";

export function CreditsBalance({ credits, nextRefillDate }) {
  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
      <CardHeader>
        <h3 className="text-lg font-semibold">Your credits</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-primary" />
          <div>
            <p className="text-4xl font-bold">{credits}</p>
            <p className="text-sm text-muted-foreground">
              Credits available
            </p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          Next refill:{" "}
          <span className="font-semibold text-foreground">
            {new Date(nextRefillDate).toLocaleDateString()}
          </span>
        </div>

        <Button className="w-full">Buy more credits</Button>
      </CardContent>
    </Card>
  );
}
```

### Credit Packs Grid

```tsx
export function CreditPacks() {
  const packs = [
    { credits: 100, price: 10, save: null },
    { credits: 500, price: 40, save: "$10" },
    { credits: 1000, price: 70, save: "$30" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {packs.map((pack) => (
        <Card key={pack.credits} className="relative">
          {pack.save && (
            <Badge className="absolute -top-2 -right-2 bg-green-600">
              {pack.save}
            </Badge>
          )}
          <CardContent className="pt-6 text-center space-y-4">
            <div>
              <p className="text-3xl font-bold">{pack.credits}</p>
              <p className="text-xs text-muted-foreground">credits</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${pack.price}</p>
            </div>
            <Button className="w-full">Buy now</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

### Usage Log Table

```tsx
export function UsageLog() {
  const log = [
    {
      date: "2025-03-15",
      action: "Resume analysis",
      creditsUsed: 2,
      remaining: 98,
    },
    {
      date: "2025-03-14",
      action: "Batch ranking (24 resumes)",
      creditsUsed: 24,
      remaining: 100,
    },
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Action</TableHead>
          <TableHead className="text-right">Credits Used</TableHead>
          <TableHead className="text-right">Remaining</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {log.map((item, i) => (
          <TableRow key={i}>
            <TableCell className="text-sm">
              {new Date(item.date).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-sm">{item.action}</TableCell>
            <TableCell className="text-right text-sm">
              -{item.creditsUsed}
            </TableCell>
            <TableCell className="text-right text-sm font-semibold">
              {item.remaining}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## Trial Banner

### Countdown Banner

```tsx
import { AlertCircle, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function TrialBanner({ daysRemaining, onDismiss }) {
  const [show, setShow] = useState(true);

  if (!show) return null;

  const isUrgent = daysRemaining <= 3;

  return (
    <Alert
      className={`${
        isUrgent
          ? "bg-red-50 border-red-200 text-red-900"
          : "bg-blue-50 border-blue-200 text-blue-900"
      }`}
    >
      <AlertCircle className={`h-4 w-4 ${isUrgent ? "text-red-600" : "text-blue-600"}`} />
      <AlertDescription className="flex items-center justify-between gap-4">
        <div>
          <span className="font-semibold">{daysRemaining} days</span> left in
          your trial. Upgrade now to keep using the project.
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className={isUrgent ? "bg-red-600 hover:bg-red-700" : ""}
          >
            Upgrade now
          </Button>
          <button
            onClick={() => setShow(false)}
            className="p-1 hover:bg-black/10 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

**Behavior:**
- Show when days remaining < 7
- Yellow (7 days) → Orange (3 days) → Red (< 3 days)
- Dismissible, reappears next day
- CTAs escalate as expiry approaches

---

## Payment Failed Banner

### Persistent Error Banner

```tsx
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function PaymentFailedBanner() {
  return (
    <Alert variant="destructive" className="rounded-none border-0 border-b">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <div>
          <span className="font-semibold">Payment failed.</span> Update your
          payment method to avoid service interruption.
        </div>
        <Button size="sm" variant="outline" className="gap-1">
          Update now
          <ChevronRight className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

**Key Characteristics:**
- **Persistent:** Cannot be dismissed until resolved
- **Placement:** Top of app, all pages
- **Color:** Red/destructive
- **Action:** Opens payment update modal
- **Urgency:** "Avoid service interruption" messaging

---

## Enterprise Custom Pricing

### Contact Sales Card

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase } from "lucide-react";

export function EnterprisePricingCard() {
  return (
    <Card className="border-2 border-primary/50 relative">
      <CardHeader className="text-center">
        <Briefcase className="h-8 w-8 text-primary mx-auto mb-2" />
        <h3 className="text-2xl font-bold">Enterprise</h3>
        <p className="text-sm text-muted-foreground mt-2">
          For large organizations with custom needs
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="bg-muted p-4 rounded-lg">
          <p className="font-semibold mb-3">Everything in Pro, plus:</p>
          <ul className="space-y-2 text-sm">
            <li>✓ Unlimited team seats</li>
            <li>✓ Custom integrations & SSO</li>
            <li>✓ SLA & dedicated support</li>
            <li>✓ Custom contracts</li>
            <li>✓ On-premise deployment options</li>
          </ul>
        </div>

        <Button
          onClick={() => openCalendlyModal("enterprise-sales")}
          className="w-full h-11"
        >
          Schedule a demo
        </Button>

        <div className="text-center text-xs text-muted-foreground">
          Or email{" "}
          <a href="mailto:sales@rankora.com" className="underline hover:text-foreground">
            sales@rankora.com
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Contact Form Modal (Alternative)

```tsx
export function SalesContactModal({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Let's talk Enterprise</DialogTitle>
        </DialogHeader>

        <form className="space-y-4">
          <div>
            <Label htmlFor="company">Company name</Label>
            <Input id="company" placeholder="Acme Corp" />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" />
          </div>

          <div>
            <Label htmlFor="message">Tell us about your needs</Label>
            <textarea
              id="message"
              className="w-full h-24 p-3 border rounded-lg"
              placeholder="Team size, use case, integrations needed..."
            />
          </div>

          <Button className="w-full">Send inquiry</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Billing Portal Dashboard

### Complete Billing Settings

```tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function BillingPortal() {
  return (
    <div className="max-w-4xl">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payment-methods">Payment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Current plan + usage */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Current plan</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">the project Pro</p>
                  <p className="text-sm text-muted-foreground">
                    Renews on April 15, 2025
                  </p>
                </div>
                <Badge>Active</Badge>
              </div>
              <div className="flex gap-2">
                <Button>Change plan</Button>
                <Button variant="outline">Cancel subscription</Button>
              </div>
            </CardContent>
          </Card>

          {/* Usage */}
          <UsageMeters />
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          {/* Billing info */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Billing information</h3>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Next billing date:</span>{" "}
                <span className="font-semibold">April 15, 2025</span>
              </p>
              <p>
                <span className="text-muted-foreground">Billing cycle:</span>{" "}
                <span className="font-semibold">Monthly ($79.00/mo)</span>
              </p>
              <Button variant="outline">Change billing address</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceHistory />
        </TabsContent>

        <TabsContent value="payment-methods">
          <PaymentMethodsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## Annual/Monthly Toggle

### Toggle with Savings Display

```tsx
export function BillingToggle({ isAnnual, onToggle }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <span className={isAnnual ? "text-muted-foreground" : "font-medium"}>
        Monthly
      </span>

      <button
        onClick={onToggle}
        className={`relative inline-flex h-8 w-14 rounded-full transition-colors ${
          isAnnual ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`h-7 w-7 rounded-full bg-white shadow-lg transition-transform ${
            isAnnual ? "translate-x-7" : "translate-x-0.5"
          }`}
        />
      </button>

      <span className={isAnnual ? "font-medium" : "text-muted-foreground"}>
        Annual
      </span>

      {isAnnual && (
        <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">
          Save 20%
        </Badge>
      )}
    </div>
  );
}
```

---

## Complete Code Examples

### Example 1: Full Pricing Page

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

export function CompletePricingPage() {
  const [isAnnual, setIsAnnual] = useState(true);

  const plans = [
    {
      name: "Starter",
      monthlyPrice: 29,
      annualPrice: 290,
      popular: false,
      features: [
        { text: "Up to 50 resumes/month", included: true },
        { text: "Basic GPT-4o scoring", included: true },
        { text: "Email export", included: true },
        { text: "Team workspace", included: false },
        { text: "API access", included: false },
      ],
    },
    {
      name: "Pro",
      monthlyPrice: 79,
      annualPrice: 790,
      popular: true,
      features: [
        { text: "Unlimited resumes", included: true },
        { text: "Advanced scoring + skills matching", included: true },
        { text: "Team workspace (5 seats)", included: true },
        { text: "API access", included: true },
        { text: "Priority support", included: true },
      ],
    },
    {
      name: "Enterprise",
      monthlyPrice: null,
      annualPrice: null,
      popular: false,
      features: [
        { text: "Everything in Pro", included: true },
        { text: "Unlimited team seats", included: true },
        { text: "Custom integrations", included: true },
        { text: "Dedicated account manager", included: true },
        { text: "SLA & custom contracts", included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="max-w-7xl mx-auto px-4 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-muted-foreground mb-12">
            Start free. Upgrade anytime. No hidden fees.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center gap-4 mb-16">
            <span className={isAnnual ? "text-muted-foreground" : "font-medium"}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative inline-flex h-8 w-14 rounded-full transition-colors ${
                isAnnual ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`h-7 w-7 rounded-full bg-white shadow transition-transform ${
                  isAnnual ? "translate-x-7" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className={isAnnual ? "font-medium" : "text-muted-foreground"}>
              Annual
            </span>
            {isAnnual && (
              <Badge className="ml-2 bg-green-600">Save 20%</Badge>
            )}
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative flex flex-col transition-all ${
                  plan.popular
                    ? "md:scale-105 border-primary/50 shadow-xl"
                    : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">Most Popular</Badge>
                  </div>
                )}

                <CardHeader>
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                  <div className="mt-4">
                    {plan.monthlyPrice ? (
                      <>
                        <span className="text-5xl font-bold">
                          ${isAnnual ? Math.floor(plan.annualPrice! / 12) : plan.monthlyPrice}
                        </span>
                        <span className="text-muted-foreground">/month</span>
                      </>
                    ) : (
                      <div className="text-2xl font-semibold">Custom pricing</div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col">
                  <Button
                    className={`mb-6 w-full h-11 ${
                      plan.popular ? "bg-primary" : ""
                    }`}
                  >
                    {plan.monthlyPrice ? "Start free trial" : "Contact sales"}
                  </Button>

                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                        ) : (
                          <X className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <span
                          className={
                            feature.included ? "" : "text-muted-foreground"
                          }
                        >
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Example 2: Billing Settings Page

```tsx
export function BillingSettingsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-bold">Current plan</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">the project Pro</p>
              <p className="text-sm text-muted-foreground">
                Renews April 15, 2025
              </p>
            </div>
            <Badge>Active</Badge>
          </div>
          <div className="flex gap-2">
            <Button>Change plan</Button>
            <Button variant="outline">Cancel subscription</Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <UsageMeters />

      {/* Invoices */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-bold">Billing history</h2>
        </CardHeader>
        <CardContent>
          <InvoiceHistory />
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-bold">Payment methods</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">Visa ending in 4242</p>
              <p className="text-sm text-muted-foreground">Expires 12/2026</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">Edit</Button>
              <Button size="sm" variant="outline">Remove</Button>
            </div>
          </div>
          <Button variant="outline" className="w-full">
            Add payment method
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

---

## Dark Mode

Billing and pricing pages need careful dark mode treatment—users must clearly see pricing differences and feature lists. Featured plan "glow" effects, comparison tables, and credit displays all need attention.

### CSS Variable Mapping

**Light Mode (default):**
```css
--background: 0 0% 100%        /* Page background */
--card: 0 0% 100%              /* Pricing card surfaces */
--border: 0 0% 89.8%           /* Card borders, table separators */
--muted: 0 0% 96.1%            /* Table alternating rows */
--foreground: 0 0% 3.6%        /* Text, labels, prices */
--primary: 217 91.2% 59.8%     /* Featured plan highlight, CTA buttons */
--input: 0 0% 89.8%            /* Usage meter background */
```

**Dark Mode:**
```css
--background: 0 0% 3.6%        /* Near black */
--card: 0 0% 8%                /* Slightly lighter cards */
--border: 0 0% 20%             /* Subtle borders */
--muted: 0 0% 14.9%            /* Alternating table rows */
--foreground: 0 0% 98%         /* Off white text */
--primary: 217 91.2% 59.8%     /* Blue stays consistent */
--input: 0 0% 14.9%            /* Dark meter backgrounds */
```

### Component-Level Overrides

#### Pricing Cards (Featured + Regular)

```tsx
<Card className={cn(
  'dark:bg-card dark:border-border transition-all',
  isFeatured && 'ring-2 ring-primary dark:shadow-lg dark:shadow-primary/20'
)}>
  <CardHeader className="pb-4">
    <CardTitle className="dark:text-foreground">{plan.name}</CardTitle>
    <CardDescription className="dark:text-muted-foreground">
      {plan.description}
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="space-y-2">
      <span className="text-4xl font-bold dark:text-foreground">${plan.price}</span>
      <p className="text-sm dark:text-muted-foreground">/month, billed annually</p>
    </div>
    <Button className={cn(
      'w-full',
      isFeatured ? 'bg-primary text-primary-foreground' : 'dark:bg-muted dark:text-foreground'
    )}>
      Get started
    </Button>
  </CardContent>
</Card>
```

#### Feature Comparison Table

```tsx
<div className="overflow-x-auto">
  <Table className="dark:border-border">
    <TableHeader className="dark:bg-muted/50 dark:border-border">
      <TableRow className="dark:border-border">
        <TableHead className="dark:text-foreground">Feature</TableHead>
        <TableHead className="text-center dark:text-foreground">Starter</TableHead>
        <TableHead className="text-center dark:text-foreground">Pro</TableHead>
        <TableHead className="text-center dark:text-foreground">Enterprise</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {features.map((feature, idx) => (
        <TableRow
          key={feature.id}
          className={cn(
            'dark:border-border',
            idx % 2 === 0 ? 'dark:bg-muted/30' : ''
          )}
        >
          <TableCell className="dark:text-foreground">{feature.name}</TableCell>
          <TableCell className="text-center dark:text-muted-foreground">
            {feature.starter ? <Check className="w-5 h-5 mx-auto text-green-500" /> : '—'}
          </TableCell>
          <TableCell className="text-center dark:text-muted-foreground">
            {feature.pro ? <Check className="w-5 h-5 mx-auto text-green-500" /> : '—'}
          </TableCell>
          <TableCell className="text-center dark:text-muted-foreground">
            {feature.enterprise ? <Check className="w-5 h-5 mx-auto text-green-500" /> : '—'}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

#### Usage Meter (Credit Display)

```tsx
<Card className="dark:bg-card dark:border-border">
  <CardHeader>
    <CardTitle className="dark:text-foreground">API Usage This Month</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm dark:text-foreground">Requests used</span>
        <span className="text-sm font-mono dark:text-muted-foreground">125 / 1,000</span>
      </div>
      <Progress
        value={12.5}
        className="h-2 dark:bg-input dark:[&>div]:bg-blue-500"
      />
    </div>
    <p className="text-xs dark:text-muted-foreground">
      875 requests remaining. Usage resets on the 1st of next month.
    </p>
  </CardContent>
</Card>
```

#### Plan Badge / Trial Banner

```tsx
<div className="flex items-center justify-between p-4 dark:bg-amber-950/30 dark:border dark:border-amber-800 rounded-lg mb-4">
  <div>
    <p className="font-medium dark:text-amber-400">Free Trial Active</p>
    <p className="text-sm dark:text-amber-300">6 days remaining</p>
  </div>
  <Button variant="outline" className="dark:bg-transparent dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/30">
    Upgrade now
  </Button>
</div>
```

#### Invoice Table

```tsx
<Table className="dark:border-border">
  <TableHeader className="dark:bg-muted/50">
    <TableRow className="dark:border-border">
      <TableHead className="dark:text-foreground">Invoice</TableHead>
      <TableHead className="dark:text-foreground">Date</TableHead>
      <TableHead className="dark:text-foreground">Amount</TableHead>
      <TableHead className="dark:text-foreground">Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((invoice) => (
      <TableRow key={invoice.id} className="dark:border-border dark:hover:bg-muted/50">
        <TableCell className="dark:text-foreground font-mono">{invoice.id}</TableCell>
        <TableCell className="dark:text-muted-foreground">{invoice.date}</TableCell>
        <TableCell className="dark:text-foreground font-semibold">${invoice.amount}</TableCell>
        <TableCell>
          <Badge className={cn(
            invoice.status === 'paid'
              ? 'dark:bg-green-900 dark:text-green-400'
              : 'dark:bg-yellow-900 dark:text-yellow-400'
          )}>
            {invoice.status}
          </Badge>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

#### Credit Display

```tsx
<div className="flex items-center justify-between p-4 dark:bg-blue-950/30 dark:border dark:border-blue-800 rounded-lg">
  <div>
    <p className="text-sm dark:text-muted-foreground">Available Credits</p>
    <p className="text-3xl font-bold dark:text-foreground">2,500 resumes</p>
    <p className="text-xs dark:text-blue-400 mt-1">Expires Apr 4, 2027</p>
  </div>
  <Button className="dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700">
    Buy more
  </Button>
</div>
```

### Common Dark Mode Mistakes in Billing UI

1. **Featured plan glow too subtle:** The primary ring effect must have `dark:shadow-primary/20` to create visible depth on dark backgrounds.
2. **Table alternating rows blend together:** Alternating `dark:bg-muted/30` on rows makes them distinct. Without it, rows disappear.
3. **Comparison checkmarks hard to see:** Always use `text-green-500` or `text-green-400`, never pure green which varies in dark mode.
4. **Usage meter background invisible:** The track must be `dark:bg-input` (darker than card), not the same color.
5. **Trial/alert banners lack visual separation:** Use semantic colors: `dark:bg-amber-950/30 dark:border-amber-800` for warnings.
6. **Pricing numbers lose prominence:** Price text must use `dark:text-foreground` (98% white) to stand out.
7. **Invoice table too dense:** Add `dark:hover:bg-muted/50` on rows for better scannability.
8. **Currency symbols and commas hard to read:** Use monospace font for prices: `font-mono`.

### Code Example: Complete Dark Mode Billing Page

```tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 99,
    description: 'For small teams',
    features: ['Up to 500 resumes', 'Basic analytics', 'Email support'],
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 299,
    description: 'For growing teams',
    features: ['Up to 5,000 resumes', 'Advanced analytics', 'Priority support', 'Custom workflows'],
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    description: 'Custom pricing',
    features: ['Unlimited resumes', 'Dedicated support', 'Custom integration', 'SLA'],
    featured: false,
  },
];

export const DarkModeBillingPage = () => {
  return (
    <div className="min-h-screen dark:bg-background p-6 space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold dark:text-foreground mb-2">Simple, Transparent Pricing</h1>
        <p className="dark:text-muted-foreground">Choose the plan that fits your screening needs</p>
      </div>

      {/* Trial Banner */}
      <div className="flex items-center justify-between p-4 dark:bg-amber-950/30 dark:border dark:border-amber-800 rounded-lg max-w-2xl mx-auto w-full">
        <div>
          <p className="font-medium dark:text-amber-400">Free Trial Active</p>
          <p className="text-sm dark:text-amber-300">6 days remaining. Upgrade anytime.</p>
        </div>
        <Button className="dark:bg-amber-600 dark:text-white dark:hover:bg-amber-700">
          Upgrade now
        </Button>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={cn(
              'dark:bg-card dark:border-border transition-all relative',
              plan.featured && 'ring-2 ring-primary dark:shadow-lg dark:shadow-primary/20 md:scale-105'
            )}
          >
            {plan.featured && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
            )}
            <CardHeader className="pb-4">
              <CardTitle className="dark:text-foreground">{plan.name}</CardTitle>
              <CardDescription className="dark:text-muted-foreground">
                {plan.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                {plan.price ? (
                  <>
                    <span className="text-4xl font-bold dark:text-foreground">${plan.price}</span>
                    <p className="text-sm dark:text-muted-foreground">/month, billed annually</p>
                  </>
                ) : (
                  <p className="text-lg dark:text-foreground font-semibold">Custom pricing</p>
                )}
              </div>
              <Button
                className={cn(
                  'w-full',
                  plan.featured
                    ? 'bg-primary text-primary-foreground'
                    : 'dark:bg-muted dark:text-foreground dark:border dark:border-border'
                )}
              >
                Get started
              </Button>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              {plan.features.map((feature) => (
                <div key={feature} className="flex gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="dark:text-muted-foreground">{feature}</span>
                </div>
              ))}
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Usage Stats */}
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-2xl font-bold dark:text-foreground">Your Usage</h2>
        <Card className="dark:bg-card dark:border-border">
          <CardContent className="pt-6 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm dark:text-foreground">Resumes analyzed this month</span>
                <span className="text-sm font-mono dark:text-muted-foreground">125 / 500</span>
              </div>
              <Progress value={25} className="h-2 dark:bg-input" />
            </div>
            <p className="text-xs dark:text-muted-foreground">
              375 resumes remaining. Usage resets on May 1, 2026.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold dark:text-foreground mb-4">Billing History</h2>
        <Card className="dark:bg-card dark:border-border">
          <Table>
            <TableHeader className="dark:bg-muted/50">
              <TableRow className="dark:border-border">
                <TableHead className="dark:text-foreground">Invoice</TableHead>
                <TableHead className="dark:text-foreground">Date</TableHead>
                <TableHead className="dark:text-foreground">Amount</TableHead>
                <TableHead className="dark:text-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { id: 'INV-001', date: 'Mar 1, 2026', amount: 299, status: 'paid' },
                { id: 'INV-002', date: 'Feb 1, 2026', amount: 299, status: 'paid' },
                { id: 'INV-003', date: 'Jan 1, 2026', amount: 299, status: 'paid' },
              ].map((invoice) => (
                <TableRow key={invoice.id} className="dark:border-border dark:hover:bg-muted/30">
                  <TableCell className="dark:text-foreground font-mono">{invoice.id}</TableCell>
                  <TableCell className="dark:text-muted-foreground">{invoice.date}</TableCell>
                  <TableCell className="dark:text-foreground">${invoice.amount}</TableCell>
                  <TableCell>
                    <Badge className="dark:bg-green-900 dark:text-green-400">
                      {invoice.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};
```

---

## Responsive Design

### Breakpoint Behavior

- **sm (640px):** Pricing cards horizontal snap-scroll, feature comparison collapsible, invoices as cards, usage meters stack
- **md (768px):** 2 pricing cards visible, comparison accordion, meter grid 2x2
- **lg (1024px):** 3+ pricing cards visible, sticky table header, feature matrix full, meters 4-col
- **xl (1280px):** All cards visible, maximum spacing, full comparison table

### Layout Transformations

**Pricing Cards: 3-Column Grid → Horizontal Snap Scroll:**
```tsx
{/* Desktop: Fixed grid layout */}
<div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
  {plans.map(p => <PricingCard plan={p} />)}
</div>

{/* Mobile: Snap-scroll horizontal */}
<div className="md:hidden snap-x snap-mandatory overflow-x-auto flex gap-4 pb-4">
  {plans.map(p => (
    <div key={p.id} className="snap-center shrink-0 w-72">
      <PricingCard plan={p} />
    </div>
  ))}
</div>
```

**Feature Comparison: Table with Sticky Header → Collapsible:**
```tsx
{/* Desktop: Table with sticky column */}
<div className="hidden md:block overflow-x-auto">
  <table className="w-full">
    <th className="sticky left-0">Feature</th>
    {/* Comparison rows */}
  </table>
</div>

{/* Mobile: Accordion/collapsible per feature */}
{features.map(f => (
  <Collapsible key={f.id}>
    <CollapsibleTrigger className="w-full p-3 bg-gray-50 font-semibold">
      {f.name}
    </CollapsibleTrigger>
    <CollapsibleContent className="p-3 space-y-2">
      {/* Plan values */}
    </CollapsibleContent>
  </Collapsible>
))}
```

**Usage Meters: 4-Column → Single Column:**
```tsx
{/* Desktop: 2x2 or 4-column grid */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
  {meters.map(m => <Meter {...m} />)}
</div>

{/* Mobile: Single column stack */}
<div className="md:hidden space-y-4">
  {meters.map(m => <Meter {...m} />)}
</div>
```

**Invoice Table → Card List:**
```tsx
{/* Desktop: Traditional table */}
<div className="hidden md:block">
  <Table>{/* Rows */}</Table>
</div>

{/* Mobile: Full-width cards */}
<div className="md:hidden space-y-3">
  {invoices.map(inv => (
    <Card className="p-4">
      {/* Invoice details stacked */}
    </Card>
  ))}
</div>
```

**Plan Toggle: Cards → Inline Buttons:**
```tsx
{/* Desktop: Card-based selection */}
<div className="grid grid-cols-3 gap-6">
  {plans.map(p => (
    <Card className={selected === p.id ? 'ring-2' : ''}>
      {/* Plan info */}
    </Card>
  ))}
</div>

{/* Mobile: Compact button tabs */}
<div className="md:hidden flex gap-2">
  {plans.map(p => (
    <Button
      key={p.id}
      variant={selected === p.id ? 'default' : 'outline'}
      className="flex-1 h-10 text-xs"
    >
      {p.name}
    </Button>
  ))}
</div>
```

### Touch Targets

- **Pricing cards:** Clickable button min 44px height
- **Feature rows mobile:** Full-width card, min 44px height
- **Meter controls:** 44px wide minimum, clear drag area
- **Invoice actions:** 44px height buttons
- **Plan toggle buttons:** 44px height minimum
- **Filter/sort controls:** 44px height

### Code Example

```tsx
import { useIsMobile } from '@/hooks/use-mobile';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

export const ResponsiveBillingPage = () => {
  const isMobile = useIsMobile();
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [period, setPeriod] = useState('monthly');

  return (
    <div className="min-h-screen bg-white p-4 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold">Pricing</h1>
          <p className="text-sm md:text-base text-gray-600">Choose your plan</p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center gap-3">
          <Button
            variant={period === 'monthly' ? 'default' : 'outline'}
            onClick={() => setPeriod('monthly')}
            className="h-10 md:h-11"
          >
            Monthly
          </Button>
          <Button
            variant={period === 'annual' ? 'default' : 'outline'}
            onClick={() => setPeriod('annual')}
            className="h-10 md:h-11"
          >
            Annual<span className="ml-2 text-xs">-20%</span>
          </Button>
        </div>

        {/* Pricing Cards: Grid → Snap-scroll */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PLANS.map(p => (
            <PricingCard key={p.id} plan={p} period={period} />
          ))}
        </div>

        <div className="md:hidden snap-x snap-mandatory overflow-x-auto flex gap-4 pb-4">
          {PLANS.map(p => (
            <div key={p.id} className="snap-center shrink-0 w-72">
              <PricingCard plan={p} period={period} />
            </div>
          ))}
        </div>

        {/* Feature Comparison */}
        <div className="mt-12 space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Features</h2>

          {/* Desktop: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-white text-left p-4">Feature</th>
                  {PLANS.map(p => (
                    <th key={p.id} className="text-center p-4">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map(f => (
                  <tr key={f.id} className="border-b">
                    <td className="sticky left-0 bg-white p-4 font-medium">{f.name}</td>
                    {PLANS.map(p => (
                      <td key={`${f.id}-${p.id}`} className="text-center p-4 text-sm">
                        {typeof p[f.id] === 'boolean' ? (
                          p[f.id] ? <Check className="w-5 h-5 text-green-600 mx-auto" /> : <X />
                        ) : (
                          p[f.id]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: Collapsible */}
          <div className="md:hidden space-y-3">
            {FEATURES.map(f => (
              <Collapsible key={f.id}>
                <CollapsibleTrigger className="w-full text-left p-3 bg-gray-50 rounded font-semibold text-sm">
                  {f.name}
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 space-y-2">
                  {PLANS.map(p => (
                    <div key={`${f.id}-${p.id}`} className="flex justify-between text-sm">
                      <span className="text-gray-600">{p.name}</span>
                      {typeof p[f.id] === 'boolean' ? (
                        p[f.id] ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-gray-300" />
                      ) : (
                        <span className="font-medium">{p[f.id]}</span>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>

        {/* Usage Meters */}
        <div className="mt-12 space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {METERS.map(m => (
              <Card key={m.id} className="p-4">
                <p className="text-sm font-medium text-gray-600 mb-3">{m.label}</p>
                <Progress value={(m.current / m.limit) * 100} className="h-2 mb-2" />
                <p className="text-xs text-gray-500">
                  {m.current} of {m.limit}
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* Invoices */}
        <div className="mt-12 space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Invoices</h2>

          {/* Desktop: Table */}
          <div className="hidden md:block">
            <Table>{/* Rows */}</Table>
          </div>

          {/* Mobile: Card list */}
          <div className="md:hidden space-y-3">
            {INVOICES.map(inv => (
              <Card key={inv.id} className="p-4">
                <div className="flex justify-between mb-3">
                  <span className="font-mono text-xs">{inv.id}</span>
                  <Badge className="text-xs">Paid</Badge>
                </div>
                <div className="space-y-1 text-sm text-gray-600 mb-3">
                  <p>{inv.date}</p>
                  <p className="font-semibold text-lg">${inv.amount}</p>
                </div>
                <Button size="sm" className="w-full h-10">Download</Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
```

### Mobile-Specific Considerations

- **Pricing cards:** snap-x snap-mandatory on mobile for smooth horizontal scroll
- **Feature table:** Switch to Collapsible accordion on mobile
- **Invoice table:** Convert to full-width cards on mobile
- **Usage meters:** Stack on mobile (1-col), 2x2 on md, 4-col on lg
- **Button heights:** h-10/h-11 (44px) on mobile, h-10 on desktop
- **Spacing:** p-4 on mobile, p-8-12 on desktop
- **Font sizes:** text-xs on sm, text-sm on md+

---


## References

Based on research from 2024-2025 industry standards:

- [12 SaaS Pricing Page Design Best Practices with Examples](https://www.designstudiouiux.com/blog/saas-pricing-page-design-best-practices/)
- [SaaS Pricing Page Design That Makes Your Potential Customers Convert](https://www.eleken.co/blog-posts/saas-pricing-page-design-8-best-practices-with-examples)
- [SaaS Pricing Pages: 15 Examples, Design Patterns, and What Actually Converts](https://pipelineroad.com/agency/blog/saas-pricing-pages)
- [What makes a good subscription plan UI?](https://www.glance.fyi/blog/subscription-plan-ui)
- [Subscription UX guidelines](https://shopify.dev/docs/storefronts/themes/pricing-payments/subscriptions/subscription-ux-guidelines)
- [Billing page design that converts: A guide - Stripe](https://stripe.com/resources/more/designing-a-billing-page-that-converts-tips-for-better-payment-experiences)
- [Designing Effective Pricing Plans UX — Smashing Magazine](https://www.smashingmagazine.com/2022/07/designing-better-pricing-page/)
- [Modal Design Best Practices for SaaS](https://userpilot.com/blog/modal-design/)
- [11 SaaS Upgrade Best Practices](https://bobcares.com/blog/saas-upgrade-best-practices/)
- [Stripe Billing Documentation](https://stripe.com/docs/billing)
