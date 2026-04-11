# Accessibility Standards (WCAG 2.1 AA) — Definitive Reference

**Last updated: 2026-04-04**

## Overview

WCAG 2.1 Level AA is the global accessibility standard for web applications and compliance baseline for Boldteq Software Factory. The ADA Title II regulatory rule (published April 2024) establishes WCAG 2.1 Level AA as the mandatory technical standard for government web content. Section 508, EN 301 549 (EU), AODA (Canada), and accessibility regulations in Australia, Japan, and South Korea also mandate Level AA compliance.

WCAG 2.1 consists of **50 success criteria** organized around 4 principles (POUR):
- **Perceivable** (13 criteria): Users can perceive information via multiple senses
- **Operable** (12 criteria): Users can navigate and control the interface
- **Understandable** (16 criteria): Users understand content and how to use the interface
- **Robust** (4 criteria): Content works with assistive technology

While automated tools catch ~30% of issues, manual testing with assistive technology is required for comprehensive compliance.

---

## WCAG 2.1 AA Checklist (Organized by POUR Principle)

### PERCEIVABLE — Principle 1: Information must be perceptible to all senses

#### 1.1 Text Alternatives
- **1.1.1 Non-text Content (Level A):** All non-text content (images, icons, graphics) must have text alternatives
  - Informative images: descriptive alt text (15-125 characters typical)
  - Decorative images: `alt=""` (empty string, not omitted)
  - Icon buttons: `aria-label` or sr-only text
  - Background images: Use `background-image` only for decoration; critical content must be in DOM
  ```tsx
  // ✓ Informative image
  <img src="team.jpg" alt="the project leadership team at 2025 company summit" />

  // ✓ Decorative image
  <img src="divider.svg" alt="" />

  // ✓ Icon button
  <button aria-label="Close menu"><X size={20} /></button>
  ```

#### 1.2 Time-based Media
- **1.2.1 Audio-only and Video-only (Prerecorded):** Provide transcript or description
- **1.2.2 Captions (Prerecorded):** Synchronized captions required for all video
- **1.2.3 Audio Description or Media Alternative:** Video must include audio description for visual information
- **1.2.4 Captions (Live):** Live video broadcasts must have real-time captions (WCAG AAA requirement)
- **1.2.5 Audio Description (Prerecorded):** Detailed audio track describing visual content

**Implementation:**
- Use `<video>` with `<track kind="captions">` for captions
- Provide `.vtt` (Video Text Tracks) files with synchronized captions
- Include descriptive audio track as separate `.mp3` or integrated with video
```html
<video controls aria-label="Product demo">
  <source src="demo.mp4" type="video/mp4">
  <track kind="captions" src="demo.en.vtt" srclang="en" label="English">
  <track kind="descriptions" src="demo-description.vtt" srclang="en" label="English Audio Description">
</video>
```

#### 1.3 Adaptable Content
- **1.3.1 Info & Relationships (Level A):** Information structure conveyed via HTML semantics, not CSS or visual arrangement alone
  - Heading hierarchy must follow semantic order (h1 > h2 > h3, no skipping levels)
  - Lists use `<ul>`, `<ol>`, `<li>` elements
  - Form labels properly associated with inputs
  - Data table headers use `<th scope="col">`/`<th scope="row">`
  - Reading order in DOM matches visual left-to-right, top-to-bottom flow
  ```tsx
  // ✓ GOOD: Semantic structure
  <h1>Resume Ranking</h1>
  <section>
    <h2>Job Description</h2>
    <p>Details here</p>
  </section>
  <section>
    <h2>Upload Resumes</h2>
    <form>
      <label htmlFor="file">Select files:</label>
      <input id="file" type="file" />
    </form>
  </section>

  // ✗ BAD: Structure hidden in CSS, visual hierarchy not semantic
  <div className="text-4xl font-bold">Resume Ranking</div>
  <div>Job Description</div>
  ```

- **1.3.2 Meaningful Sequence:** Content presented in meaningful logical order via DOM, not CSS positioning
- **1.3.3 Sensory Characteristics:** Instructions don't rely on shape, color, size alone
  ```tsx
  // ✗ BAD: Relies on color alone
  <p>Required fields are <span style={{ color: 'red' }}>marked in red</span></p>

  // ✓ GOOD: Color + text indicator
  <p>Required fields are <span style={{ color: 'red' }}>marked with * and red text</span></p>
  ```

