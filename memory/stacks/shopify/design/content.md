# Content & Microcopy — UX Writing Guidelines

> Source: shopify.dev/docs/apps/design/user-experience | shopify.dev/docs/apps/design/content
> Last extracted: 2026-04-04

## Key Rules

1. **Action verbs for buttons** — "Add product", not "Product addition"
2. **Sentence case** — "Create campaign", not "CREATE CAMPAIGN"
3. **Max 3 words for buttons** — "Delete permanently" OK, "Permanently delete this resource right now" not OK
4. **Simple grammar** — short sentences (<15 words), avoid jargon
5. **Global-friendly language** — no idioms, no colloquialisms, no cultural references
6. **Error messages explain + suggest fix** — don't just say "Error occurred"
7. **Toast ≤3 words** — "Saved", "Product added", "Connection failed"
8. **Banner has actionable next step** — not just "Something went wrong"

---

## Button Labels

### Action-Oriented Labels
| Good | Avoid |
|------|-------|
| "Create campaign" | "Campaign creation" |
| "Add product" | "Product addition" |
| "Send email" | "Email sending" |
| "Delete draft" | "Draft deletion" |
| "Archive order" | "Order archival" |
| "Apply changes" | "Change application" |

### Capitalization (Sentence Case)
```typescript
// ✅ CORRECT — sentence case
<Button>Create product</Button>
<Button>Send email</Button>

// ❌ AVOID — title case or all caps
<Button>Create Product</Button>
<Button>CREATE PRODUCT</Button>
```

### Button Length (Max 3 Words)
```typescript
// ✅ CORRECT — concise and clear
<Button>Save changes</Button>
<Button>Delete permanently</Button>
<Button>Resend email</Button>

// ❌ AVOID — wordy buttons
<Button>Save all changes to this form</Button>
<Button>Are you sure you want to delete this permanently</Button>
```

### Dangerous Actions (Critical Tone)
```typescript
// ✅ CORRECT — clear dangerous action
<Button tone="critical" onClick={handleDelete}>Delete product</Button>

// ✅ CORRECT — confirmation modal for destructive
<Modal open={open} onClose={handleClose}>
  <p>Are you sure? This cannot be undone.</p>
  <Button tone="critical" onClick={handleDelete}>Delete permanently</Button>
</Modal>
```

---

## Error Messages

### Format: Problem + Fix
```typescript
// ✅ CORRECT — explains what + how to fix
<TextField
  label="Email"
  error="Please enter a valid email address"
/>

// ✅ CORRECT — specific error with action
<Banner tone="critical" title="Unable to save">
  Email already exists. Try a different email or sign in to existing account.
</Banner>

// ❌ AVOID — vague error
<Banner tone="critical" title="Error">
  Something went wrong.
</Banner>

// ❌ AVOID — technical jargon
<Banner tone="critical" title="Error">
  API returned 422 validation error on field 'email'.
</Banner>
```

### Error Message Principles
1. **Explain what went wrong** in merchant terms
2. **Suggest how to fix it** (actionable next step)
3. **Avoid blame language** ("You did X wrong" → "X is required")
4. **No jargon** (no "payload", "schema", "serialization")
5. **Lowercase after colon** — "Email: please try again"

### Common Error Messages
```
❌ "Invalid input"
✅ "Enter a valid email address"

❌ "Cannot process"
✅ "Inventory out of stock. Reduce quantity and try again."

❌ "Failed"
✅ "Could not connect to payment processor. Check connection and try again."

❌ "Database error"
✅ "We encountered a temporary issue. Please try again in a moment."
```

---

## Success Messages

### Toast (Auto-Hide, ≤3 Words)
```typescript
// ✅ CORRECT — brief success feedback
shopify.toast.show("Product saved");
shopify.toast.show("Email sent");
shopify.toast.show("Changes applied");

// ❌ AVOID — wordy toasts
shopify.toast.show("Your product has been successfully saved to the database");
```

### Banner (Persistent, Can Be Longer)
```typescript
// ✅ CORRECT — persistent confirmation with next step
<Banner tone="success" title="Campaign created">
  <p>Your campaign is live and reaching customers. View results in analytics.</p>
</Banner>

// ✅ CORRECT — next action visible
<Banner tone="success" title="Product imported">
  <p>5 products imported successfully. <Link>View imported products</Link></p>
</Banner>
```

---

## Empty States

