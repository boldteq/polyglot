# Shopify App Design Phase — Complete Technical Extract

**Source:** [Shopify.dev App Design Guidelines](https://shopify.dev/docs/apps/design)

**Last Updated:** April 2026

---

## Table of Contents

1. [Design Guidelines Overview](#design-guidelines-overview)
2. [Navigation](#navigation)
3. [App Structure & Layout](#app-structure--layout)
4. [Admin UI (Polaris Components & Patterns)](#admin-ui-polaris-components--patterns)
5. [Checkout UI Extensions](#checkout-ui-extensions)
6. [Theme App Extensions (Online Store)](#theme-app-extensions-online-store)
7. [Point of Sale (POS) Extensions](#point-of-sale-pos-extensions)
8. [Merchant Onboarding](#merchant-onboarding)
9. [Empty States](#empty-states)
10. [Error Handling & Alerts](#error-handling--alerts)
11. [Loading States & Skeleton Screens](#loading-states--skeleton-screens)
12. [Accessibility (WCAG AA Compliance)](#accessibility-wcag-aa-compliance)
13. [Responsive Design (Mobile/Tablet)](#responsive-design-mobiletablet)
14. [Embedded Apps & App Bridge](#embedded-apps--app-bridge)
15. [Notifications, Toasts & Banners](#notifications-toasts--banners)
16. [Data Visualization & Metrics](#data-visualization--metrics)
17. [Performance Optimization](#performance-optimization)
18. [Visual Design (Color, Typography)](#visual-design-color-typography)
19. [Content Guidelines & Microcopy](#content-guidelines--microcopy)
20. [Interaction Patterns (Buttons, Forms, Modals)](#interaction-patterns-buttons-forms-modals)

---

## Design Guidelines Overview

**Reference:** [App Design Guidelines](https://shopify.dev/docs/apps/design)

### Core Design Principles

1. **Built for Shopify Standards**
   - Follow guidelines to achieve "Built for Shopify" status (preferential App Store treatment).
   - Meets strict design quality and trust standards.
   - Signals merchant confidence and predictability.

2. **Mobile-First Design**
   - Majority of online store traffic is mobile; prioritize mobile UX throughout design process.
   - Design must adapt seamlessly to all device sizes.
   - All core functionality must work on mobile devices.

3. **Accessibility & Inclusive Design**
   - All apps must follow WCAG accessibility best practices.
   - Support for assistive technology is essential.
   - Use semantic HTML, proper color contrast, keyboard navigation.

4. **Merchant Experience**
   - Apps should look and behave like the rest of Shopify admin.
   - Predictable workflows build trust.
   - Use Polaris components for admin-embedded apps (not custom design systems).

### Implementation Path

- Use **Shopify App Bridge** for seamless admin integration.
- Use **Polaris** design system + components for admin UI.
- Follow **App Design Guidelines** for consistency.
- Test for **Lighthouse performance** (max -10 point penalty).
- Verify **accessibility compliance** (WCAG AA minimum).

---

## Navigation

**Reference:** [Navigation Guidelines](https://shopify.dev/docs/apps/design/navigation)

### App Nav (Sidebar/Header)

1. **Placement**
   - Desktop: Sidebar in Shopify admin
   - Mobile: Header in Shopify mobile app

2. **Navigation Item Rules**
   - Keep items **short and scannable** (use nouns, not verbs)
   - Max **20 characters** per app name (truncates beyond)
   - Max **7 items** before "View more" button activation
   - Items 7+ are collapsed into truncation

3. **Navigation Icon Requirements**
   - Provide dedicated icon for app nav
   - Gray when inactive, green when active
   - Should be clear and recognizable at small sizes

4. **Secondary Navigation (Tabs)**
   - Use tabs sparingly for secondary-level navigation
   - Tabs change only content **below** them (never above)
   - **Never allow tabs to wrap** to multiple lines
   - Navigating tabs should **not reposition tab bar**

5. **Label Best Practices**
   - Use strong, actionable verbs
   - Keep labels concise and scannable
   - Avoid jargon or merchant-unfamiliar terminology

---

## App Structure & Layout

**Reference:** [App Structure](https://shopify.dev/docs/apps/design/app-structure) | [Layout](https://shopify.dev/docs/apps/design/layout)

### Available Layout Types

1. **Single-Column Layout**
   - Use for linear workflows with single obvious task
   - Encourages top-to-bottom scanning
   - Best for onboarding, forms, setup flows

2. **Full-Width Layout**
   - Use for resource index pages (lists, tables)
   - Handles many columns of data
   - Maximizes space for data tables and grids

3. **Two-Column Layout**
   - Use for visual editors or split views
   - Preview pane + editor panel
   - Allow merchants to see real-time changes

4. **Settings Layout**
   - Use for app configuration/preferences
   - Group related settings logically
   - Build using settings pattern composition

5. **App Window** (Immersive)
   - Full-screen focused environment for specific tasks
   - Top bar element + app body container
   - Removes all adjacent admin UI distractions

### Core Components

- **Polaris Page component:** Offers built-in responsive layouts
  - `aside` slot has responsive built-in behavior
  - Auto-adapts content area for small screens
- **Polaris Grid component:** For custom responsive handling
- **Polaris Stack component:** For simplified spacing in layouts

### Responsiveness Rules

1. Polaris Page provides automatic responsiveness for sidebar (aside slot).
2. Grid component allows bespoke responsive design.
3. All layouts must be mobile-first and work on small screens.
4. Test at multiple breakpoints (mobile, tablet, desktop).

---

## Admin UI (Polaris Components & Patterns)

**Reference:** [Polaris Design System](https://shopify.dev/docs/apps/tools/polaris) | [Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components) | [Patterns](https://shopify.dev/docs/api/app-home/patterns)

### Polaris Overview

1. **Purpose & Scope**
   - Unified UI framework built on web components
   - Consistent experience across all Shopify surfaces
   - Single source of truth for colors, typography, spacing, shadows, borders, icons

2. **Mandatory Use**
   - **All admin-embedded apps must use Polaris**
   - Do not create custom design systems
   - Do not use Tailwind or other CSS frameworks for admin UI
   - Shopify App Store reviewers reject non-native apps

3. **Component Categories**

   **Layout Components:**
   - Page, Layout, Layout.Section
   - Stack (horizontal/vertical spacing)
   - Grid (multi-column layouts)
   - Card (content containers)

   **Navigation:**
   - App Nav, Nav Menu
   - Tabs

   **Data Presentation:**
   - Table, IndexTable (complex data)
   - ResourceList
   - DataTable (summary data)
   - Metrics Card (dashboards)

   **Forms & Input:**
   - TextField, SelectField, DateField, MoneyField
   - Checkbox, RadioButton, ToggleButton
   - Form (wrapper with submit/cancel actions)

   **Feedback & Status:**
   - Banner (success/warning/error/info)
   - Toast API
   - Modal API
   - SkeletonText, SkeletonImage
   - EmptyState

   **Actions:**
   - Button (primary/secondary/critical/tertiary)
   - ButtonGroup
   - ActionList

4. **Common Compositions**
   - Empty State (centered content + CTA)
   - Settings Pattern (grouped related settings)
   - Setup Guide (interactive checklist with progress)
   - Metrics Card (dashboard KPI display)

5. **Design Tokens**
   - All spacing, colors, typography, shadows pre-defined
   - Use design system tokens, never hardcoded values
   - Ensure consistency across platform

---

## Checkout UI Extensions

**Reference:** [Checkout UI Extensions Components](https://shopify.dev/docs/api/checkout-ui-extensions/latest/components) | [Polaris Web Components in Checkout](https://shopify.dev/docs/api/checkout-ui-extensions/2026-04-rc/using-polaris-components)

### Overview

1. **Purpose**
   - Add custom workflows at defined checkout points
   - Built using target APIs and UI components
   - Provide consistent, accessible, performant interface

2. **Technology**
   - Polaris web components available for checkout context
   - Custom HTML elements (web components) standard
   - Consistent with Checkout design system

### Available Form Components

1. **Date Field**
   - Captures date input with consistent interface
   - Built-in validation and date selection UI

2. **Date Picker**
   - Calendar-based date selection interface
   - Merchant date selection workflows

3. **Email Field**
   - Email address input capture
   - Built-in email validation

4. **Money Field**
   - Monetary value collection
   - Built-in currency formatting
   - Automatic validation

### Layout Components

1. **Box**
   - Generic flexible container
   - Custom designs and layouts
   - Flexible styling

2. **Grid**
   - Matrix of rows and columns
   - Responsive page layouts
   - Alignment control

3. **Stack**
   - Horizontal/vertical element organization
   - Block or inline axis alignment
   - Built-in spacing

### Critical Constraints

1. **Bundle Size Limit: 64 KB**
   - Strictly enforced at deployment
   - Includes all code and dependencies
   - Violation = deployment blocked
   - Critical for checkout performance

2. **Performance Requirements**
   - Keep response times < 1 second
   - Use skeleton components during loading
   - Avoid blocking checkout flow

3. **User Experience**
   - Don't create unexpected form fields
   - Match checkout design system
   - Minimal, focused extensions

---

## Theme App Extensions (Online Store)

**Reference:** [UX for Theme App Extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/ux)

### Overview

1. **What They Are**
   - App blocks added to Online Store 2.0 themes
   - Appear directly in merchant storefront
   - Customer-facing and merchant-facing interfaces

2. **Core Design Principles**

   **Responsive Design:**
   - Blocks responsive to containing section size
   - Adapt gracefully to all screen widths
   - Test at mobile, tablet, desktop

   **Design Inheritance:**
   - App blocks inherit theme typography
   - App blocks inherit theme colors
   - App blocks inherit theme spacing
   - Blocks integrate seamlessly with theme

   **Content Sync:**
   - Use autofill resource settings
   - Content auto-syncs with parent section
   - Ensures data consistency

3. **Header Section Integration**

   **Icon + Text Versions:**
   - Provide both icon-only and text versions
   - Allows inline header integration
   - Maintains visual consistency with header elements

4. **Merchant Onboarding**

   **App Store Listing:**
   - Indicate if requires Online Store 2.0 theme
   - Prevent installations on incompatible themes
   - Clear capability communication

   **Admin Post-Installation:**
   - Provide clear onboarding instructions
   - Guide merchants through app setup
   - Show where blocks appear in theme

5. **Device Consistency**
   - Maintain UI consistency across desktop, tablet, mobile
   - Test all breakpoints
   - Ensure touch targets are appropriately sized

---

## Point of Sale (POS) Extensions

**Reference:** [Extending Shopify POS](https://shopify.dev/docs/apps/build/pos) | [POS UI Extensions](https://shopify.dev/docs/api/pos-ui-extensions/latest)

### Overview

1. **Capabilities**
   - Add custom functionality directly into POS interface
   - Example: Loyalty program enrollment at checkout
   - Example: Custom discounts based on cart contents
   - Extension-only apps possible (all code runs in extension)

2. **Technical Advantages**
   - Render as native components (faster)
   - Auto-match Shopify design system
   - Receive automatic updates
   - Pre-built components and targets
   - Identical iOS + Android experience

### Design Requirements

1. **Responsive Design**
   - Use Figma UI kit for design
   - Design for multiple screen sizes from start
   - Mobile-first approach mandatory

2. **Touch Targets**
   - Minimum 44×44 pixels for all interactive elements
   - Critical for retail point-of-sale usage
   - Must work with gloved hands, touch pens

3. **Spacing Requirements**
   - Maintain minimum 8 pixels between touch targets
   - Prevents accidental button presses
   - Improves merchant accuracy

### Available UI Components

1. **Core Set**
   - Buttons, tiles, modals match POS design
   - Wide range of pre-built components
   - Component nesting supported
   - Combination and customization allowed

2. **Design System**
   - Components match Shopify POS design system
   - Consistent visual language
   - Professional appearance across devices

---

## Merchant Onboarding

**Reference:** [Onboarding Guidelines](https://shopify.dev/docs/apps/design/user-experience/onboarding) | [Setup Guide Pattern](https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide)

### Core Onboarding Principles

1. **Efficiency & Brevity**
   - Onboarding must be brief and direct
   - Present basics quickly
   - Avoid overwhelming merchants
   - Show value immediately

2. **Retention Impact**
   - Great onboarding = higher retention
   - Merchants understand app after completion
   - Clear next steps drive engagement
   - Discovery vs. guided experience critical

3. **Design Requirements**
   - **Built for Shopify:** App must have concise onboarding
   - **App Store Requirement:** Onboarding must sufficiently guide merchants
   - Complex setup can offer "complete later" option
   - Don't block merchant workflow

### Setup Guide Pattern (Composition)

1. **Purpose**
   - Interactive checklist with visual progress
   - Walk merchants through essential tasks
   - Suitable for onboarding or configuration

2. **Features**
   - Visual progress indicator
   - Checklist items
   - Primary and secondary actions
   - Clear task descriptions

3. **Best Practices**
   - Order tasks logically (prerequisites first)
   - Make each task self-contained
   - Provide context for why each step matters
   - Show progress to encourage completion

### Onboarding UX Pattern

1. **Step 1: Immediate Value**
   - Show what the app does
   - Demo key feature quickly
   - Don't ask for configuration first

2. **Step 2: Essential Config**
   - Connect integrations (if needed)
   - Set core functionality
   - Link accounts/APIs

3. **Step 3: Customization**
   - Fine-tune settings
   - Personalize behavior
   - Apply business logic

4. **Step 4: Launch**
   - Go live/activate
   - Show success state
   - Provide support resources

---

## Empty States

**Reference:** [Empty State Composition](https://shopify.dev/docs/api/app-home/patterns/compositions/empty-state)

### Empty State Pattern

1. **Purpose**
   - Displayed when list or page has no content
   - Guides merchants on next action
   - Provides clear context about section purpose

2. **Required Components**
   - **Centered content:** Clear visual hierarchy
   - **Explanation:** What will appear here?
   - **Primary action:** Main CTA (usually create/add)
   - **Secondary actions:** Optional next steps

3. **Implementation**
   - Use `slot="primary-action"` for main button
   - Use `slot="secondary-actions"` for additional options
   - Center content visually
   - Use Button Group for multiple actions

### Merchant App Blocks

1. **Empty State for App Blocks**
   - Blocks should have empty state when no content
   - Inform merchants about block purpose
   - Example: "No featured products selected. Add products to display."

2. **Placeholder Content**
   - Do NOT use Lorem Ipsum text
   - Do NOT use demo store content
   - Leverage existing store data where possible
   - Create ready-to-launch appearance

---

## Error Handling & Alerts

**Reference:** [Alerts & User Experience](https://shopify.dev/docs/apps/design/user-experience/alerts)

### Alert Types & Usage

1. **Task Alerts**
   - Give merchants direct, immediate feedback
   - Confirmation of completed actions
   - Status updates during processes

2. **Error Messaging Rules**

   **Don't Use Toasts For:**
   - Error messages (except persistent connection errors)
   - Critical information requiring acknowledgement
   - Complex error explanations

   **Don't Use Modals For:**
   - Error messages (only if modal itself is erroring)
   - Non-critical feedback
   - Excessive error notifications

3. **Success Banners**
   - Use green banners for success messages
   - Only use when feedback is delayed, persistent, or has CTA
   - Avoid success notifications for immediate actions
   - Include next steps if applicable

4. **Warning Banners**
   - Use yellow/warning color
   - Alert merchants to attention-needed items
   - Non-blocking issues

5. **Error Banners**
   - Use red/error color
   - For blocking or impossible actions
   - Clear explanation of what went wrong
   - Provide actionable next steps

### Error Handling Best Practices

1. **Message Clarity**
   - Explain what went wrong in merchant terms
   - Avoid technical jargon
   - Suggest recovery action

2. **Placement**
   - Inline validation for forms
   - Banners for page-level issues
   - Toasts for non-critical updates only

3. **Accessibility**
   - Associate errors with form fields
   - Use ARIA attributes for screen readers
   - Ensure error text is readable

---

## Loading States & Skeleton Screens

**Reference:** [Skeleton Components](https://shopify.dev/docs/api/checkout-ui-extensions/2025-04/components/feedback/skeletontext) | [Performance Best Practices](https://shopify.dev/docs/apps/build/performance/general-best-practices)

### Skeleton Screen Pattern

1. **Purpose**
   - Render approximate size/position of coming content
   - Seamless transition from skeleton to actual content
   - Prevent layout shift (CLS violation)
   - Improve perceived performance

2. **Shopify Skeleton Components**

   **SkeletonText**
   - Renders placeholder text
   - Optional content inside
   - Configurable dimensions

   **SkeletonImage**
   - Image placeholder
   - Configurable block and inline sizes
   - Maintains aspect ratio

3. **Implementation Pattern**
   ```
   if (isLoading) {
     render <SkeletonText /> or <SkeletonImage />
   } else {
     render actual content
   }
   ```

4. **Performance Targets**
   - Network: Keep response times under 1 second
   - Render skeleton immediately (don't block)
   - Switch to content as soon as data available
   - Smooth visual transition

### Loading State Best Practices

1. **Avoid Blocking**
   - Use skeleton loaders, never blank screens
   - Keep merchant engaged during load
   - Reduce perceived wait time

2. **Progressive Loading**
   - Load above-the-fold content first
   - Load remaining content progressively
   - Don't wait for all data before showing anything

3. **Error Handling**
   - Have fallback for network failures
   - Show error state if load takes too long
   - Provide retry mechanism

---

## Accessibility (WCAG AA Compliance)

**Reference:** [Accessibility Best Practices](https://shopify.dev/docs/apps/build/accessibility) | [Built for Shopify Requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)

### Core Accessibility Principle

**Accessible design allows use by everyone, including those with assistive technology (screen readers, voice control, keyboard navigation).**

### WCAG AA Requirements (Minimum Standard)

1. **Color Contrast (WCAG 1.4.3)**
   - Content-to-background contrast: **4.5:1 minimum**
   - Level AA compliance required
   - Affects readability for low-vision users
   - Test all text, buttons, icons, borders

2. **Keyboard Navigation**
   - Full app navigation via Tab/Shift+Tab keys
   - No custom tabindex beyond 0 or -1
   - No autofocus attributes
   - Logical tab order matching visual flow
   - Esc key closes modals/drawers

3. **Focus Management**
   - When modal/drawer opens: focus moves to labeling element
   - Keyboard navigation confined to open modal/drawer
   - Focus returns to launcher on close/dismiss
   - Visible focus indicator on all interactive elements

4. **Screen Reader Support**
   - Use semantic HTML elements
   - Provide descriptive labels and ARIA attributes
   - Context and purpose clear to screen readers
   - Form fields have associated labels
   - Error messages associated with fields

5. **Heading Structure (h1-h6)**
   - Use heading tags to communicate content organization
   - Heading sequence must be logical (h1 > h2 > h3, not h1 > h3)
   - No skipped heading levels
   - Single h1 per page

6. **Form Accessibility**
   - All inputs have associated labels
   - Form error messages linked to fields
   - Required fields clearly marked
   - Validation messages accessible to screen readers

7. **Text Alternatives**
   - Images have alt text
   - Icons have labels or aria-labels
   - Decorative elements marked as such

8. **Motion & Animation**
   - Respect `prefers-reduced-motion` setting
   - No auto-playing animations or videos
   - No flashing content (triggers seizures)

### Testing Strategy

1. **Automated Testing**
   - Use accessibility auditors (Lighthouse, aXe)
   - Regular CI/CD checks
   - Fix high-severity issues first

2. **Manual Testing**
   - Test keyboard-only navigation
   - Test with screen reader (NVDA, JAWS, VoiceOver)
   - Test with zoom at 200%
   - Test color contrast with tools

3. **Built for Shopify Requirement**
   - All Built for Shopify apps must meet WCAG AA
   - Accessibility built-in from start, not afterthought
   - Demonstrates merchant trust and inclusivity

---

## Responsive Design (Mobile/Tablet)

**Reference:** [Mobile Best Practices](https://shopify.dev/docs/apps/best-practices/mobile) | [Layout Guidelines](https://shopify.dev/docs/apps/design/layout)

### Mobile-First Principle

1. **Priority**
   - Majority of Shopify traffic is mobile
   - Design for mobile **first**, not as afterthought
   - Desktop = enhancement of mobile experience

2. **Core Functionality**
   - All app features must work on mobile
   - Notify merchants if features mobile-unavailable
   - Avoid hidden mobile features

### Mobile Layout Rules

1. **Scrolling Direction**
   - **Prioritize vertical scroll**
   - Avoid horizontal scrolling if possible
   - Horizontal scroll = poor mobile UX
   - Stack content vertically on small screens

2. **Touch Target Sizing**
   - Minimum 44×44 pixels (mobile)
   - Minimum 8 pixels spacing between targets
   - Prevents accidental taps
   - Critical for retail/POS usage

3. **Text Sizing**
   - Minimum 13px for headings, body, interactive text
   - Minimum 12px for captions, subheadings
   - 16px common for mobile body text (browser zoom prevention)
   - Ensure readability at smaller sizes

### Responsive Implementation

1. **Polaris Page Component**
   - Built-in responsive aside slot
   - Automatically adapts for small screens
   - Mobile-aware layout adjustments

2. **Polaris Grid Component**
   - Allows custom responsive breakpoints
   - Explicit column definitions
   - Mobile-first approach

3. **Viewport Breakpoints**
   - Mobile: < 768px
   - Tablet: 768px - 1024px
   - Desktop: > 1024px
   - Test at actual device widths, not just breakpoints

4. **Media Queries**
   - Mobile-first CSS (base styles mobile)
   - Override for larger screens
   - Follow Polaris token system

### Testing Requirements

1. **Actual Devices**
   - Test on real phones/tablets
   - iOS Safari + Chrome mobile
   - Android Chrome
   - Test app rotation and window resizing

2. **Responsiveness Checklist**
   - Content readable at all sizes
   - Touch targets appropriately sized
   - No horizontal scroll on mobile
   - Images responsive and properly scaled
   - Forms work on small screens

---

## Embedded Apps & App Bridge

**Reference:** [App Bridge Documentation](https://shopify.dev/docs/api/app-bridge) | [App Bridge Library](https://shopify.dev/docs/api/app-bridge-library)

### Embedded App Overview

1. **What It Is**
   - JavaScript SDK for embedded apps in Shopify Admin
   - Access to data and UI rendering within admin
   - Standard Web Platform APIs used
   - Integrates directly with admin

2. **Design Advantages**
   - Create streamlined experience with rest of admin
   - Use Polaris design system
   - Access admin data and UI elements
   - Communicate with Shopify admin UI

### App Bridge Capabilities

1. **Navigation**
   - Access to navigation APIs
   - Menu management
   - Tab control

2. **UI Elements**
   - Modals covering entire admin
   - Contextual save bars
   - Custom UI outside app surface

3. **Admin Integration**
   - Read admin context (selected product, order, etc.)
   - Trigger admin actions
   - Update admin UI from app
   - Navigate to admin pages

### Implementation Requirements

1. **Setup**
   - Include `app-bridge.js` script tag
   - Provide app API key
   - Remix App template includes App Bridge pre-configured

2. **Best Practices**
   - Always use App Bridge for modals/navigation
   - Don't create separate navigation system
   - Leverage admin context provided by App Bridge
   - Follow admin UI patterns and behaviors

3. **Design Consistency**
   - Match Shopify admin look and feel
   - Use Polaris components throughout
   - Maintain familiar workflows
   - Predictable merchant experience

### Authentication

1. **Set up embedded app authorization**
   - Standard OAuth flow
   - Session management
   - API key validation

---

## Notifications, Toasts & Banners

**Reference:** [Alerts & Notifications](https://shopify.dev/docs/apps/design/user-experience/alerts) | [Toast API](https://shopify.dev/docs/api/app-bridge-library/apis/toast) | [Toast API (App Home)](https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/toast-api)

### Toast Notifications (Bottom Center)

1. **Purpose**
   - Non-disruptive feedback messages
   - Appears at bottom center of app
   - Quick feedback on user actions
   - Temporary display (auto-dismiss)

2. **Content Rules**
   - **Maximum 3 words** or brief message
   - Short, scannable text only
   - Avoid error messaging
   - Exception: persistent connection errors OK

3. **When to Use Toasts**
   - Confirmation of successful action (if no redirect)
   - Non-critical updates
   - Informational messages
   - Quick feedback that doesn't require action

4. **When NOT to Use Toasts**
   - Error messages (use inline validation or banners)
   - Modal handling (only if modal itself erroring)
   - Critical information requiring acknowledgement
   - Multi-line messages

### Banner Messaging

1. **Informational Banner (Blue)**
   - General information or actions
   - Non-critical messaging
   - Should be dismissible (unless critical)
   - Appear at top of content area

2. **Success Banner (Green)**
   - Positive outcome confirmation
   - Use only when feedback is delayed/persistent/has CTA
   - Include next steps if applicable
   - Not for immediate action confirmations (use toast)

3. **Warning Banner (Yellow)**
   - Attention-needed items
   - Non-blocking issues
   - Merchants should take action
   - Clear what needs attention

4. **Error Banner (Red)**
   - Blocking or impossible actions
   - Errors preventing progress
   - Clear explanation of issue
   - Actionable recovery steps provided

### Banner Behavior

1. **Placement**
   - Top of affected content/page
   - Persistent until dismissed or resolved
   - Accessible color-blind users (not color-alone)

2. **Dismissibility**
   - Dismissible unless critical
   - Critical = must resolve to proceed
   - X button for dismissal
   - Clear CTA if action required

3. **Accessibility**
   - Contrast meets WCAG AA
   - Icon + color + text (not color alone)
   - ARIA live regions for dynamic updates
   - Keyboard accessible

---

## Data Visualization & Metrics

**Reference:** [Metrics Card Pattern](https://shopify.dev/docs/api/app-home/patterns/compositions/metrics-card) | [Polaris Visualization (Deprecated)](https://polaris-viz.shopify.dev/)

### Metrics Card Pattern

1. **Purpose**
   - Surface important merchant data
   - Displayed on homepages or dashboards
   - Key performance indicators (KPIs)
   - Responsive grid layout

2. **Features**
   - Visual KPI display
   - Trend indicators (up/down)
   - Responsive grid arrangement
   - Multiple cards per row (adapts to screen size)

3. **Content**
   - Single metric per card
   - Clear label (what is being measured)
   - Current value (prominent)
   - Trend comparison (period-over-period)
   - Optional: sparkline or simple chart

### Chart/Graph Guidance

1. **Official Polaris Viz Status**
   - `@shopify/polaris-viz` is **DEPRECATED**
   - No longer maintained by Shopify
   - Not recommended for new apps

2. **Alternative Approaches**
   - Use community charting libraries (Recharts, Chart.js, D3.js)
   - Adhere to Shopify design system colors/tokens
   - Ensure accessibility (alt text for charts)
   - Test performance impact

3. **Design Requirements**
   - Match Shopify color palette
   - Clear axis labels and legends
   - Accessible to color-blind users
   - Responsive to different screen sizes
   - Interactive elements must be keyboard accessible

### Data Presentation Best Practices

1. **Clarity Over Aesthetics**
   - Prioritize data clarity
   - Use familiar chart types
   - Avoid unnecessary decorations
   - Label everything

2. **Mobile Rendering**
   - Stack charts vertically on mobile
   - Reduce chart complexity for small screens
   - Touch-friendly interactive elements
   - Readable text at small sizes

3. **Accessibility**
   - Alt text for charts describing data
   - Table alternative for chart data
   - Color + pattern for color-blind access
   - Keyboard navigation for interactive elements

---

## Performance Optimization

**Reference:** [Performance Overview](https://shopify.dev/docs/apps/build/performance) | [General Best Practices](https://shopify.dev/docs/apps/build/performance/general-best-practices) | [Admin Performance](https://shopify.dev/docs/apps/best-practices/performance/admin)

### Critical Performance Constraints

1. **Storefront Performance**
   - **Lighthouse Score Penalty: Max -10 points**
   - App must not reduce store Lighthouse by more than 10 points
   - Failure = App Store rejection
   - Measured across store sample pages
   - Weighted average calculation

2. **Built for Shopify Requirement**
   - Performance optimization mandatory for Built for Shopify
   - Long-term sustained performance
   - Regular monitoring and improvement

### App Entry Point

1. **JavaScript Bundle**
   - **Less than 10 KB** at app entry point
   - Load additional code on interaction
   - Defer non-critical features

2. **CSS Bundle**
   - **Less than 50 KB** of CSS per page
   - Minimize CSS duplication
   - Use design system tokens (don't redefine)

### Code Optimization

1. **Script Tag Attributes**
   - Use `defer` or `async` attributes
   - Prevent parser-blocking scripts
   - Parser-blocking = DOM construction delay
   - Parser-blocking = network congestion

2. **Bundle Minimization**
   - Minimize JavaScript code
   - Tree-shake unused code
   - Remove console statements in production
   - Compress assets (gzip)

### Storefront Performance

1. **CDN Usage**
   - Deliver assets from Shopify CDN where possible
   - Same host for assets = HTTP/2 prioritization benefits
   - Avoid cross-origin requests
   - Use file GraphQL resource to host static files

2. **Network Requests**
   - Minimize HTTP requests
   - Batch requests where possible
   - Use caching headers
   - Avoid render-blocking resources

### Checkout Performance

1. **Checkout Extension Limits**
   - **64 KB compiled bundle limit** (enforced at deployment)
   - Includes all code + dependencies
   - Violation blocks deployment
   - Critical to keep checkout fast

2. **Response Times**
   - Keep network responses under 1 second
   - Use skeleton screens during loading
   - Don't block checkout flow

### Admin App Performance

1. **Optimized Loading**
   - Shopify Mobile loads app in native WebView
   - Significantly reduces load time
   - Enable optimized loading in setup
   - Improves mobile merchant experience

### Monitoring & Measurement

1. **Core Web Vitals Targets**
   - LCP (Largest Contentful Paint): < 2.5 seconds
   - FID (First Input Delay): < 100 milliseconds
   - CLS (Cumulative Layout Shift): < 0.1

2. **Lighthouse Audit**
   - Run before and after feature additions
   - Establish baseline scores
   - Regression = alert/review process
   - Aim for > 90 score minimum

3. **Real-World Monitoring**
   - Monitor production performance
   - Track metrics over time
   - Alert on regressions
   - User-centric metrics important

---

## Visual Design (Color, Typography)

**Reference:** [Visual Design Guidelines](https://shopify.dev/docs/apps/design/visual-design)

### Color System

1. **Polaris Color Palette**
   - Use design system colors exclusively
   - Don't define custom colors
   - Ensures consistency with Shopify admin

2. **Color Semantics**

   **Orange (In-Progress, Pending, Attention)**
   - Indicates status is in-progress
   - Status pending completion
   - Alerts merchant attention needed
   - Strongest non-blocking color role

   **Red (Blocked, Error, Impossible)**
   - Conveys action is impossible/blocked
   - Action has resulted in error
   - Only use for critical issues
   - Highest severity

   **Green (Success, Positive)**
   - Positive completion/success
   - Approved/verified status
   - Conditional/filtered states

   **Blue (Information, Primary Action)**
   - General information
   - Primary actions/CTAs
   - Links and navigation

   **Gray (Disabled, Inactive)**
   - Disabled UI elements
   - Inactive navigation items
   - Secondary content

3. **Color Contrast**
   - **Background-to-text: 4.5:1 minimum** (WCAG AA)
   - Test all color combinations
   - Ensure readability for low-vision users
   - Don't rely on color alone to convey meaning

### Typography System

1. **Font**
   - Use Shopify's standard typography (Inter, Helvetica Neue, -apple-system)
   - Don't use custom fonts
   - Fallback stack ensures consistency

2. **Font Sizing Rules**
   - **13px minimum** for headings, body text, interactive elements
   - **12px minimum** for captions, subheadings, helper text
   - Prevents illegibility issues
   - Mobile-friendly sizing critical

3. **Heading Hierarchy**
   - Use h1-h6 tags to structure content
   - Single h1 per page
   - Sequential heading structure (no skips)
   - Improve both SEO and accessibility

4. **Line Height & Spacing**
   - Use Polaris spacing tokens
   - Adequate line height for readability
   - Proper letter spacing
   - Whitespace improves scanning

### Design System Integration

1. **Mandatory Polaris**
   - Use Polaris for all admin app UI
   - Don't create custom design system
   - Colors, spacing, shadows from Polaris
   - Consistent with Shopify admin

2. **Design Tokens**
   - Spacing (4px, 8px, 12px, 16px base system)
   - Shadows (elevation levels)
   - Borders (color, width, radius)
   - Typography (font family, size, weight)

3. **Dark Mode**
   - Polaris handles automatically
   - Don't hardcode colors
   - Test in both light/dark modes
   - Contrast still applies

---

## Content Guidelines & Microcopy

**Reference:** [Content Guidelines](https://shopify.dev/docs/apps/design/content)

### Voice & Tone

1. **Voice** (Consistent across all contexts)
   - Professional but approachable
   - Helpful and supportive
   - Clear and direct
   - Merchant-focused

2. **Tone** (Adapts to context)
   - Friendly for onboarding
   - Professional for admin features
   - Urgent for errors/warnings
   - Celebratory for successes

3. **Shopify Polaris Guidance**
   - Reference Polaris content guidelines for detailed voice/tone
   - Maintain consistency with Shopify voice
   - Match admin UI tone

### Writing for Global Merchants

1. **Audience Considerations**
   - Merchants located globally
   - Varying literacy levels
   - English may not be first language
   - Simplify language

2. **Language Best Practices**
   - Use simple, common words
   - Short sentences (max 15 words)
   - Active voice preferred
   - Avoid idioms and slang
   - Avoid jargon

3. **Grammar Standards**
   - Proper spelling, punctuation, grammar
   - Reference Polaris for mechanical guidelines
   - Consistency across app
   - Proofread carefully

### Content Duplication Avoidance

**Don't Duplicate:**
- Page title in title bar AND page heading
- Horizontal navigation AND app nav
- Same content presented in multiple ways on single page

**Examples of Bad Duplication:**
- Title bar says "Products" + page heading says "Products"
- Sidebar nav + horizontal navigation tabs
- Inline help text + separate help section

### Naming Conventions

1. **First Reference**
   - Use proper app/company name
   - Full name for clarity

2. **Subsequent References**
   - Can use shortened name or "we" (limited use)
   - Don't overuse pronouns
   - Maintain clarity

### Button & Label Language

1. **Use Strong Action Verbs**
   - "Save changes" (not "OK" or "Submit")
   - "Create product" (not "Add")
   - "Delete customer" (not "Remove")
   - "Edit settings" (not "Modify")

2. **Labels Should Be**
   - Clear and specific
   - Concise (1-3 words ideal)
   - Accurate (describe action clearly)
   - Action-oriented

3. **Error Messages**
   - Explain what went wrong in merchant terms
   - Suggest recovery action
   - Avoid technical jargon
   - Be empathetic

### Microcopy Examples

**Placeholders:**
- "Enter product name" (not "Name" or "Input")
- "Type your email address" (not "Email")

**Help Text:**
- "Enter 3-20 characters, no special symbols"
- "Required for customer communication"

**Empty States:**
- "No products yet. Create your first product to get started."
- "No orders this month. Come back when you have sales."

**Success Messages:**
- "Product saved successfully"
- "Settings updated"

**Error Messages:**
- "Product name is required"
- "Email address is invalid"

---

## Interaction Patterns (Buttons, Forms, Modals)

**Reference:** [Button Component](https://shopify.dev/docs/api/app-home/web-components/actions/button) | [Modal Usage](https://shopify.dev/docs/api/app-bridge/using-modals-in-your-app) | [Forms Guidelines](https://shopify.dev/docs/apps/design/user-experience/forms)

### Button Component

1. **Button Purposes**
   - Trigger actions/events
   - Submit forms
   - Open dialogs/modals
   - Navigate to other pages
   - Toggle states

2. **Button Styles & Hierarchy**

   **Primary Button**
   - Main action on page
   - "Save", "Create", "Submit"
   - Only one per page typically
   - Visually prominent

   **Secondary Button**
   - Supporting actions
   - "Cancel", "Skip", "Clear"
   - Visible but less prominent
   - Multiple secondary buttons OK

   **Critical Button**
   - Destructive actions
   - "Delete", "Remove", "Deactivate"
   - Red color to indicate danger
   - Require confirmation

   **Tertiary Button**
   - Less important actions
   - Minimal visual weight
   - "Learn more", "Details"
   - Use sparingly

3. **Button Labeling**
   - Use strong action verbs
   - Clear, specific language
   - 1-3 words ideal
   - Avoid generic labels ("OK", "Submit")

4. **Button Behavior**
   - Disabled state when form invalid
   - Loading state during submission
   - Focus state for keyboard navigation
   - Confirm destructive actions (modal)

### Forms

1. **Form Structure**

   **Single Page Forms:**
   - Keep to single page view
   - Avoid horizontal scrolling
   - Stack inputs vertically
   - Clear section headers

   **Multi-Section Forms:**
   - Group related inputs logically
   - Use section titles
   - Visual separation between sections
   - Consider multi-step if > 10 inputs

   **Large/Complex Forms:**
   - Create separate page (not modal)
   - Give merchants room to work
   - Progress indicator for multi-step
   - Save progress option

2. **Input Layout**

   **For 1-5 Inputs:**
   - Single card/section
   - Stack vertically
   - Clear labels above inputs

   **For 5+ Inputs:**
   - Multiple cards with headers, OR
   - Single large card with section titles
   - Logical grouping of related fields
   - Adequate spacing between sections

3. **Form Validation**

   **Real-Time Validation:**
   - Validate on blur (not keystroke)
   - Show inline error message
   - Prevent form submission if errors
   - Clear error when fixed

   **Submit Validation:**
   - Validate all fields on submit
   - Show all errors at once
   - Prevent double-submission
   - Loading state during processing

4. **Accessibility**
   - All inputs have associated labels
   - Required fields clearly marked (*)
   - Error messages linked to fields (aria-describedby)
   - Proper tabindex order
   - Keyboard accessible

### Modal Component

1. **Modal API**
   - Displays overlay preventing interaction with rest of app
   - Use for focused tasks
   - User interaction triggers opening (not programmatic)
   - Cannot open programmatically on page load

2. **Modal Use Cases**

   **Confirmation Dialogs:**
   - Confirm destructive actions
   - Confirm irreversible changes
   - "Are you sure?" with Cancel/Delete
   - Single, critical decision

   **Form Modals:**
   - Quick edit forms
   - Small configuration changes
   - New item creation (simple)
   - Don't use large forms in modals

   **Information Modals:**
   - Important information requiring acknowledgement
   - Warnings before proceeding
   - Help/documentation display

3. **Modal Best Practices**

   **Size:**
   - Don't make modals too large
   - Avoid max-height, max-width constraints
   - Use full page if form is complex/large

   **Content:**
   - Clear modal title/heading
   - Concise explanation
   - Primary and secondary actions
   - Don't nest modals

   **Behavior:**
   - Esc key closes modal
   - Focus moves to modal content on open
   - Focus returns to launcher on close
   - Prevent background scrolling

4. **Accessibility**
   - Modal must have title (h1 or aria-labelledby)
   - Focus trapped within modal
   - Keyboard navigation functional
   - Screen reader announces modal
   - Proper ARIA attributes (role="dialog")

---

## Additional Resources

### Official Documentation Links

- [Shopify App Design Guidelines](https://shopify.dev/docs/apps/design)
- [Polaris Design System](https://shopify.dev/docs/apps/tools/polaris)
- [App Bridge Documentation](https://shopify.dev/docs/api/app-bridge)
- [Built for Shopify Requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)
- [App Store Requirements](https://shopify.dev/docs/apps/launch/app-requirements-checklist)
- [Accessibility Best Practices](https://shopify.dev/docs/apps/build/accessibility)
- [Performance Guidelines](https://shopify.dev/docs/apps/build/performance)

### Design System References

- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [Patterns & Compositions](https://shopify.dev/docs/api/app-home/patterns)
- [Checkout UI Extensions Components](https://shopify.dev/docs/api/checkout-ui-extensions/latest/components)
- [POS UI Extensions](https://shopify.dev/docs/api/pos-ui-extensions/latest)

---

## Summary: Critical Rules for Shopify App Design

1. **Use Polaris** for all admin UI (no Tailwind, no custom design)
2. **Mobile-first** design mandatory
3. **WCAG AA accessibility** required for Built for Shopify
4. **Max 64 KB** checkout extension bundle
5. **No more than -10 Lighthouse points** storefront penalty
6. **Keyboard navigation** fully functional
7. **Color contrast 4.5:1** minimum text-to-background
8. **Responsive** at mobile, tablet, desktop
9. **Performance under 1 second** for network requests
10. **Clear merchant onboarding** required

---

**Document Version:** 1.0
**Last Extracted:** April 2026
**Status:** Complete technical content extract from Shopify.dev Design phase documentation