- **1.3.4 Orientation:** No restriction to single portrait/landscape (WCAG AAA; not required for AA but recommended)
- **1.3.5 Identify Input Purpose:** Form inputs use autocomplete attributes
  ```tsx
  <input type="email" autocomplete="email" />
  <input type="password" autocomplete="current-password" />
  <input type="tel" autocomplete="tel" />
  ```

#### 1.4 Distinguishable Content (Color, Contrast, Resize)
- **1.4.1 Use of Color (Level A):** Never convey information by color alone; use multiple cues (color + icon, color + text, color + pattern)
  ```tsx
  // ✗ BAD: Color only
  <div>Success: <span style={{ color: 'green' }}>Uploaded</span></div>

  // ✓ GOOD: Color + icon + text
  <div>
    <CheckCircle className="text-green-600" />
    <span className="text-green-600">Uploaded successfully</span>
  </div>
  ```

- **1.4.3 Contrast (Minimum) (Level AA):** **4.5:1 for normal text, 3:1 for large text and UI components**
  - Normal text: < 18px (or < 14px bold)
  - Large text: ≥ 18px (or ≥ 14px bold)
  - Test with WebAIM Contrast Checker or Deque axe DevTools
  ```
  ✓ PASS: #000000 (black) on #FFFFFF (white) = 21:1 ratio
  ✓ PASS: #1F2937 (gray-800) on #FFFFFF = 10.6:1 ratio
  ✗ FAIL: #9CA3AF (gray-400) on #FFFFFF = 2.0:1 ratio
  ✗ FAIL: #6B7280 (gray-500) on #F3F4F6 (gray-100) = 1.8:1 ratio
  ```

- **1.4.4 Resize Text (Level AA):** Content must be functional when text is resized up to 200% zoom
  - Don't use fixed dimensions for text containers
  - Use relative units (rem, em, %) not absolute (px)
  - Test: Browser zoom 200% (Cmd+, or Ctrl+,) should remain readable
  ```tsx
  // ✓ GOOD: Responsive sizing
  <p className="text-base md:text-lg">Content</p> // Responsive text size

  // ✗ BAD: Fixed height containers with overflow hidden
  <div style={{ height: '100px', overflow: 'hidden' }}>{content}</div>
  ```

- **1.4.5 Images of Text (Level AA):** Avoid text rendered as images (except logos, icons)
- **1.4.11 Non-text Contrast (Level AA):** UI components and graphical elements must have 3:1 contrast against adjacent colors
  - Focus indicators: 3:1 contrast ratio
  - Borders, dividers, icons
  - Chart elements, data visualization
  ```tsx
  // ✓ GOOD: High contrast focus ring
  <button className="focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
    Action
  </button>

  // ✗ BAD: Light gray border on light background
  <input style={{ border: '1px solid #E5E7EB' }} />
  ```

---

### OPERABLE — Principle 2: Interface must be operable via keyboard and other input methods

#### 2.1 Keyboard Accessible
- **2.1.1 Keyboard (Level A):** All functionality accessible via keyboard alone
  - Tab/Shift+Tab: Navigate between focusable elements (left-to-right, top-to-bottom)
  - Enter/Space: Activate buttons, links, toggles
  - Arrow keys: Navigate within lists, dropdowns, tabs, radio groups
  - Escape: Close modals, popovers, dropdowns
  - No keyboard-only shortcuts that conflict with browser/OS shortcuts
  ```tsx
  // ✓ Keyboard accessible
  <button onClick={handleClick}>Action</button> // Keyboard: Tab, Enter
  <a href="/page">Link</a>                      // Keyboard: Tab, Enter
  <input type="text" />                         // Keyboard: Tab, type

  // ✗ BAD: Keyboard inaccessible (click handler on non-interactive element)
  <div onClick={handleClick}>Not keyboard accessible</div>
  ```

- **2.1.2 No Keyboard Trap (Level A):** User must be able to escape any component using only keyboard
  - Modals must trap focus but allow Escape to exit
  - Dropdown menus must allow Tab to move past
  - Avoid infinite focus loops
  ```tsx
  // ✗ BAD: Keyboard trap in modal (focus can't escape)
  <div role="dialog">
    <input onKeyDown={(e) => e.key === 'Tab' && e.preventDefault()} />
  </div>

  // ✓ GOOD: Modal with controlled focus
  <Dialog onOpenChange={onClose}>
    <button onClick={onClose}>Close (Tab will cycle through focusable elements)</button>
    <input />
  </Dialog>
  ```

