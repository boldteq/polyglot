# SaaS Landing Page Design Patterns

**Last updated: 2026-04-04**

Production-grade landing page components for Lovable/React/TypeScript projects. Built with shadcn/ui, Tailwind CSS, and Framer Motion. Copy-paste ready.

---

## Table of Contents

1. [Hero Section](#hero-section)
2. [Social Proof Bar](#social-proof-bar)
3. [Feature Grid](#feature-grid)
4. [How It Works Section](#how-it-works-section)
5. [Testimonials](#testimonials)
6. [Pricing Section](#pricing-section)
7. [CTA Section](#cta-section)
8. [Footer](#footer)
9. [Navbar](#navbar)
10. [Animation Hooks](#animation-hooks)

---

## Hero Section

### Pattern A: Centered Hero with Gradient

```typescript
// src/pages/LandingPage.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HeroSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  };

  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      {/* Background Gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent rounded-full blur-3xl dark:from-primary/10" />
        <div className="absolute top-2/3 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-blue-500/10 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center"
      >
        {/* Badge */}
        <motion.div variants={itemVariants}>
          <Badge variant="secondary" className="mb-6 inline-flex gap-2">
            <Sparkles className="w-3 h-3" />
            Now in Beta — Limited spots available
          </Badge>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={itemVariants}
          className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6"
        >
          <span className="block">Instantly rank</span>
          <span className="block bg-gradient-to-r from-primary via-blue-500 to-primary bg-clip-text text-transparent">
            top candidates
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          variants={itemVariants}
          className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8"
        >
          AI-powered resume screening that filters candidates in seconds, not days. Save time
          and hire smarter.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12"
        >
          <Button size="lg" className="gap-2 h-12 px-8 text-base">
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="lg" className="h-12 px-8 text-base">
            Watch Demo
          </Button>
        </motion.div>

        {/* Hero Image / Screenshot */}
        <motion.div
          variants={itemVariants}
          className="relative"
        >
          <div className="rounded-2xl border border-muted-foreground/20 bg-muted/30 overflow-hidden shadow-2xl">
            <div className="aspect-video bg-gradient-to-br from-primary/10 to-blue-500/10 flex items-center justify-center">
              <div className="text-muted-foreground text-center">
                <svg
                  className="w-16 h-16 mx-auto mb-4 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m12 19l9 2-9-18-9 18 9-2zm0 0v-8m0 8l-6 2m6-2l6 2m-12-2v8"
                  />
                </svg>
                <p className="text-sm">Product Screenshot</p>
              </div>
            </div>
          </div>

          {/* Floating Cards */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="hidden lg:block absolute -left-20 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-xl p-4 shadow-xl border border-muted-foreground/10"
          >
            <p className="text-xs font-medium text-muted-foreground mb-2">Processing</p>
            <p className="text-sm font-semibold">15 resumes</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="hidden lg:block absolute -right-20 bottom-0 bg-white dark:bg-slate-900 rounded-xl p-4 shadow-xl border border-muted-foreground/10"
          >
            <p className="text-xs font-medium text-muted-foreground mb-2">Top Match</p>
            <p className="text-sm font-semibold">92% compatibility</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
```

### Pattern B: Split Hero (Text + Image)

```typescript
export function HeroSectionSplit() {
  const imageVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  };

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Badge variant="secondary" className="mb-6 inline-flex">
              Used by 1,000+ teams
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-6">
              <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
                Stop wasting time
              </span>
              on resume screening
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-md leading-relaxed">
              Our AI analyzes candidates 10x faster than manual review, surfacing your best
              matches instantly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg">Start Free Trial</Button>
              <Button variant="outline" size="lg">
                Schedule Demo
              </Button>
            </div>
          </motion.div>

          {/* Right: Image */}
          <motion.div
            variants={imageVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-blue-500/10 aspect-square flex items-center justify-center border border-muted-foreground/10">
              <p className="text-muted-foreground">Product Screenshot</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
```

### Pattern C: Product Screenshot Focus

```typescript
export function HeroSectionWithProduct() {
  return (
    <section className="relative overflow-hidden pt-24 pb-20 sm:pt-32 sm:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground mb-4">
            Resume ranking made simple
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Paste a job description, upload resumes, get ranked results in seconds.
          </p>
        </motion.div>

        {/* Interactive Product Screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="relative"
        >
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-muted-foreground/10 bg-muted/20">
            <div className="relative aspect-video bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900">
              {/* Simulated Product Interface */}
              <div className="p-6 h-full flex flex-col">
                <div className="flex gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 bg-white/5 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Decorative Elements */}
          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10" />
          <div className="absolute -top-20 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -z-10" />
        </motion.div>
      </div>
    </section>
  );
}
```

---

## Social Proof Bar

### Component Code

```typescript
// src/components/SocialProofBar.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

export interface SocialProofBarProps {
  logos?: Array<{ name: string; url: string }>;
  stats?: Array<{ label: string; value: string }>;
  autoScroll?: boolean;
}

export function SocialProofBar({
  logos = [
    { name: 'Company A', url: '' },
    { name: 'Company B', url: '' },
    { name: 'Company C', url: '' },
    { name: 'Company D', url: '' },
    { name: 'Company E', url: '' },
  ],
  stats = [
    { label: 'Active Users', value: '10,000+' },
    { label: 'Uptime', value: '99.9%' },
    { label: 'Rating', value: '4.8/5' },
  ],
  autoScroll = true,
}: SocialProofBarProps) {
  return (
    <section className="py-12 border-y border-muted-foreground/10 bg-muted/30 dark:bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Logos Section */}
        {logos.length > 0 && (
          <div className="mb-12">
            <p className="text-center text-sm font-semibold text-muted-foreground mb-6">
              Trusted by teams at leading companies
            </p>
            <div className={cn(
              'flex items-center justify-center gap-8 flex-wrap',
              autoScroll && 'overflow-hidden'
            )}>
              {autoScroll ? (
                <motion.div
                  animate={{ x: [0, -1000] }}
                  transition={{
                    duration: 30,
                    repeat: Infinity,
                    repeatType: 'loop',
                  }}
                  className="flex gap-12"
                >
                  {[...logos, ...logos].map((logo, idx) => (
                    <div
                      key={`${logo.name}-${idx}`}
                      className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <p className="text-sm font-medium text-foreground">{logo.name}</p>
                    </div>
                  ))}
                </motion.div>
              ) : (
                logos.map((logo) => (
                  <div key={logo.name} className="opacity-60 hover:opacity-100 transition-opacity">
                    <p className="text-sm font-medium text-foreground">{logo.name}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Stats Section */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Review Star Rating */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">4.8 out of 5</span> from 500+ reviews
          </p>
        </div>
      </div>
    </section>
  );
}
```

---

## Feature Grid

### Component Code

```typescript
// src/components/FeatureGrid.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import {
  Zap,
  Brain,
  Shield,
  Smartphone,
  Gauge,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface FeatureGridProps {
  title?: string;
  subtitle?: string;
  features?: Feature[];
  columns?: 2 | 3 | 4;
  layout?: 'grid' | 'bento';
}

const defaultFeatures: Feature[] = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Analyze 100 resumes in under 30 seconds with GPU-accelerated processing.',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description: 'GPT-4o analyzes skills, experience, and cultural fit automatically.',
  },
  {
    icon: Shield,
    title: 'Secure',
    description: 'GDPR compliant with end-to-end encryption for all candidate data.',
  },
  {
    icon: Smartphone,
    title: 'Mobile Ready',
    description: 'Access rankings and candidate details from any device, anytime.',
  },
  {
    icon: Gauge,
    title: 'Customizable',
    description: 'Set your own scoring weights for must-haves, nice-to-haves, and optional skills.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Share rankings with your team and collaborate on hiring decisions.',
  },
];

export function FeatureGrid({
  title = 'Powerful Features',
  subtitle = 'Everything you need to hire smarter',
  features = defaultFeatures,
  columns = 3,
  layout = 'grid',
}: FeatureGridProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: 'easeOut' },
    },
  };

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            {title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {subtitle}
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className={cn(
            'grid gap-6 sm:gap-8',
            layout === 'grid' && {
              'grid-cols-1 md:grid-cols-2 lg:grid-cols-3': columns === 3,
              'grid-cols-1 md:grid-cols-2': columns === 2,
              'grid-cols-1 md:grid-cols-2 lg:grid-cols-4': columns === 4,
            }
          )}
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                className="group relative rounded-lg border border-muted-foreground/10 bg-muted/50 dark:bg-muted/30 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10"
              >
                {/* Icon */}
                <div className="mb-4 inline-block rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-6 w-6 text-primary" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover Indicator */}
                <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
```

### Bento Grid Layout

```typescript
export function FeatureGridBento({
  title = 'Powerful Features',
  subtitle = 'Everything you need to hire smarter',
  features = defaultFeatures,
}: Omit<FeatureGridProps, 'columns' | 'layout'>) {
  const bentoItems = [
    { span: 'col-span-2', size: 'lg' as const },
    { span: 'col-span-1', size: 'sm' as const },
    { span: 'col-span-1', size: 'sm' as const },
    { span: 'col-span-1', size: 'sm' as const },
    { span: 'col-span-1', size: 'sm' as const },
    { span: 'col-span-2', size: 'lg' as const },
  ];

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            {title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {subtitle}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 auto-rows-[300px] md:auto-rows-[250px]">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            const bentoItem = bentoItems[idx % bentoItems.length];

            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.6 }}
                viewport={{ once: true }}
                className={cn(
                  bentoItem.span,
                  'group relative rounded-lg border border-muted-foreground/10 bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/10 p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 flex flex-col justify-between'
                )}
              >
                <div className="mb-4 inline-block rounded-lg bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors w-fit">
                  <Icon className="h-6 w-6 text-primary" />
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

---

## How It Works Section

### Component Code

```typescript
// src/components/HowItWorks.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Step {
  number: string;
  title: string;
  description: string;
  details?: string[];
}

export interface HowItWorksProps {
  title?: string;
  steps?: Step[];
}

const defaultSteps: Step[] = [
  {
    number: '1',
    title: 'Paste Job Description',
    description: 'Enter the job title, required skills, and desired experience.',
    details: ['Supports copy-paste', 'Auto-parsing', 'Edit anytime'],
  },
  {
    number: '2',
    title: 'Upload Resumes',
    description: 'Drag and drop resumes in PDF, DOCX, or TXT format.',
    details: ['Batch upload', '10MB max per file', 'Up to 100 files'],
  },
  {
    number: '3',
    title: 'Get Rankings',
    description: 'AI analyzes and ranks candidates by fit and compatibility.',
    details: ['30 seconds or less', 'Detailed scoring', 'Exportable'],
  },
];

export function HowItWorks({
  title = 'How It Works',
  steps = defaultSteps,
}: HowItWorksProps) {
  return (
    <section className="py-20 sm:py-28 bg-muted/30 dark:bg-muted/10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-center mb-16"
        >
          {title}
        </motion.h2>

        {/* Desktop: Horizontal Layout */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Connecting Line */}
            <div className="absolute top-12 left-12 right-12 h-1 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 -z-10" />

            <div className="grid grid-cols-3 gap-8">
              {steps.map((step, idx) => (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.2, duration: 0.6 }}
                  viewport={{ once: true }}
                  className="relative"
                >
                  {/* Number Badge */}
                  <div className="mb-6 flex items-center justify-center">
                    <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary bg-background">
                      <span className="text-4xl font-bold text-primary">
                        {step.number}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-foreground text-center mb-3">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-center text-sm mb-6">
                    {step.description}
                  </p>

                  {/* Details */}
                  {step.details && (
                    <ul className="space-y-2">
                      {step.details.map((detail) => (
                        <li key={detail} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: Vertical Layout */}
        <div className="md:hidden space-y-8">
          {steps.map((step, idx) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.2, duration: 0.6 }}
              viewport={{ once: true }}
              className="relative pl-16"
            >
              {/* Vertical Line & Circle */}
              <div className="absolute left-6 top-12 -bottom-8 w-1 bg-primary/20" />
              <div className="absolute left-0 top-0 h-12 w-12 rounded-full border-4 border-primary bg-background flex items-center justify-center">
                <span className="font-bold text-primary">{step.number}</span>
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {step.title}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                {step.description}
              </p>

              {/* Details */}
              {step.details && (
                <ul className="space-y-1">
                  {step.details.map((detail) => (
                    <li key={detail} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 text-primary flex-shrink-0" />
                      {detail}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

---

## Testimonials

### Component Code

```typescript
// src/components/Testimonials.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  rating: number;
  image?: string;
}

export interface TestimonialsProps {
  title?: string;
  testimonials?: Testimonial[];
  layout?: 'grid' | 'carousel';
}

const defaultTestimonials: Testimonial[] = [
  {
    quote: 'We went from reviewing 50 resumes manually to using AI. It saved us 20 hours per hiring cycle.',
    author: 'Sarah Johnson',
    role: 'Head of Recruiting',
    company: 'TechCorp',
    rating: 5,
  },
  {
    quote: 'The accuracy of candidate matching is impressive. We found candidates we would have missed otherwise.',
    author: 'Michael Chen',
    role: 'Engineering Manager',
    company: 'StartupXYZ',
    rating: 5,
  },
  {
    quote: 'Simple, fast, and effective. This tool has become essential to our hiring process.',
    author: 'Emma Rodriguez',
    role: 'Talent Acquisition Lead',
    company: 'Growth Inc',
    rating: 5,
  },
];

export function Testimonials({
  title = 'Loved by Recruiters',
  testimonials = defaultTestimonials,
  layout = 'grid',
}: TestimonialsProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6 },
    },
  };

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground text-center mb-16"
        >
          {title}
        </motion.h2>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className={cn(
            layout === 'grid' && 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
          )}
        >
          {testimonials.map((testimonial) => (
            <motion.div
              key={`${testimonial.author}-${testimonial.company}`}
              variants={itemVariants}
              className="rounded-lg border border-muted-foreground/10 bg-muted/50 dark:bg-muted/30 p-6 hover:border-primary/30 transition-all duration-300"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-foreground mb-6 leading-relaxed italic">
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-blue-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {testimonial.author}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {testimonial.role} at {testimonial.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

---

## Pricing Section

### Component Code

```typescript
// src/components/PricingSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PricingPlan {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  credits: number;
  features: string[];
  highlighted?: boolean;
  cta?: string;
}

export interface PricingSectionProps {
  title?: string;
  subtitle?: string;
  plans?: PricingPlan[];
}

const defaultPlans: PricingPlan[] = [
  {
    name: 'Free',
    description: 'Perfect for getting started',
    monthlyPrice: 0,
    annualPrice: 0,
    credits: 50,
    features: ['50 resume scans/month', 'Basic scoring', 'Email support'],
    cta: 'Get Started',
  },
  {
    name: 'Pro',
    description: 'For growing teams',
    monthlyPrice: 29,
    annualPrice: 290,
    credits: 500,
    features: ['500 resume scans/month', 'Advanced scoring', 'Custom weights', 'Team collaboration', 'Priority support'],
    highlighted: true,
    cta: 'Start Free Trial',
  },
  {
    name: 'Enterprise',
    description: 'For large organizations',
    monthlyPrice: 0,
    annualPrice: 0,
    credits: 0,
    features: ['Unlimited scans', 'Custom API', 'Dedicated support', 'SLA guarantee', 'On-premise option'],
    cta: 'Contact Sales',
  },
];

export function PricingSection({
  title = 'Simple, Transparent Pricing',
  subtitle = 'No surprises. Cancel anytime.',
  plans = defaultPlans,
}: PricingSectionProps) {
  const [annual, setAnnual] = React.useState(true);

  return (
    <section className="py-20 sm:py-28 bg-muted/30 dark:bg-muted/10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            {title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            {subtitle}
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                'text-sm font-medium transition-colors',
                !annual ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(!annual)}
              className={cn(
                'relative h-8 w-14 rounded-full transition-colors',
                annual ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div className={cn(
                'absolute top-1 h-6 w-6 rounded-full bg-white transition-transform',
                annual && 'translate-x-7'
              )} />
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                'text-sm font-medium transition-colors',
                annual ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              Annual
              <Badge variant="secondary" className="ml-2 text-xs">
                Save 20%
              </Badge>
            </button>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan, idx) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
              className={cn(
                'rounded-lg border transition-all duration-300',
                plan.highlighted
                  ? 'border-primary bg-background shadow-lg ring-1 ring-primary/50 scale-105 md:scale-110'
                  : 'border-muted-foreground/10 bg-muted/50 dark:bg-muted/30 hover:border-primary/30'
              )}
            >
              <div className="p-8">
                {/* Header */}
                <h3 className="text-2xl font-bold text-foreground mb-2">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-foreground">
                      ${annual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  {plan.monthlyPrice > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {annual ? `$${plan.annualPrice}/year` : 'Cancel anytime'}
                    </p>
                  )}
                </div>

                {/* CTA */}
                <Button
                  className="w-full mb-8"
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  {plan.cta}
                </Button>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

---

## CTA Section

### Component Code

```typescript
// src/components/CTASection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export interface CTASectionProps {
  title?: string;
  subtitle?: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

export function CTASection({
  title = 'Ready to get started?',
  subtitle = 'Join hundreds of recruiters saving time with AI-powered resume screening.',
  primaryCta = { label: 'Start Free Trial', href: '/signup' },
  secondaryCta = { label: 'Schedule Demo', href: '/demo' },
}: CTASectionProps) {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-blue-500/20" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
        className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center"
      >
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          {title}
        </h2>
        <p className="text-xl text-muted-foreground mb-8 max-w-lg mx-auto">
          {subtitle}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" className="gap-2">
            {primaryCta.label}
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button size="lg" variant="outline">
            {secondaryCta.label}
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
```

---

## Footer

### Component Code

```typescript
// src/components/Footer.tsx
import React from 'react';
import { Github, Twitter, Linkedin } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-muted-foreground/10 bg-muted/50 dark:bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
          {/* Product */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Product</h4>
            <ul className="space-y-2">
              {['Features', 'Pricing', 'Security', 'Changelog'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Company</h4>
            <ul className="space-y-2">
              {['About', 'Blog', 'Careers', 'Contact'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Resources</h4>
            <ul className="space-y-2">
              {['Documentation', 'API', 'Status', 'Help Center'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Legal</h4>
            <ul className="space-y-2">
              {['Privacy', 'Terms', 'Cookie Policy', 'GDPR'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-muted-foreground/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {year} Resume Ranker. All rights reserved.
          </p>

          {/* Social Icons */}
          <div className="flex gap-4">
            {[
              { icon: Github, href: '#', label: 'GitHub' },
              { icon: Twitter, href: '#', label: 'Twitter' },
              { icon: Linkedin, href: '#', label: 'LinkedIn' },
            ].map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={label}
              >
                <Icon className="w-5 h-5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
```

---

## Navbar

### Component Code

```typescript
// src/components/Navbar.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScrollPosition } from '@/hooks/useScrollPosition';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const scrollPosition = useScrollPosition();
  const isScrolled = scrollPosition > 50;

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'About', href: '#about' },
    { label: 'Docs', href: '#docs' },
  ];

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled
          ? 'bg-background/80 backdrop-blur-md border-b border-muted-foreground/10 py-4'
          : 'bg-transparent py-6'
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="text-xl font-bold text-foreground">
          Resume Ranker
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex gap-3 items-center">
          <Button variant="ghost">Sign In</Button>
          <Button>Get Started</Button>
        </div>

        {/* Mobile Menu */}
        <div className="md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <div className="space-y-4 mt-8">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="pt-4 border-t border-muted-foreground/10 space-y-2">
                  <Button variant="ghost" className="w-full">
                    Sign In
                  </Button>
                  <Button className="w-full">Get Started</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.nav>
  );
}
```

---

## Animation Hooks

### Scroll Animation Hook

```typescript
// src/hooks/useScrollPosition.ts
import { useState, useEffect } from 'react';

export function useScrollPosition() {
  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return scrollPosition;
}

// Usage:
// const scrollPosition = useScrollPosition();
// const isScrolled = scrollPosition > 50;
```

### Fade-In on Scroll Hook

```typescript
// src/hooks/useInView.ts
import { useEffect, useRef, useState } from 'react';

export function useInView(options = {}) {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.1, ...options });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [options]);

  return [ref, isInView] as const;
}

// Usage:
// const [ref, isInView] = useInView();
// <motion.div ref={ref} animate={isInView ? "visible" : "hidden"} />
```

### Counter Animation Hook

```typescript
// src/hooks/useCounter.ts
import { useEffect, useRef, useState } from 'react';

export function useCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const animationRef = useRef<number>();

  useEffect(() => {
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const newCount = Math.floor(target * progress);

      if (newCount !== countRef.current) {
        countRef.current = newCount;
        setCount(newCount);
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [target, duration]);

  return count;
}

// Usage:
// const userCount = useCounter(10000);
// <span>{userCount.toLocaleString()}</span>
```

---

## Complete Landing Page Example

```typescript
// src/pages/LandingPage.tsx
import React from 'react';
import { Navbar } from '@/components/Navbar';
import { HeroSection } from '@/components/HeroSection';
import { SocialProofBar } from '@/components/SocialProofBar';
import { FeatureGrid } from '@/components/FeatureGrid';
import { HowItWorks } from '@/components/HowItWorks';
import { Testimonials } from '@/components/Testimonials';
import { PricingSection } from '@/components/PricingSection';
import { CTASection } from '@/components/CTASection';
import { Footer } from '@/components/Footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <HeroSection />

      {/* Social Proof */}
      <SocialProofBar
        stats={[
          { label: 'Active Users', value: '10,000+' },
          { label: 'Resumes Processed', value: '1M+' },
          { label: 'Avg Time Saved', value: '20hrs/hire' },
        ]}
      />

      {/* Features */}
      <FeatureGrid />

      {/* How It Works */}
      <HowItWorks />

      {/* Testimonials */}
      <Testimonials />

      {/* Pricing */}
      <PricingSection />

      {/* CTA */}
      <CTASection />

      {/* Footer */}
      <Footer />
    </main>
  );
}
```

---

## Implementation Checklist

- [ ] Copy all component files to `src/components/`
- [ ] Copy animation hooks to `src/hooks/`
- [ ] Install Framer Motion: `npm install framer-motion`
- [ ] Test hero section with different viewport sizes
- [ ] Verify Framer Motion animations run smoothly (60fps)
- [ ] Test scroll animations trigger correctly
- [ ] Verify dark mode looks good on all sections
- [ ] Test mobile responsiveness (320px - 1920px)
- [ ] Test accessibility: tab navigation, focus states, color contrast
- [ ] Optimize hero image/screenshot for web
- [ ] Set up analytics tracking for CTA clicks
- [ ] Run `npm run build` to verify no type errors
- [ ] Run Lighthouse audit — aim for 90+ on all categories
- [ ] Test on real mobile devices (iOS/Android)

---

## Performance Tips

1. **Lazy load components** — use React.lazy() for below-the-fold sections
2. **Optimize images** — use WebP with fallbacks, set loading="lazy"
3. **Code split CSS** — use Tailwind's @layer to minimize critical CSS
4. **Cache animations** — wrap animations in useMemo if expensive
5. **Debounce scroll** — throttle useScrollPosition to 60fps max
6. **Preload fonts** — add <link rel="preload"> for custom fonts

---

## References

- [Framer Motion Scroll Animations](https://www.framer.com/motion/scroll-animations/)
- [SaaS Landing Page Best Practices](https://www.designstudiouiux.com/blog/saas-landing-page-design/)
- [Motion.dev Documentation](https://motion.dev/docs)
- [React Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [Tailwind CSS Responsive Design](https://tailwindcss.com/docs/responsive-design)

---

## Dark Mode Implementation

### Color Mapping
```tsx
// Light mode → Dark mode token mapping for landing pages
// These follow design-tokens.md and dark-mode.md standards

// Backgrounds
bg-white          → dark:bg-gray-950
bg-gray-50        → dark:bg-gray-900
bg-gray-100       → dark:bg-gray-800

// Text
text-gray-900     → dark:text-gray-50
text-gray-700     → dark:text-gray-300
text-gray-500     → dark:text-gray-400

// CTAs
bg-primary        → dark:bg-primary (use semantic)
```

### Key Dark Mode Rules for Landing Pages
- Use semantic color tokens (`bg-background`, `text-foreground`) not raw colors
- Hero background: `bg-white dark:bg-gray-950` or gradient-aware
- Feature cards: `bg-card dark:bg-gray-900` with `border border-border`
- CTA buttons: maintain `bg-primary` contrast in both themes
- Test: switch to dark mode → readable text, visible cards, proper contrast, no white backgrounds

---

## Responsive Behavior

### Breakpoint Strategy
```tsx
// Mobile-first responsive for landing pages
// sm: 640px | md: 768px | lg: 1024px | xl: 1280px

// Layout shifts:
// Mobile (< 640px):      stacked sections, smaller hero text, full-width CTA buttons
// Tablet (640-1023px):   2-column feature grid, hero with wrapped text
// Desktop (1024px+):     3-column features, hero with side image, max-w-7xl constraint
```

### Key Responsive Rules for Landing Pages
- Touch targets: min 44x44px on mobile
- Hero title: `text-2xl sm:text-4xl lg:text-6xl`
- Feature grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- CTA buttons: `w-full sm:w-auto`
- Section padding: `px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16`
- Hero image: `hidden sm:block` or `h-full` on desktop