### Empty State Copy
```typescript
// ✅ CORRECT — clear description + CTA
<EmptyState
  heading="Create your first campaign"
  action={{content: "Create campaign"}}
>
  <p>Campaigns help you reach customers with targeted offers and announcements.</p>
</EmptyState>

// ❌ AVOID — vague empty state
<EmptyState
  heading="No campaigns"
  action={{content: "New"}}
>
  <p>Get started.</p>
</EmptyState>
```

### Variations by Context
| Context | Heading | Body | Action |
|---------|---------|------|--------|
| First-time user | "Create your first X" | Benefit statement | "Create X" |
| Filtered/no results | "No X found" | Try adjusting search | "Clear filters" |
| Deleted all | "No X archived" | Where deleted items go | "View active X" |

---

## Notification Copy

### Toast Rules (Transient, Auto-Hide)
- Max 3 words for simple feedback
- Action + outcome: "Product added"
- Error version: "Connection failed"
- Never use for critical info (use Banner)

### Banner Rules (Persistent)
- Can be longer (1-2 sentences)
- Include next step or CTA
- Use color (tone) to indicate severity
- Title + optional body content

### Tone-Based Colors
```
tone="success"  → "Saved", "Sent", "Created"
tone="warning"  → "Expiring soon", "Action required"
tone="critical" → "Failed", "Error", "Cannot proceed"
tone="info"     → "Processing", "Pending approval"
```

---

## Form Labels & Placeholders

### Label Text (Clear & Concise)
```typescript
// ✅ CORRECT — clear label
<TextField label="Shop name" value={...} />
<Select label="Currency" options={...} />

// ❌ AVOID — vague label
<TextField label="Name" value={...} />  {/* Ambiguous */}
<TextField label="Identifier" value={...} />  {/* Technical */}
```

### Placeholder Text (Optional Hint)
```typescript
// ✅ CORRECT — optional hint for format
<TextField
  label="Email"
  placeholder="you@example.com"
  type="email"
/>

// ❌ AVOID — placeholder instead of label
<input placeholder="Email" />  {/* No label = accessibility issue */}
```

### Required/Optional Indicators
```typescript
// ✅ CORRECT — mark required fields
<TextField label="Email *" value={...} />  {/* Asterisk = required */}
<TextField label="Phone" value={...} />   {/* No asterisk = optional */}

// ✅ CORRECT — explicit indicator
<TextField label="Email (required)" value={...} />
```

---

## Global & Localization-Friendly Language

### Avoid Idioms & Colloquialisms
```
❌ "Click here"                   → ✅ "Open settings"
❌ "Bells and whistles"           → ✅ "Extra features"
❌ "Ball is in your court"        → ✅ "You need to review"
❌ "Throw in the towel"           → ✅ "Give up"
❌ "It's rocket science"          → ✅ "It's complex"
```

### Simple Grammar & Short Sentences
```
❌ "The aforementioned product's inventory status"
✅ "Product inventory: 15 in stock"

❌ "Per your previously stated preferences"
✅ "Based on your settings"

❌ "Notwithstanding the aforementioned"
✅ "Even so"
```

### Avoid Cultural References
```
❌ "It's a home run"              → ✅ "It's successful"
❌ "Touch base offline"           → ✅ "Talk later"
❌ "Break the ice"                → ✅ "Start the conversation"
```

---

## Microcopy Examples

### Onboarding
```
// Setup Guide Step Descriptions
"Step 1: Import your products"
"Step 2: Add tax rates"
"Step 3: Configure shipping"

// Not: "Let's get started", "Set things up", "Configure the system"
```

### Confirmations
```
// Before action
"Delete this product? This cannot be undone."

// After action
"Product deleted."
```

### Help Text
```
<TextField
  label="Discount (%)"
  helpText="Enter 0-100. Example: 15 for 15% off."
/>
```

### Inline Validation
```
"Email required"
"Password must be at least 8 characters"
"Username already taken"
```

---

## Pitfalls

- **Verbs in button labels** — "Product addition" vs "Add product"
- **ALLCAPS labels** — hard to read; use sentence case
- **Wordy buttons** — >3 words is usually too much
- **Vague errors** — "Error occurred" doesn't help; explain what + fix
- **No error context** — don't just show error code; translate for merchant
- **Jargon & technical terms** — merchants are not developers
- **No confirmation for destructive actions** — always confirm delete/archive
- **Placeholder instead of label** — placeholders aren't accessible labels
- **Inconsistent tone** — pick professional or friendly; be consistent
- **Idioms in copy** — breaks localization; use universal language