- **2.1.3 Keyboard (No Exception):** All functionality accessible via keyboard (WCAG AAA; not required for AA)

#### 2.2 Enough Time
- **2.2.1 Timing Adjustable (Level A):** Session timeouts must be avoidable or extendable
  - If session expires, provide warning with ability to extend
  - No automatic redirects without user notice
- **2.2.2 Pause, Stop, Hide (Level A):** Automatically moving, blinking, or scrolling content must be pausable

#### 2.3 Seizures and Physical Reactions
- **2.3.1 Three Flashes or Below Threshold (Level A):** No content flashes more than 3 times per second

#### 2.4 Navigable
- **2.4.1 Bypass Blocks (Level A):** Provide skip links to bypass repetitive content (navigation)
  ```html
  <a href="#main" className="sr-only">Skip to main content</a>
  <nav>{/* navigation */}</nav>
  <main id="main">{/* content */}</main>
  ```

- **2.4.2 Page Titled (Level A):** Every page has descriptive title (in `<title>` tag and `<h1>`)
  ```tsx
  <title>Resume Ranking - the project</title>
  <h1>Resume Ranking Dashboard</h1>
  ```

- **2.4.3 Focus Order (Level A):** Tab order is logical and meaningful (follows visual left-to-right, top-to-bottom)
  - DOM order determines tab order; avoid `tabIndex > 0`
  - If visual layout differs from DOM, reorder DOM or use `tabIndex`
  ```tsx
  // ✓ GOOD: Tab order matches visual flow
  <input placeholder="First name" />
  <input placeholder="Last name" />
  <input placeholder="Email" />
  <button>Submit</button>
  ```

- **2.4.4 Link Purpose (Level A):** Link text clearly describes the destination or action
  ```tsx
  // ✗ BAD: Non-descriptive link text
  <a href="/terms">Click here</a>

  // ✓ GOOD: Descriptive link text
  <a href="/terms">Read our Terms of Service</a>
  ```

- **2.4.5 Multiple Ways (Level AA):** Users can find content through multiple navigation methods
  - Sitemap, search, breadcrumbs, site index
  - Not required for single-page apps with clear information architecture

- **2.4.6 Headings and Labels (Level AA):** Headings and form labels are descriptive and unique
  ```tsx
  // ✗ BAD: Non-descriptive heading
  <h2>Info</h2>

  // ✓ GOOD: Descriptive heading
  <h2>Job Description Analysis Results</h2>
  ```

- **2.4.7 Focus Visible (Level AA):** Every interactive element shows a clear focus indicator
  - Use Tailwind `focus:ring` classes or custom focus styles
  - Don't remove outlines; if customizing, ensure 3:1 contrast
  ```tsx
  // ✓ GOOD: Visible focus ring
  <button className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
    Click me
  </button>

  // ✗ BAD: Focus hidden
  <button className="focus:outline-none" />
  ```

#### 2.5 Input Modalities
- **2.5.1 Pointer Gestures (Level A):** Don't require complex multi-pointer gestures (pinch, swipe with 2+ fingers)
- **2.5.2 Pointer Cancellation (Level A):** Don't trigger action on pointer down; trigger on pointer up
- **2.5.3 Label in Name (Level A):** Visible label text must match aria-label for voice control compatibility
  ```tsx
  // ✓ GOOD: Label matches aria-label
  <button aria-label="Close menu">
    <X size={20} />
  </button>

  // ✓ GOOD: Visible label (for voice input)
  <button>Close menu</button>
  ```

- **2.5.4 Motion Actuation (Level A):** Don't trigger actions via device motion (shake, tilt) without alternative
- **2.5.5 Target Size (Level AAA; AA-recommended):** Minimum 44x44px (CSS pixels) for all touch targets
  - Exception: inline text links, elements controlled by user agent
  ```tsx
  // ✓ GOOD: 44x44px touch target
  <button className="h-11 px-4">Action</button>

  // ✗ BAD: Too small
  <button className="h-6 px-2">Icon</button>
  ```

---

### UNDERSTANDABLE — Principle 3: Content and operations must be understandable

#### 3.1 Readable
- **3.1.1 Language of Page (Level A):** Primary page language specified in `<html lang="en">`
  ```html
  <html lang="en">
    <head><title>the project</title></head>
  </html>
  ```

