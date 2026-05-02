# Motion & Animation Design Guide for SaaS

**Last updated:** 2026-04-04

---

## Table of Contents

1. [Motion Principles](#motion-principles)
2. [Duration Scale](#duration-scale)
3. [Easing Functions](#easing-functions)
4. [Micro-Interactions](#micro-interactions)
5. [Framer Motion Patterns](#framer-motion-patterns)
6. [Tailwind Animation Classes](#tailwind-animation-classes)
7. [Accessibility](#accessibility)
8. [Performance Rules](#performance-rules)
9. [When NOT to Animate](#when-not-to-animate)

---

## Motion Principles

### Core Tenets

Motion in SaaS applications should follow four principles:

1. **Purposeful** — Every animation guides attention, clarifies hierarchy, or communicates state. Remove animations that exist only for aesthetics.
2. **Fast** — Animations in the 150-300ms range feel responsive and keep users in flow. Slower animations interrupt.
3. **Consistent** — Use the same easing curves across the entire application. Consistency builds trust and reduces cognitive load.
4. **Accessible** — Always respect `prefers-reduced-motion`. Color changes and opacity shifts can remain; transforms should be removed for users who prefer reduced motion.

### Why Motion Matters in SaaS

Thoughtful micro-interactions reduce frustration, confirm system responses, and make the product feel alive and polished. Research shows that adding progress bars during onboarding can boost activation rates by up to 47%.

---

## Duration Scale

Use this timing scale consistently across your app:

| Duration | Use Case | Examples |
|----------|----------|----------|
| **Instant (0ms)** | Immediate visual feedback, no perceptible delay | Color changes, opacity micro-shifts on hover |
| **Fast (100-150ms)** | Quick interactive responses | Hover states, focus rings, tooltip fade-in, button color shift |
| **Normal (200-250ms)** | Standard state changes | Toggle switches, tab content switch, dropdown open/close |
| **Slow (300-400ms)** | Deliberate entrance effects | Modal backdrop fade, drawer slide, sheet overlay |
| **Deliberate (500ms+)** | Page transitions, onboarding sequences | Page exit/enter, carousel slide, stepper progression |

**Rationale:** Users perceive 100-400ms as responsive and immediate. Animations faster than 100ms often feel janky; slower than 400ms feel sluggish unless intentional (like page transitions).

---

## Easing Functions

Easing controls the acceleration/deceleration of motion. Choose the right easing for the direction of movement.

### CSS Easing Values

```css
/* ease-out: Fast start, gentle stop — USE FOR ENTERING ELEMENTS */
cubic-bezier(0.16, 1, 0.3, 1)

/* ease-in: Gentle start, fast finish — USE FOR EXITING ELEMENTS */
cubic-bezier(0.4, 0, 1, 1)

/* ease-in-out: Symmetric acceleration — USE FOR POSITION CHANGES */
cubic-bezier(0.4, 0, 0.2, 1)

/* ease-linear: Constant velocity — USE FOR PROGRESS, LOADING */
cubic-bezier(0, 0, 1, 1)
```

### Spring Easing (Framer Motion / Motion Library)

Spring animations mimic real-world physics and feel natural. Use for interactive, gesture-driven animations:

```typescript
// Standard spring (stiffness, damping, mass)
const springConfig = {
  stiffness: 400,    // How "bouncy" (higher = faster)
  damping: 30,       // How much resistance (higher = less bounce)
  mass: 1            // Inertia (affects overshoot)
}

// Snappy spring (faster, less bounce)
const snappy = {
  stiffness: 500,
  damping: 40,
  mass: 1
}

// Bouncy spring (slower, more playful)
const bouncy = {
  stiffness: 300,
  damping: 15,
  mass: 0.8
}
```

### When to Use Each Easing

- **ease-out**: Button hover states, element fade-in, card entrance
- **ease-in**: Modal exit, element fade-out, drawer collapse
- **ease-in-out**: Position changes (translateY), width/height transitions (use sparingly)
- **spring**: Gesture interactions (drag, swipe), playful hover states, bounce on load
- **linear**: Progress bars, loading spinners, rotating icons (must be linear to avoid judder)

---

## Micro-Interactions

Micro-interactions are tiny animations that respond to user actions. They confirm input, guide attention, and make the UI feel responsive.

### 1. Button Hover

**Tailwind Only:**
```html
<button class="bg-primary text-white px-4 py-2 rounded
  hover:bg-primary/90
  transition-colors
  duration-150
  ease-out">
  Click me
</button>
```

**With Scale Press Effect (Framer Motion):**
```tsx
import { motion } from 'motion/react'

export function PressButton({ children }) {
  return (
    <motion.button
      whileHover={{ backgroundColor: 'rgb(var(--color-primary) / 0.9)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="bg-primary text-white px-4 py-2 rounded"
    >
      {children}
    </motion.button>
  )
}
```

### 2. Button Press / Tap Feedback

**Scale down on press, spring back:**
```tsx
<motion.button
  initial={{ scale: 1 }}
  whileTap={{ scale: 0.97 }}
  transition={{
    type: 'spring',
    stiffness: 400,
    damping: 30
  }}
>
  Press me
</motion.button>
```

### 3. Card Hover Elevation

**Tailwind with shadow transition:**
```html
<div class="bg-white rounded-lg p-6
  shadow-sm hover:shadow-lg
  transition-shadow duration-200 ease-out
  hover:-translate-y-0.5">
  Card content
</div>
```

**Framer Motion with translateY:**
```tsx
<motion.div
  whileHover={{
    y: -4,
    transition: { duration: 0.2 }
  }}
  className="shadow-sm hover:shadow-lg"
>
  Card content
</motion.div>
```

### 4. Toggle Switch

**Smooth slide with color transition:**
```tsx
import { motion } from 'motion/react'

export function Toggle({ enabled, onChange }) {
  return (
    <motion.button
      onClick={() => onChange(!enabled)}
      animate={{
        backgroundColor: enabled ? '#10b981' : '#e5e7eb'
      }}
      className="relative inline-flex h-6 w-11 rounded-full cursor-pointer"
      transition={{ duration: 0.2 }}
    >
      <motion.div
        animate={{ x: enabled ? 20 : 4 }}
        className="w-5 h-5 bg-white rounded-full shadow"
        transition={{ duration: 0.2, type: 'spring', stiffness: 400 }}
      />
    </motion.button>
  )
}
```

### 5. Checkbox Bounce on Check

**Scale bounce: 0.9 → 1.1 → 1.0:**
```tsx
<motion.div
  animate={isChecked ? { scale: [0.9, 1.1, 1.0] } : { scale: 1 }}
  transition={{ duration: 0.3, type: 'spring', stiffness: 400 }}
  className="w-5 h-5 border-2 rounded"
>
  {isChecked && <Check size={16} />}
</motion.div>
```

### 6. Dropdown / Popover

**Fade + slide from origin (150ms):**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Dropdown({ open, items }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute top-full mt-2 bg-white rounded-lg shadow-lg"
        >
          {items.map(item => (
            <button key={item.id} className="w-full px-4 py-2 text-left hover:bg-gray-50">
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

### 7. Modal Enter & Exit

**Backdrop fade 200ms + content scale(0.95→1) + opacity(0→1) 250ms:**

```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Modal({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 flex items-center justify-center"
          >
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

### 8. Drawer / Sheet (Slide from Edge)

**Slide from bottom or side, 300ms ease-out:**

```tsx
export function Sheet({ open, onClose, children, side = 'bottom' }) {
  const variants = {
    bottom: {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%' }
    },
    right: {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' }
    }
  }

  const variant = variants[side]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40"
          />
          <motion.div
            initial={variant.initial}
            animate={variant.animate}
            exit={variant.exit}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-0 right-0 bg-white rounded-t-lg shadow-2xl w-full sm:w-96"
          >
            <div className="p-6 max-h-screen overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

### 9. Toast Notification

**Slide in from bottom-right, auto-dismiss slide out:**

```tsx
export function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, y: 100 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 100, y: 100 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-4"
    >
      {message}
    </motion.div>
  )
}
```

### 10. Accordion (Smooth Height Animation)

**Use grid-rows trick for smooth height transitions:**

```tsx
export function Accordion({ items }) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="border rounded">
          <button
            onClick={() => setExpanded(expanded === idx ? null : idx)}
            className="w-full px-4 py-3 text-left font-medium hover:bg-gray-50"
          >
            {item.title}
          </button>

          {/* Height animation using grid-rows */}
          <motion.div
            animate={{ height: expanded === idx ? 'auto' : 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            style={{ gridAutoRows: 'auto' }}
          >
            <div className="px-4 pb-3 text-sm text-gray-600">
              {item.content}
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  )
}
```

### 11. Skeleton Shimmer

**Linear gradient sweep left to right:**

```css
@keyframes shimmer {
  0% {
    backgroundPosition: -1000px 0;
  }
  100% {
    backgroundPosition: 1000px 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #f3f4f6 0%,
    #e5e7eb 50%,
    #f3f4f6 100%
  );
  backgroundSize: 1000px 100%;
  animation: shimmer 2s infinite;
}
```

**Tailwind approach:**
```html
<div class="animate-pulse bg-gray-200 h-12 rounded"></div>
```

### 12. Loading Spinner

**Continuous rotation, 1s linear infinite:**

```tsx
<motion.div
  animate={{ rotate: 360 }}
  transition={{
    duration: 1,
    ease: 'linear',
    repeat: Infinity
  }}
  className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full"
/>
```

**Tailwind:**
```html
<div class="animate-spin w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full"></div>
```

### 13. Success Checkmark (SVG Path Draw)

**Path draw animation with stroke:**

```tsx
export function SuccessCheckmark() {
  const pathVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        duration: 0.6,
        ease: 'easeInOut'
      }
    }
  }

  return (
    <motion.svg width="64" height="64" viewBox="0 0 64 64">
      <motion.circle
        cx="32"
        cy="32"
        r="30"
        fill="none"
        stroke="#10b981"
        strokeWidth="2"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.path
        d="M 20 32 L 28 40 L 44 24"
        fill="none"
        stroke="#10b981"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={pathVariants}
        initial="hidden"
        animate="visible"
      />
    </motion.svg>
  )
}
```

### 14. Number Counter

**Count up with easeOut, 1-2s duration:**

```tsx
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

export function CounterNumber({ target = 100 }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let interval: NodeJS.Timeout
    const increment = target / 20 // Spread across ~1s (50ms per tick)

    if (count < target) {
      interval = setInterval(() => {
        setCount(prev => Math.min(prev + increment, target))
      }, 50)
    }

    return () => clearInterval(interval)
  }, [count, target])

  return <span>{Math.round(count)}</span>
}

// Or with Framer Motion's useMotionValue
export function CounterMotion({ target = 100 }) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, Math.round)

  useEffect(() => {
    const controls = animate(count, target, {
      duration: 1.5,
      ease: 'easeOut'
    })
    return () => controls.stop()
  }, [target])

  return <motion.span>{rounded}</motion.span>
}
```

### 15. List Stagger (Sequential Appearance)

**Items appear sequentially with 50ms delay between each:**

```tsx
import { motion } from 'motion/react'

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05, // 50ms per item
      duration: 0.3,
      ease: 'easeOut'
    }
  })
}

export function ListStagger({ items }) {
  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      className="space-y-2"
    >
      {items.map((item, i) => (
        <motion.li
          key={item.id}
          variants={itemVariants}
          custom={i}
          className="p-3 bg-white rounded border"
        >
          {item.label}
        </motion.li>
      ))}
    </motion.ul>
  )
}
```

### 16. Tab Content Switch

**Fade + slight slide (10px) on tab change:**

```tsx
const tabVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 }
}

export function TabContent({ activeTab, content }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        variants={tabVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {content[activeTab]}
      </motion.div>
    </AnimatePresence>
  )
}
```

### 17. Sidebar Collapse

**Width transition 200ms + content fade:**

```tsx
export function Sidebar({ collapsed, children }) {
  return (
    <motion.div
      animate={{ width: collapsed ? '0px' : '250px' }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="overflow-hidden bg-white border-r"
    >
      <motion.div
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        className="p-4"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
```

---

## Framer Motion Patterns

### 1. Basic Motion Component with Variants

```tsx
import { motion } from 'motion/react'

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' }
  },
  hover: {
    y: -4,
    transition: { duration: 0.2 }
  }
}

export function Card({ title, children }) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      className="p-4 bg-white rounded-lg border"
    >
      <h3>{title}</h3>
      {children}
    </motion.div>
  )
}
```

### 2. AnimatePresence for Mount/Unmount

```tsx
import { AnimatePresence, motion } from 'motion/react'

export function NotificationList({ notifications, onDismiss }) {
  return (
    <div className="fixed bottom-4 right-4 space-y-2">
      <AnimatePresence>
        {notifications.map(notif => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.2 }}
            onAnimationComplete={() => {
              setTimeout(() => onDismiss(notif.id), 2500)
            }}
            className="bg-white rounded-lg shadow-lg p-4"
          >
            {notif.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
```

### 3. Layout Animations (Shared Element Transitions)

```tsx
import { motion } from 'motion/react'

export function SharedElementExample() {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="grid grid-cols-3 gap-4">
      {['A', 'B', 'C'].map(letter => (
        <motion.div
          key={letter}
          layoutId={`card-${letter}`}
          onClick={() => setSelected(letter)}
          className={`p-6 rounded-lg cursor-pointer ${
            selected === letter ? 'bg-primary text-white' : 'bg-gray-100'
          }`}
        >
          {letter}
        </motion.div>
      ))}
    </div>
  )
}
```

### 4. useMotionValue and useTransform for Scroll Effects

```tsx
import { useScroll, useTransform, motion } from 'motion/react'
import { useRef } from 'react'

export function ScrollLinkAnimation() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref })
  const scale = useTransform(scrollYProgress, [0, 1], [0.8, 1])
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.5, 1])

  return (
    <motion.div
      ref={ref}
      style={{ scale, opacity }}
      className="p-8 bg-white rounded-lg"
    >
      Scroll to animate
    </motion.div>
  )
}
```

### 5. Gesture Animations (whileHover, whileTap, whileDrag)

```tsx
export function GestureButton() {
  return (
    <motion.button
      whileHover={{ scale: 1.05, backgroundColor: '#f0f0f0' }}
      whileTap={{ scale: 0.95 }}
      whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
      drag
      dragConstraints={{ left: -100, right: 100 }}
      className="px-4 py-2 bg-white rounded-lg border"
    >
      Drag me
    </motion.button>
  )
}
```

### 6. Stagger Children Pattern

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05 // 50ms between each child
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

export function StaggeredList({ items }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {items.map(item => (
        <motion.div
          key={item.id}
          variants={itemVariants}
          className="p-3 bg-white border rounded"
        >
          {item.label}
        </motion.div>
      ))}
    </motion.div>
  )
}
```

### 7. Using useReducedMotion Hook

```tsx
import { motion, useReducedMotion } from 'motion/react'

export function AccessibleAnimation() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      animate={{ x: shouldReduceMotion ? 0 : 100 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
    >
      Content
    </motion.div>
  )
}
```

---

## Tailwind Animation Classes

### Built-in Utilities

```html
<!-- Spin (continuous rotation) -->
<div class="animate-spin w-8 h-8 border-4 border-t-primary rounded-full"></div>

<!-- Pulse (fade in and out) -->
<div class="animate-pulse w-12 h-12 bg-gray-200 rounded"></div>

<!-- Bounce (up and down) -->
<div class="animate-bounce">Loading...</div>

<!-- Ping (expand and fade, for notifications) -->
<span class="animate-ping absolute inline-flex w-2 h-2 rounded-full bg-red-500"></span>
```

### Transition Utilities

```html
<!-- Basic transition on any property -->
<div class="transition-all duration-200 hover:bg-primary hover:shadow-lg">
  Transitioning element
</div>

<!-- Specific properties -->
<div class="transition-colors duration-200">Color only</div>
<div class="transition-opacity duration-200">Opacity only</div>
<div class="transition-transform duration-200">Transform only</div>

<!-- Custom easing -->
<div class="transition-all duration-200 ease-out">Ease out</div>
<div class="transition-all duration-200 ease-in-out">Ease in out</div>
```

### Duration Classes

```html
<div class="duration-75">75ms</div>
<div class="duration-100">100ms</div>
<div class="duration-150">150ms (fast micro-interactions)</div>
<div class="duration-200">200ms (standard state changes)</div>
<div class="duration-300">300ms (modals, drawers)</div>
<div class="duration-500">500ms (page transitions)</div>
```

### Custom Animations in tailwind.config.ts

```typescript
module.exports = {
  theme: {
    extend: {
      animation: {
        // Fade in and out
        fadeInOut: 'fadeInOut 2s infinite',
        // Slide in from left
        slideIn: 'slideIn 0.3s ease-out forwards',
        // Bounce with more control
        customBounce: 'customBounce 0.8s ease-out 3',
      },
      keyframes: {
        fadeInOut: {
          '0%, 100%': { opacity: '0' },
          '50%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        customBounce: {
          '0%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
}
```

### Motion-Safe / Reduced Motion in Tailwind

```html
<!-- Animation removed if user prefers reduced motion -->
<div class="animate-pulse motion-reduce:animate-none">
  Skeleton loader
</div>

<!-- Transform removed but opacity change stays -->
<div class="hover:scale-105 hover:shadow-lg motion-reduce:scale-100">
  Card
</div>

<!-- Transition disabled -->
<div class="transition-colors motion-reduce:transition-none duration-200">
  Color transition
</div>
```

---

## Accessibility

### prefers-reduced-motion Media Query

Respect user preferences. Some users experience distraction or nausea from animated content. Vestibular disorders can cause dizziness, nausea, and headaches from motion.

### CSS Implementation

```css
@media (prefers-reduced-motion: reduce) {
  /* Remove all animations */
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Or selectively remove transforms */
@media (prefers-reduced-motion: reduce) {
  .bounce-on-hover:hover {
    transform: none;
  }

  /* But keep color changes */
  .color-transition {
    transition: background-color 0.2s ease-out;
  }
}
```

### Tailwind Implementation

```html
<!-- Keep color transition, remove transform -->
<div class="hover:bg-primary hover:scale-105
  motion-reduce:scale-100
  transition-colors duration-200">
  Button
</div>

<!-- Disable animation entirely for reduced motion -->
<div class="animate-spin motion-reduce:animate-none">
  Loading
</div>
```

### JavaScript with Framer Motion

```tsx
import { motion, useReducedMotion } from 'motion/react'

export function AccessibleCard({ children }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      whileHover={shouldReduceMotion ? {} : { y: -4 }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}
```

### What to Keep Even with Reduced Motion

- Color changes and background shifts
- Opacity/fade transitions
- Focus ring highlights
- Content state changes

### What to Remove

- Transform (translateX, translateY, rotate, scale)
- Position changes (top, left, bottom, right)
- Bounce and spring animations
- Carousel auto-play
- Scroll-triggered animations

### WCAG Compliance

- **WCAG 2.1 Success Criterion 2.3.3 (AAA)** requires a way to disable non-essential animations triggered by user actions
- Every modern browser supports `prefers-reduced-motion` (Chrome, Edge, Firefox, Safari, Opera)
- Testing: Chrome DevTools → Rendering → Emulate CSS media feature prefers-reduced-motion

---

## Performance Rules

### ONLY Animate These Properties

These properties are GPU-composited and don't trigger layout recalculations:

```tsx
// GOOD - GPU accelerated
<motion.div
  animate={{
    transform: 'translateX(100px)',      // ✓ Use transform
    opacity: 0.5,                        // ✓ Use opacity
  }}
/>

// Also good - 3D transforms for better GPU support
<motion.div
  animate={{
    x: 100,                              // ✓ Framer shorthand for translateX
    y: 50,                               // ✓ Framer shorthand for translateY
    rotate: 45,                          // ✓ Rotation
    scale: 1.1,                          // ✓ Scale
    opacity: 0.8                         // ✓ Opacity
  }}
/>
```

### NEVER Animate These Properties

These trigger layout recalculation (very expensive):

```tsx
// BAD - Causes layout thrashing
<div
  animate={{
    width: '100px',        // ✗ Triggers layout
    height: '100px',       // ✗ Triggers layout
    left: '50px',          // ✗ Triggers layout
    top: '50px',           // ✗ Triggers layout
    margin: '10px',        // ✗ Triggers layout
    padding: '10px',       // ✗ Triggers layout
  }}
/>
```

### will-change Sparingly

Only use `will-change` for elements you KNOW will be animated:

```css
/* GOOD - Prepare only known animations */
.animated-button {
  will-change: transform, opacity;
  transition: all 0.2s ease-out;
}

/* BAD - Using will-change on everything */
.card {
  will-change: all; /* ✗ Wastes GPU memory */
}
```

### Avoid Animating During Scroll

Use passive scroll listeners and debounce:

```tsx
// GOOD - Passive scroll listener
useEffect(() => {
  const handleScroll = () => {
    // Update state, don't animate
    setScrollPosition(window.scrollY)
  }

  window.addEventListener('scroll', handleScroll, { passive: true })
  return () => window.removeEventListener('scroll', handleScroll)
}, [])

// For animation, use whileInView instead
<motion.div
  whileInView={{ opacity: 1 }}
  initial={{ opacity: 0 }}
  transition={{ duration: 0.3 }}
/>
```

### Batch DOM Reads and Writes

```tsx
// BAD - Interleaved reads and writes
for (let i = 0; i < items.length; i++) {
  items[i].offsetHeight      // Read (triggers layout)
  items[i].style.transform = `translateY(${i * 20}px)` // Write
}

// GOOD - Batch all reads, then writes
const heights = items.map(item => item.offsetHeight)
items.forEach((item, i) => {
  item.style.transform = `translateY(${i * 20}px)`
})
```

### Performance Monitoring

```typescript
// Use Chrome DevTools Performance tab
// Look for: Frame rate = 60fps (16ms per frame)
// Avoid: Red bars (dropped frames)

// Test on low-end devices
// Use Lighthouse audits

// Monitor with performance API
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 50) {
      console.warn('Animation took too long:', entry)
    }
  }
})

observer.observe({ entryTypes: ['measure'] })
```

---

## When NOT to Animate

### 1. Data Tables and Spreadsheets

No animations on rows or cell content. Users need to focus on data, not motion.

```tsx
// WRONG
<motion.tr animate={{ opacity: [0, 1] }}>
  <td>{row.name}</td>
  <td>{row.value}</td>
</motion.tr>

// RIGHT - No animation
<tr>
  <td>{row.name}</td>
  <td>{row.value}</td>
</tr>
```

### 2. Form Input Typing

No animations on text input content. Keep it instant.

```tsx
// WRONG - Don't animate input value
<motion.input
  value={value}
  animate={{ color: value ? 'black' : 'gray' }}
/>

// RIGHT - Only animate the wrapper/border
<motion.div
  animate={{ borderColor: focused ? 'primary' : 'gray' }}
>
  <input value={value} onChange={...} />
</motion.div>
```

### 3. Body Text Content

No animations on paragraphs or long content. Distracts from reading.

```tsx
// WRONG
<motion.p animate={{ opacity: [0, 1] }}>
  Long paragraph of important text...
</motion.p>

// RIGHT - Static, just load it
<p>Long paragraph of important text...</p>
```

### 4. Critical Error States

Show errors instantly. Users need immediate visual feedback on problems.

```tsx
// WRONG
<motion.div
  animate={{ opacity: [0, 1] }}
  transition={{ duration: 0.5 }}
>
  ✕ Your password is incorrect
</motion.div>

// RIGHT - Show immediately
<div className="text-red-600">
  ✕ Your password is incorrect
</div>
```

### 5. Print Views

Never animate elements intended for print. Use CSS to hide animations:

```css
@media print {
  * {
    animation: none !important;
    transition: none !important;
  }

  .no-print {
    display: none;
  }
}
```

---

## Summary: Motion Quick Checklist

Before shipping any animation, ask:

- [ ] **Purposeful?** Does it guide attention or communicate state?
- [ ] **Fast enough?** Between 100-400ms (not <100ms or >500ms unless intentional)?
- [ ] **Consistent easing?** Uses the same timing functions as the rest of the app?
- [ ] **Accessible?** Respects `prefers-reduced-motion` and removes transforms?
- [ ] **Performant?** Only animates transform and opacity?
- [ ] **Not overdone?** Not on tables, text input, body content, or error states?
- [ ] **Tested on low-end devices?** Maintains 60fps on older hardware?

---

## Component Animation Presets

This is a complete lookup table mapping every common SaaS component to its exact animation specification. Koda and implementation agents reference this directly to ensure consistency across the project.

---

### Page Enter (Route Transition)

**Animation:** Fade + slide up
**Duration:** 200ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
```

---

### Page Exit

**Animation:** Fade out
**Duration:** 150ms
**Easing:** ease-in
**Code:**
```tsx
<AnimatePresence>
  <motion.div
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15, ease: 'easeIn' }}
  >
    {content}
  </motion.div>
</AnimatePresence>
```

---

### Sidebar Expand/Collapse

**Animation:** Width tween + content fade
**Duration:** 200ms
**Easing:** ease-in-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function Sidebar({ isOpen }) {
  return (
    <motion.div
      initial={false}
      animate={{ width: isOpen ? 280 : 60 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <motion.div
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Sidebar content */}
      </motion.div>
    </motion.div>
  )
}
```

---

### Mobile Nav (Sheet)

**Animation:** Slide from left
**Duration:** 300ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function MobileNav({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30
            }}
            className="fixed left-0 top-0 h-full w-80 bg-white z-50"
          >
            {/* Nav content */}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

### Command Palette (cmdk)

**Animation:** Scale from 0.95 + fade
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function CommandPalette({ open }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-1/3 left-1/2 -translate-x-1/2 w-96 z-50"
          >
            {/* Command palette */}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

### Card Hover

**Animation:** translateY + shadow increase
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function Card({ children }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="rounded-lg border shadow-sm hover:shadow-md transition-shadow"
    >
      {children}
    </motion.div>
  )
}
```

---

### Card Enter (List Stagger)

**Animation:** Staggered fade + slide up
**Duration:** 200ms (first), 50ms stagger
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function CardList({ items }) {
  return (
    <motion.div layout>
      <AnimatePresence>
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{
              duration: 0.2,
              ease: 'easeOut',
              delay: i * 0.05
            }}
          >
            {/* Card content */}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
```

---

### Accordion Expand/Collapse

**Animation:** Height auto-animate
**Duration:** 200ms
**Easing:** ease-in-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function AccordionItem({ isOpen, children, trigger }) {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div className="border-b">
      <button onClick={onToggle}>
        {trigger}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="accordion-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
            ref={contentRef}
          >
            <div className="p-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

### Tab Content Switch

**Animation:** Fade crossfade
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function TabContent({ activeTab, tabs }) {
  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {tabs[activeTab]?.content}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
```

---

### Modal/Dialog Open

**Animation:** Scale from 0.95 + fade
**Duration:** 200ms
**Easing:** Spring (stiffness: 300, damping: 30)
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Dialog({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30
            }}
            className="fixed inset-0 flex items-center justify-center z-50"
          >
            <div className="bg-white rounded-lg shadow-2xl max-w-md">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

### Modal/Dialog Close

**Animation:** Scale to 0.95 + fade out
**Duration:** 150ms
**Easing:** ease-in
**Code:**
```tsx
<AnimatePresence>
  {!open && (
    <motion.div
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15, ease: 'easeIn' }}
    />
  )}
</AnimatePresence>
```

---

### Drawer Open

**Animation:** Slide from right
**Duration:** 300ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Drawer({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            initial={{ x: 384 }}
            animate={{ x: 0 }}
            exit={{ x: 384 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30
            }}
            className="fixed right-0 top-0 h-full w-96 bg-white z-50"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

### Sheet (Mobile Bottom)

**Animation:** Slide from bottom
**Duration:** 300ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Sheet({ open, onClose, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            initial={{ y: 480, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 480, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30
            }}
            className="fixed bottom-0 left-0 right-0 max-h-96 bg-white rounded-t-2xl z-50"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

---

### Dropdown Menu

**Animation:** Scale from 0.95 + fade, origin top
**Duration:** 100ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function DropdownMenu({ open, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.1, ease: 'easeOut' }}
          style={{ originY: 0 }}
          className="absolute top-full mt-2 min-w-48 bg-white rounded-lg shadow-lg border"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

---

### Popover

**Animation:** Scale from 0.95 + fade, origin dependent on placement
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Popover({ open, placement = 'top', children }) {
  const getOrigin = (placement: string) => {
    switch (placement) {
      case 'top': return { originY: 1 }
      case 'bottom': return { originY: 0 }
      case 'left': return { originX: 1 }
      case 'right': return { originX: 0 }
      default: return {}
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={getOrigin(placement)}
          className="bg-white rounded-lg shadow-lg border p-4"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

---

### Tooltip

**Animation:** Fade + translate 4px toward anchor
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Tooltip({ show, children, direction = 'top' }) {
  const getTransform = (dir: string) => {
    switch (dir) {
      case 'top': return { y: -4 }
      case 'bottom': return { y: 4 }
      case 'left': return { x: -4 }
      case 'right': return { x: 4 }
      default: return {}
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, ...getTransform(direction) }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, ...getTransform(direction) }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute bg-gray-900 text-white text-xs rounded px-2 py-1 z-50 pointer-events-none"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

---

### Toast Enter

**Animation:** Slide from right + fade
**Duration:** 200ms
**Easing:** ease-out
**Note:** Sonner handles this, but for custom implementations:
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function Toast({ id, message, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 384 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 384 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-4"
    >
      {message}
    </motion.div>
  )
}
```

---

### Toast Exit

**Animation:** Slide right + fade out
**Duration:** 150ms
**Easing:** ease-in
**Code:**
```tsx
<AnimatePresence mode="popLayout">
  <motion.div
    exit={{ opacity: 0, x: 384 }}
    transition={{ duration: 0.15, ease: 'easeIn' }}
  />
</AnimatePresence>
```

---

### Alert Banner Enter

**Animation:** Height expand + fade
**Duration:** 200ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function AlertBanner({ show, children }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

---

### Skeleton Pulse

**Animation:** Opacity 0.5 → 1 → 0.5 infinite
**Duration:** 1.5s
**Easing:** ease-in-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function Skeleton({ className }) {
  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, ease: 'easeInOut', repeat: Infinity }}
      className={`bg-gray-200 rounded ${className}`}
    />
  )
}

// Or use Tailwind:
// className="animate-pulse bg-gray-200"
```

---

### Spinner

**Animation:** Rotate 360deg infinite
**Duration:** 0.6s
**Easing:** linear
**Code:**
```tsx
import { motion } from 'motion/react'

export function Spinner() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
      className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"
    />
  )
}

// Or use Tailwind:
// className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"
```

---

### Progress Bar

**Animation:** Width tween
**Duration:** 300ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function ProgressBar({ progress }) {
  return (
    <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="h-full bg-blue-500"
      />
    </div>
  )
}
```

---

### Table Row Hover

**Animation:** Background color transition
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function TableRow({ children }) {
  return (
    <motion.tr
      whileHover={{ backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.tr>
  )
}

// Or use Tailwind:
// className="hover:bg-blue-50 transition-colors duration-150"
```

---

### Table Sort Column Highlight

**Animation:** Column highlight flash
**Duration:** 300ms
**Easing:** ease-in-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function TableHeader({ isSorted, onClick }) {
  return (
    <motion.th
      onClick={onClick}
      initial={false}
      animate={isSorted ? { backgroundColor: 'rgba(59, 130, 246, 0.1)' } : {}}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="cursor-pointer select-none"
    >
      Sort Column
    </motion.th>
  )
}
```

---

### Chart Data Update

**Animation:** Bar/line tween to new values
**Duration:** 500ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function AnimatedBar({ value, maxValue }) {
  return (
    <motion.div
      initial={{ height: 0 }}
      animate={{ height: `${(value / maxValue) * 100}%` }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="bg-blue-500 rounded-t"
    />
  )
}

// For Recharts with custom shape:
const AnimatedBarShape = (props) => {
  const { fill, x, y, width, height } = props
  return (
    <motion.rect
      x={x}
      y={y}
      width={width}
      fill={fill}
      initial={{ height: 0, y: y + height }}
      animate={{ height, y }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    />
  )
}
```

---

### KPI Card Number Change

**Animation:** Count-up animation
**Duration:** 1s
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

export function AnimatedNumber({ value }) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayValue(prev => {
        if (prev < value) return Math.min(prev + Math.ceil((value - prev) / 10), value)
        if (prev > value) return Math.max(prev - Math.ceil((prev - value) / 10), value)
        return value
      })
    }, 50)
    return () => clearInterval(interval)
  }, [value])

  return (
    <motion.div
      key={displayValue}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {displayValue.toLocaleString()}
    </motion.div>
  )
}
```

---

### Empty State Enter

**Animation:** Scale from 0.9 + fade
**Duration:** 300ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function EmptyState({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      {children}
    </motion.div>
  )
}
```

---

### Button Press

**Animation:** Scale(0.97)
**Duration:** 100ms
**Easing:** Spring (stiffness: 400, damping: 40)
**Code:**
```tsx
import { motion } from 'motion/react'

export function Button({ children, onClick }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 40
      }}
      onClick={onClick}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {children}
    </motion.button>
  )
}
```

---

### Button Hover

**Animation:** Background color transition
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
<motion.button
  whileHover={{ backgroundColor: '#0ea5e9' }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
  className="px-4 py-2 bg-blue-500 text-white rounded"
>
  Hover Me
</motion.button>

// Or Tailwind:
// className="... hover:bg-blue-600 transition-colors duration-150"
```

---

### Toggle/Switch

**Animation:** Translate circle
**Duration:** 200ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { motion } from 'motion/react'

export function Toggle({ enabled, onToggle }) {
  return (
    <motion.button
      onClick={onToggle}
      className={`relative w-12 h-6 rounded-full ${
        enabled ? 'bg-green-500' : 'bg-gray-300'
      }`}
    >
      <motion.div
        initial={false}
        animate={{ x: enabled ? 24 : 0 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30
        }}
        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
      />
    </motion.button>
  )
}
```

---

### Checkbox Check

**Animation:** SVG path draw
**Duration:** 200ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function Checkbox({ checked, onChange }) {
  return (
    <motion.input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-5 h-5 accent-blue-500"
    />
  )
}

// Or custom SVG with path animation:
export function CustomCheckbox({ checked }) {
  return (
    <motion.svg width="20" height="20" viewBox="0 0 20 20">
      <motion.path
        d="M3 10l5 5L17 4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: checked ? 1 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}
```

---

### Radio Select

**Animation:** Scale inner dot from 0
**Duration:** 150ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { motion } from 'motion/react'

export function Radio({ selected, onChange }) {
  return (
    <button
      onClick={onChange}
      className="relative w-5 h-5 rounded-full border-2 border-gray-300"
    >
      <motion.div
        initial={false}
        animate={{ scale: selected ? 1 : 0 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30
        }}
        className="absolute inset-1 rounded-full bg-blue-500"
      />
    </button>
  )
}
```

---

### Input Focus

**Animation:** Ring expand from center
**Duration:** 150ms
**Easing:** ease-out
**Code:**
```tsx
<motion.input
  type="text"
  whileFocus={{
    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1), 0 0 0 5px rgba(59, 130, 246, 0.5)'
  }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
  className="px-3 py-2 border border-gray-300 rounded focus:outline-none"
/>
```

---

### Select Open

**Animation:** Listbox scale from 0.95
**Duration:** 100ms
**Easing:** ease-out
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function SelectDropdown({ open, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.ul
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.1, ease: 'easeOut' }}
          className="absolute top-full mt-1 min-w-full bg-white rounded shadow-lg border"
        >
          {children}
        </motion.ul>
      )}
    </AnimatePresence>
  )
}
```

---

### Breadcrumb Separator Fade In

**Animation:** Fade in on mount
**Duration:** 100ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function Breadcrumb({ items }) {
  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1, delay: i * 0.05 }}
          className="flex items-center gap-2"
        >
          {i > 0 && <span className="text-gray-400">/</span>}
          <a href={item.href}>{item.label}</a>
        </motion.div>
      ))}
    </nav>
  )
}
```

---

### Tab Underline

**Animation:** translateX to active tab
**Duration:** 300ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { motion } from 'motion/react'

export function Tabs({ activeTab, tabs, onChangeTab }) {
  const [underlineX, setUnderlineX] = useState(0)
  const tabRefs = useRef([])

  useEffect(() => {
    if (tabRefs.current[activeTab]) {
      const rect = tabRefs.current[activeTab].getBoundingClientRect()
      setUnderlineX(rect.left - tabRefs.current[0].parentElement.getBoundingClientRect().left)
    }
  }, [activeTab])

  return (
    <div className="relative border-b">
      <div className="flex gap-4">
        {tabs.map((tab, i) => (
          <button
            ref={el => tabRefs.current[i] = el}
            key={tab.id}
            onClick={() => onChangeTab(i)}
            className={activeTab === i ? 'text-blue-500' : 'text-gray-600'}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <motion.div
        animate={{ x: underlineX, width: tabRefs.current[activeTab]?.offsetWidth }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="absolute bottom-0 h-0.5 bg-blue-500"
      />
    </div>
  )
}
```

---

### Nav Item Active Indicator

**Animation:** translateY to active
**Duration:** 300ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { motion } from 'motion/react'

export function NavList({ activeIndex, items }) {
  const itemHeight = 40

  return (
    <div className="relative">
      <motion.div
        animate={{ y: activeIndex * itemHeight }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="absolute left-0 top-0 h-10 w-1 bg-blue-500 rounded-r"
      />
      <ul>
        {items.map((item, i) => (
          <li key={item.id} className="h-10 flex items-center">
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

---

### Badge Count Update

**Animation:** Scale bounce (1 → 1.2 → 1)
**Duration:** 300ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function Badge({ count }) {
  return (
    <motion.div
      key={count}
      animate={{ scale: [1, 1.2, 1] }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full"
    >
      {count}
    </motion.div>
  )
}
```

---

### Notification Dot

**Animation:** Scale from 0
**Duration:** 200ms
**Easing:** Spring (stiffness: 500, damping: 25)
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'

export function NotificationDot({ show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 25
          }}
          className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full"
        />
      )}
    </AnimatePresence>
  )
}
```

---

### Status Indicator (Online/Offline)

**Animation:** Color transition + pulse on change
**Duration:** 200ms + pulse
**Easing:** ease-in-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function StatusIndicator({ isOnline }) {
  return (
    <motion.div
      animate={{
        backgroundColor: isOnline ? '#22c55e' : '#ef4444'
      }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="w-3 h-3 rounded-full"
    >
      {isOnline && (
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.3, repeat: Infinity, delay: 0.5 }}
          className="w-3 h-3 rounded-full bg-green-500 absolute"
        />
      )}
    </motion.div>
  )
}
```

---

### Unread Count Badge

**Animation:** Scale bump on increment
**Duration:** 300ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { motion } from 'motion/react'

export function UnreadBadge({ count }) {
  return (
    <motion.span
      key={count}
      animate={{ scale: [1, 1.15, 1] }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30
      }}
      className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-500 rounded-full ml-1"
    >
      {count}
    </motion.span>
  )
}
```

---

### Copy to Clipboard Feedback

**Animation:** Checkmark scale from 0
**Duration:** 300ms
**Easing:** Spring (stiffness: 400, damping: 30)
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'

export function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.button
      onClick={handleCopy}
      className="flex items-center gap-2"
    >
      <span>{label}</span>
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div
            key="checkmark"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <Check className="w-4 h-4 text-green-500" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.button>
  )
}
```

---

### Like/Favorite

**Animation:** Heart scale bounce
**Duration:** 300ms
**Easing:** Spring (stiffness: 300, damping: 20)
**Code:**
```tsx
import { AnimatePresence, motion } from 'motion/react'
import { Heart } from 'lucide-react'

export function LikeButton({ isLiked, onToggle }) {
  return (
    <motion.button
      onClick={onToggle}
      className="p-2"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={isLiked ? 'liked' : 'unliked'}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 20
          }}
        >
          <Heart
            className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
          />
        </motion.div>
      </AnimatePresence>
    </motion.button>
  )
}
```

---

### Image Load (Blur Fade)

**Animation:** Blur(20px) → blur(0) + opacity
**Duration:** 300ms
**Easing:** ease-out
**Code:**
```tsx
import { motion } from 'motion/react'

export function LazyImage({ src, alt }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <motion.img
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      initial={{ filter: 'blur(20px)', opacity: 0 }}
      animate={loaded ? { filter: 'blur(0)', opacity: 1 } : {}}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    />
  )
}
```

---

### Reduced Motion Overrides

When a user has `prefers-reduced-motion: reduce` set in their operating system preferences, animations must be respectfully disabled or significantly simplified:

```tsx
// Hook to detect reduced motion preference
export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return prefersReducedMotion
}

// Apply across all animations:
export function AnimatedComponent({ children }) {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion
          ? { duration: 0, delay: 0 }
          : { duration: 0.2, ease: 'easeOut' }
      }
    >
      {children}
    </motion.div>
  )
}

// Override rules when prefers-reduced-motion is active:
// - Remove all translateY/translateX animations (no movement transforms)
// - Keep opacity transitions ONLY, reduced to 100ms
// - Remove all spring physics (use duration-based only)
// - Keep functional animations (progress bars, loading spinners, data transitions)
// - Remove ALL decorative animations (hover effects, bounces, scale effects, shadows)
// - Maintain scale(1) for buttons instead of whileTap={{ scale: 0.97 }}
// - Disable count-up animations; show final value immediately

// Utility to wrap all animated components:
export const getTransition = (prefersReducedMotion: boolean, type: 'normal' | 'fast' | 'slow') => {
  if (prefersReducedMotion) {
    // Opacity-only, minimal duration
    return { duration: 0.1, ease: 'linear' }
  }

  switch (type) {
    case 'fast':
      return { duration: 0.15, ease: 'easeOut' }
    case 'slow':
      return { duration: 0.3, ease: 'easeOut' }
    default:
      return { duration: 0.2, ease: 'easeOut' }
  }
}

// CSS fallback for non-JS animations:
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## References & Further Reading

- [Motion Library (formerly Framer Motion)](https://motion.dev/) — React animation library
- [Web Animation Performance Tier List](https://motion.dev/magazine/web-animation-performance-tier-list) — Motion Magazine
- [Animation Performance Guide](https://motion.dev/docs/performance) — Motion docs
- [Micro-interaction Examples for UX](https://userpilot.com/blog/micro-interaction-examples/) — User Pilot
- [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) — MDN Web Docs
- [WCAG 2.1 Success Criterion 2.3.3](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html) — W3C WAI
- [GPU Animation Best Practices](https://www.smashingmagazine.com/2016/12/gpu-animation-doing-it-right/) — Smashing Magazine
- [Tailwind CSS Animation Utilities](https://tailwindcss.com/docs/animation) — Tailwind docs
- [React Spring Physics-Based Animation](https://www.react-spring.dev/) — React Spring docs