- **3.1.2 Language of Parts (Level AA):** Different languages on same page marked with `lang` attribute
  ```html
  <p>Welcome to our app.</p>
  <p lang="es">Bienvenido a nuestra aplicación.</p>
  ```

#### 3.2 Predictable
- **3.2.1 On Focus (Level A):** No unexpected context changes when element receives focus
  ```tsx
  // ✗ BAD: Submits form on focus
  <button onFocus={(e) => e.target.form?.submit()}>Not predictable</button>

  // ✓ GOOD: Focus doesn't cause submission
  <button onFocus={() => console.log('focused')}>Expected behavior</button>
  ```

- **3.2.2 On Input (Level A):** No unexpected context changes when input changes
  ```tsx
  // ✗ BAD: Navigation on select change
  <select onChange={(e) => navigate(e.target.value)}>
    <option>Page 1</option>
    <option>Page 2</option>
  </select>

  // ✓ GOOD: Explicit submit button for navigation
  <select value={selected} onChange={(e) => setSelected(e.target.value)}>
    <option>Page 1</option>
    <option>Page 2</option>
  </select>
  <button onClick={() => navigate(selected)}>Go</button>
  ```

- **3.2.3 Consistent Navigation (Level AA):** Navigation elements appear in same order across pages
- **3.2.4 Consistent Identification (Level AA):** UI components with same functionality identified consistently

#### 3.3 Input Assistance (Forms)
- **3.3.1 Error Identification (Level A):** Form errors clearly identified and described
  ```tsx
  <input
    id="email"
    type="email"
    aria-describedby={error ? 'email-error' : undefined}
  />
  {error && (
    <div id="email-error" role="alert" className="text-red-600">
      Invalid email format
    </div>
  )}
  ```

- **3.3.2 Labels or Instructions (Level A):** Form inputs have associated labels or instructions
  ```tsx
  // ✓ GOOD: Explicit label
  <label htmlFor="password">Password</label>
  <input id="password" type="password" />

  // ✓ GOOD: Instructions provided
  <label htmlFor="phone">
    Phone number (format: XXX-XXX-XXXX)
  </label>
  <input id="phone" type="tel" />
  ```

- **3.3.3 Error Suggestion (Level AA):** Form provides suggestions when errors detected
  ```tsx
  <input
    type="email"
    onBlur={(e) => {
      if (e.target.value && !isValidEmail(e.target.value)) {
        setSuggestion('Did you mean example@email.com?');
      }
    }}
  />
  {suggestion && <div className="text-blue-600">{suggestion}</div>}
  ```

- **3.3.4 Error Prevention (Level AA):** Form allows reversal of submissions (review, confirm before submit)

---

### ROBUST — Principle 4: Content must be robust and compatible with assistive technology

#### 4.1 Compatible
- **4.1.1 Parsing (Level A):** Valid HTML (no duplicate IDs, proper nesting)
  - Use HTML validator: https://validator.w3.org/
  - Automated tools catch most parsing errors

- **4.1.2 Name, Role, Value (Level A):** All UI components have accessible name, role, and state
  - Buttons: role implicit, accessible name from text or aria-label
  - Form inputs: role implicit, accessible name from associated label, aria-label, or aria-labelledby
  - Custom components: role explicitly set, state communicated via ARIA
  ```tsx
  // ✓ GOOD: Button with implicit role
  <button>Close</button>

  // ✓ GOOD: Input with associated label
  <label htmlFor="search">Search</label>
  <input id="search" type="text" />

  // ✓ GOOD: Custom toggle with role and state
  <div
    role="switch"
    aria-checked={isOn}
    onClick={toggle}
    onKeyDown={(e) => e.key === 'Enter' && toggle()}
  >
    Toggle
  </div>
  ```

- **4.1.3 Status Messages (Level AA):** Dynamic status updates announced to screen readers
  ```tsx
  // ✓ GOOD: Status announced via aria-live
  <div aria-live="polite" aria-atomic="true">
    {uploadStatus} {/* "Uploaded 3 of 5 files" */}
  </div>

  // ✓ GOOD: Urgent alert via aria-live="assertive"
  <div aria-live="assertive" role="alert">
    {error} {/* "Error: File too large" */}
  </div>
  ```

---

## ARIA Patterns Library (Complete Reference)

ARIA (Accessible Rich Internet Applications) attributes provide semantic meaning to interactive components. shadcn-ui and Radix UI handle most ARIA automatically; only add ARIA when building custom components.

### Core ARIA Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `aria-label` | Accessible name for elements without visible text | `<button aria-label="Close">X</button>` |
| `aria-labelledby` | Links element to visible label by ID | `<h2 id="title">Form</h2><form aria-labelledby="title">` |
| `aria-describedby` | Links element to description (help text, error messages) | `<input aria-describedby="hint">` |
| `aria-live` | Announces dynamic content changes | `<div aria-live="polite">Status</div>` |
| `aria-hidden` | Hides decorative content from screen readers | `<span aria-hidden="true">→</span>` |
| `aria-expanded` | Indicates if collapsible element is open/closed | `<button aria-expanded={isOpen}>Menu</button>` |
| `aria-selected` | Indicates if element is selected (tabs, options) | `<div role="tab" aria-selected={isActive}>Tab</div>` |
| `aria-checked` | State of checkboxes, radio buttons, switches | `<div role="checkbox" aria-checked={isChecked}>` |
| `aria-disabled` | Indicates element is disabled | `<button aria-disabled={isDisabled}>` |
| `aria-required` | Indicates form field is required | `<input aria-required="true">` |
| `aria-invalid` | Indicates form field has validation error | `<input aria-invalid={hasError}>` |
| `role` | Explicit role for non-semantic HTML | `<div role="button" onClick={handle}>` |

### shadcn/ui Component ARIA Patterns

#### Dialog / AlertDialog
```tsx
// ARIA automatically handled by Radix Dialog
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    {/* Radix handles: role="dialog", aria-modal="true", focus trap, Escape key */}
    <DialogTitle>Confirm Action</DialogTitle>
    <DialogDescription>Are you sure?</DialogDescription>
    <DialogClose asChild>
      <button>Cancel</button>
    </DialogClose>
  </DialogContent>
</Dialog>

// Ensure title is associated:
<DialogContent>
  <DialogTitle id="dialog-title">Title</DialogTitle>
  {/* Radix automatically sets aria-labelledby="dialog-title" */}
</DialogContent>
```

#### Tabs
```tsx
<Tabs defaultValue="tab1">
  <TabsList>
    {/* role="tablist" automatically set */}
    <TabsTrigger value="tab1">
      {/* role="tab", aria-selected handled automatically */}
      Tab 1
    </TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">
    {/* role="tabpanel", aria-labelledby linked automatically */}
    Content 1
  </TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

#### Dropdown Menu
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button aria-label="Open menu">
      {/* Radix sets role="button", aria-expanded, aria-haspopup="menu" */}
      Menu
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    {/* role="menu" automatically set */}
    <DropdownMenuItem>
      {/* role="menuitem" automatically set, keyboard: arrow keys, Enter/Space */}
      Action
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

#### Toast / Sonner
```tsx
// Sonner automatically sets role="status", aria-live="polite"
toast.success('Uploaded successfully');
toast.error('Upload failed');

// For urgent messages, manually set:
<div role="status" aria-live="assertive" aria-atomic="true">
  {error}
</div>
```

#### Form Fields
```tsx
// Label association required for all inputs
<label htmlFor="email">Email address</label>
<input id="email" type="email" aria-required="true" />

// Error handling with aria-invalid and aria-describedby
const [error, setError] = useState('');
<input
  id="password"
  type="password"
  aria-invalid={error ? 'true' : 'false'}
  aria-describedby={error ? 'password-error' : undefined}
/>
{error && (
  <span id="password-error" role="alert">
    {error}
  </span>
)}
```

#### Combobox / Command
```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button
      role="combobox"
      aria-expanded={open}
      aria-controls="command-list"
    >
      Select item...
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <Command>
      <CommandList id="command-list">
        {/* Radix Command handles keyboard nav, aria-activedescendant */}
        <CommandItem>Item 1</CommandItem>
        <CommandItem>Item 2</CommandItem>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

#### Accordion
```tsx
<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>
      {/* role="button", aria-expanded, aria-controls automatically set */}
      Section 1
    </AccordionTrigger>
    <AccordionContent>
      {/* aria-hidden="true" when closed, visible when open */}
      Content here
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

#### Select
```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger aria-label="Select option">
    {/* role="combobox", aria-expanded, aria-haspopup="listbox" */}
    <SelectValue placeholder="Choose..." />
  </SelectTrigger>
  <SelectContent>
    {/* role="listbox" */}
    <SelectItem value="opt1">Option 1</SelectItem>
    <SelectItem value="opt2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

#### Checkbox / Switch
```tsx
<Checkbox
  id="terms"
  aria-labelledby="terms-label"
  // role="checkbox", aria-checked automatically handled
/>
<label id="terms-label" htmlFor="terms">
  I agree to terms
</label>

<Switch
  id="notifications"
  aria-label="Enable notifications"
  // role="switch", aria-checked automatically handled
/>
```

#### Breadcrumb
```tsx
<nav aria-label="Breadcrumb">
  <ol className="flex items-center">
    <li><a href="/">Home</a></li>
    <li><span aria-hidden="true">/</span></li>
    <li><a href="/jobs">Jobs</a></li>
    <li><span aria-hidden="true">/</span></li>
    <li>
      <span aria-current="page">Job Title</span>
      {/* aria-current="page" for current page */}
    </li>
  </ol>
</nav>
```

---

## Keyboard Navigation Map

Complete keyboard interaction patterns for all components:

### Navigation
| Interaction | Keyboard |
|------------|----------|
| Move focus | Tab / Shift+Tab |
| Activate button/link | Enter or Space |
| Activate link | Enter |
| Activate checkbox | Space |
| Toggle button | Space or Enter |

### Lists / Menus / Tabs
| Interaction | Keyboard |
|------------|----------|
| Next item | Down arrow or Right arrow |
| Previous item | Up arrow or Left arrow |
| First item | Home |
| Last item | End |
| Activate item | Enter or Space |
| Type to search | Type first letter (for lists) |

### Dropdowns / Popovers
| Interaction | Keyboard |
|------------|----------|
| Open menu | Enter, Space, or Down arrow on trigger |
| Navigate items | Arrow keys |
| Select item | Enter or Space |
| Close menu | Escape |

### Modals
| Interaction | Keyboard |
|------------|----------|
| Focus trap | Tab cycles within modal only |
| Close modal | Escape key |
| Activate buttons | Enter or Space |

### Form Fields
| Interaction | Keyboard |
|------------|----------|
| Move to field | Tab |
| Exit field (blur) | Tab / Shift+Tab |
| Submit form | Enter (in final input) or Tab to button |
| Select option | Space or arrow keys (for selects) |

### Global Shortcuts (Avoid Conflicts)
- `Cmd+K` or `Ctrl+K`: Command palette (common pattern)
- `Escape`: Close modals, dropdowns, popovers
- `Enter`: Submit forms, activate buttons
- Do NOT use: `Ctrl+S`, `Cmd+S`, `Cmd+Q`, `Alt+F4`, browser shortcuts

---

## Focus Management Patterns with Code

### Focus Trap for Modal
```tsx
function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    // Get all focusable elements inside modal
    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    // Focus first element on open
    firstElement?.focus();

    // Trap Tab key within modal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift+Tab at first element wraps to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab at last element wraps to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }

      // Close on Escape
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Return focus to trigger when modal closes
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  return (
    <>
      <button ref={triggerRef} onClick={() => onClose()}>
        Open Modal
      </button>
      {isOpen && (
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/50 flex items-center justify-center"
        >
          <div className="bg-white p-6 rounded-lg max-w-md">
            {children}
            <button onClick={() => onClose()}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
```

### Roving Tabindex for Lists
```tsx
function AccessibleList({ items, onSelect }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        nextIndex = (index + 1) % items.length;
        break;
      case 'ArrowUp':
        e.preventDefault();
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = items.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(items[index]);
        return;
      default:
        return;
    }

    setActiveIndex(nextIndex);
    itemRefs.current[nextIndex]?.focus();
  };

  return (
    <ul role="listbox">
      {items.map((item, index) => (
        <li
          key={item.id}
          ref={(el) => (itemRefs.current[index] = el)}
          role="option"
          aria-selected={index === activeIndex}
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => {
            setActiveIndex(index);
            onSelect(item);
          }}
          onKeyDown={(e) => handleKeyDown(e, index)}
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
```

### Focus on Error Field
```tsx
function FormWithFocusError() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    // Validate fields
    if (!emailRef.current?.value) {
      newErrors.email = 'Email is required';
    }

    setErrors(newErrors);

    // Focus first error field
    if (Object.keys(newErrors).length > 0) {
      if (newErrors.email) emailRef.current?.focus();
      return;
    }

    // Submit form
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input
        ref={emailRef}
        id="email"
        type="email"
        aria-invalid={!!errors.email}
        aria-describedby={errors.email ? 'email-error' : undefined}
      />
      {errors.email && (
        <span id="email-error" role="alert">
          {errors.email}
        </span>
      )}
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Skip Navigation Link
```tsx
function Layout() {
  return (
    <>
      {/* Skip link — hidden by default, visible on Tab */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-0 focus:left-0 focus:z-50 focus:bg-blue-600 focus:text-white focus:p-2"
      >
        Skip to main content
      </a>

      <header>
        <nav>{/* navigation */}</nav>
      </header>

      <main id="main">
        {/* Content */}
      </main>
    </>
  );
}
```

---

## Screen Reader Testing Checklist

### VoiceOver (macOS/iOS)
- **Enable:** Cmd+F5 (macOS) or Settings → Accessibility → VoiceOver (iOS)
- **Navigate:** VO+arrow keys (VO = Control+Option)
- **Interact:** VO+Space or Enter
- **Rotor (headings, links):** VO+U
- **Announce current:** VO+A
- **Test critical flows:** Login, job ranking, payment

### NVDA (Windows Free)
- **Download:** https://www.nvaccess.org/
- **Navigate:** Arrow keys, Tab
- **Interact:** Enter or Space
- **Virtual cursor mode:** Browse and read content
- **Focus mode:** Interact with form fields and buttons
- **Read all:** Ctrl+Down arrow

### JAWS (Windows Premium)
- **Similar to NVDA** but more features
- **Landmark nav:** R key
- **Heading nav:** H key
- **Form mode:** Tab or Enter

### Key Patterns to Test
- Landmarks are announced: main, nav, aside, footer
- Headings announce level (h1, h2, h3)
- Form labels clearly associated with inputs
- Dynamic content (upload status, errors) announced
- Links have descriptive text (not "click here")
- Images have alt text (or aria-hidden if decorative)
- Buttons announce their purpose
- Tables have headers with scope attribute

### Accessibility Tree Inspection
- Chrome DevTools: Elements → Accessibility pane
- Firefox Inspector: Accessibility tab
- View page tree: AXE DevTools → Issues and tree view

---

## Color Contrast Quick Reference

### Passing Combinations (4.5:1 normal text, 3:1 large text)

**Dark Text on Light Backgrounds:**
```
✓ #000000 (black) on #FFFFFF (white)        = 21:1
✓ #1F2937 (gray-800) on #FFFFFF (white)     = 10.6:1
✓ #374151 (gray-700) on #FFFFFF (white)     = 7.9:1
✓ #4B5563 (gray-600) on #FFFFFF (white)     = 5.9:1
✓ #6B7280 (gray-500) on #FFFFFF (white)     = 4.0:1 ⚠️ borderline for normal text
```

**Light Text on Dark Backgrounds:**
```
✓ #FFFFFF (white) on #000000 (black)        = 21:1
✓ #F3F4F6 (gray-100) on #1F2937 (gray-800)  = 19.4:1
✓ #E5E7EB (gray-200) on #374151 (gray-700)  = 12.6:1
✓ #D1D5DB (gray-300) on #4B5563 (gray-600)  = 8.8:1
```

**UI Component Contrast (3:1):**
```
✓ Focus ring: #0EA5E9 (cyan-500) on white   = 3.2:1
✓ Border: #D1D5DB (gray-300) on #FFFFFF     = 3.1:1
✓ Border: #6B7280 (gray-500) on #F3F4F6     = 3.0:1 ⚠️ borderline
```

**Colorblind-Safe Palettes:**
- Use blue (#0EA5E9) and orange (#F97316) for distinction
- Avoid red-green combinations alone
- Add patterns (solid vs. striped) for chart elements

### Testing Tools
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Deque axe DevTools: https://www.deque.com/axe/devtools/
- Contrast Ratio: https://contrast-ratio.com/
- Tailwind Contrast Checker: https://www.tailwindcss.com/docs/installation

---

## Common Accessibility Bugs with Fixes

### Bug #1: Missing Form Labels
**Problem:** Screen reader users can't identify form fields
```tsx
// ✗ BAD
<input type="email" placeholder="Email" />

// ✓ GOOD
<label htmlFor="email">Email address</label>
<input id="email" type="email" />
```

### Bug #2: Click Handlers on Non-Interactive Elements
**Problem:** Keyboard users can't activate element
```tsx
// ✗ BAD
<div onClick={handleClick}>Not keyboard accessible</div>

// ✓ GOOD
<button onClick={handleClick}>Keyboard accessible</button>
```

### Bug #3: Images Without Alt Text
**Problem:** Screen reader users miss image content
```tsx
// ✗ BAD
<img src="team.jpg" />

// ✓ GOOD
<img src="team.jpg" alt="the project team at 2025 company summit" />

// ✓ GOOD (decorative)
<img src="divider.svg" alt="" />
```

### Bug #4: Auto-Playing Animations
**Problem:** Seizure/motion sensitivity risk, violates prefers-reduced-motion
```tsx
// ✗ BAD
<div className="animate-spin">Loading...</div>

// ✓ GOOD: Respect motion preference
function LoadingSpinner() {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mediaQuery.matches);
  }, []);

  if (prefersReduced) {
    return <div>Loading...</div>;
  }

  return <div className="animate-spin">Loading...</div>;
}
```

### Bug #5: Focus Not Visible
**Problem:** Keyboard users can't see where focus is
```tsx
// ✗ BAD: Removed outline
<button className="focus:outline-none">Not visible</button>

// ✓ GOOD: Visible focus ring
<button className="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
  Visible focus
</button>
```

### Bug #6: Dynamic Content Not Announced
**Problem:** Screen reader users miss status updates
```tsx
// ✗ BAD: No live region
<div>{uploadStatus}</div>

// ✓ GOOD: Announced via aria-live
<div aria-live="polite" aria-atomic="true">
  {uploadStatus}
</div>
```

### Bug #7: Modals Don't Trap Focus
**Problem:** Keyboard users can tab out of modal
```tsx
// ✗ BAD: No focus trap
<div role="dialog">
  <button onClick={onClose}>Close</button>
  <input />
</div>

// ✓ GOOD: Focus trapped (use Radix Dialog)
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    {/* Radix handles focus trap automatically */}
  </DialogContent>
</Dialog>
```

### Bug #8: Insufficient Color Contrast
**Problem:** Low vision users can't read text
```tsx
// ✗ BAD: 2:1 contrast
<p className="text-gray-400">Light gray on white</p>

// ✓ GOOD: 4.5:1 contrast
<p className="text-gray-700">Dark gray on white</p>
```

---

## Accessibility Testing Workflow for Boldteq Apps

### Pre-Deployment Checklist

1. **Automated Testing (5 minutes)**
   ```bash
   npm install --save-dev eslint-plugin-jsx-a11y
   npm run lint  # ESLint catches common mistakes
   ```

2. **Manual Keyboard Navigation (10 minutes)**
   - Unplug mouse or disable trackpad
   - Tab through entire app
   - Tab order should be logical (left-to-right, top-to-bottom)
   - No keyboard traps
   - Focus ring visible at all times

3. **Color Contrast Check (5 minutes)**
   - Use WebAIM Contrast Checker
   - Test normal text: 4.5:1 minimum
   - Test large text: 3:1 minimum
   - Test UI components: 3:1 minimum

4. **Screen Reader Test (15 minutes)**
   - macOS: VoiceOver (Cmd+F5)
   - Windows: NVDA (free) or JAWS
   - Test critical user flows:
     - Signup/login
     - Resume upload and ranking
     - Payment checkout
   - Verify landmarks, headings, form labels announced

5. **Lighthouse Audit (5 minutes)**
   - Chrome DevTools → Lighthouse
   - Accessibility score must be ≥ 90

### Continuous Testing
- Add `eslint-plugin-jsx-a11y` to CI/CD pipeline
- Run axe DevTools on every pull request
- Quarterly screen reader testing with actual users
- Monitor for accessibility regressions

---

## References

- [W3C Web Accessibility Initiative (WAI)](https://www.w3.org/WAI/)
- [WCAG 2.1 Specifications](https://www.w3.org/TR/WCAG21/)
- [WebAIM Standards & Guidelines](https://webaim.org/standards/)
- [Radix UI Accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)
- [React Accessibility Documentation](https://react.dev/learn/accessibility)
- [Deque axe DevTools](https://www.deque.com/axe/devtools/)
- [ARIA Authoring Practices (APG)](https://www.w3.org/WAI/ARIA/apg/)
- [ADA Title II Web Rule (April 2024)](https://www.ada.gov/resources/2024-03-08-web-rule/)
- [EN 301 549 European Accessibility Standard](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf)
- [Contrast Ratio Checker](https://contrast-ratio.com/)
