# Form Design Patterns

**Last updated: 2026-04-04**

## Overview

Forms are critical friction points in SaaS. Good form design reduces errors, speeds completion, and improves user confidence. This guide covers layout, validation, components, and React Hook Form + Zod integration.

---

## Form Layout

### Single Column (Preferred)

```
┌──────────────────────────┐
│ Email *                  │
│ [________________]       │
│ helper text              │
│                          │
│ Password *               │
│ [________________]       │
│ Must be 8+ characters    │
│                          │
│ [✓ I agree to terms]     │
│                          │
│ [     Sign Up     ]      │
└──────────────────────────┘
```

**Advantages:**
- Mobile-friendly (no need to rearrange)
- No ambiguity about field associations
- Faster visual scanning
- Better for long forms (reduces scrolling)

### Two Columns (For Short Related Fields)

Use only when fields naturally pair:

```
┌─────────────────────────────────┐
│ First Name *    │ Last Name *   │
│ [___________]   │ [___________] │
│                                 │
│ Email *                         │
│ [___________________________]   │
└─────────────────────────────────┘
```

**Safe pairs:**
- First Name + Last Name
- City + State
- Start Date + End Date
- Min Price + Max Price

**Avoid:** Unrelated fields in 2 columns (confuses users about relationship).

### Field Groups (Sections)

Group related fields visually with spacing or cards:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Account Information</CardTitle>
  </CardHeader>
  <CardContent className="space-y-6">
    <FormField name="email" />
    <FormField name="password" />
  </CardContent>
</Card>

<Card>
  <CardHeader>
    <CardTitle>Profile</CardTitle>
  </CardHeader>
  <CardContent className="space-y-6">
    <FormField name="name" />
    <FormField name="bio" />
  </CardContent>
</Card>
```

---

## Field Anatomy

```
Email *                              ← Label (left-aligned, bold)

[_________________________________]  ← Input (full width, good padding)

We'll use this to send updates      ← Helper text (small, gray)

Email is required                   ← Error message (red, clear language)
```

### Implementation

```tsx
<div className="space-y-2">
  {/* Label */}
  <Label htmlFor="email" className="text-sm font-medium">
    Email <span className="text-red-600">*</span>
  </Label>

  {/* Input */}
  <Input
    id="email"
    type="email"
    placeholder="user@example.com"
    className={errors.email ? 'border-red-500 focus:ring-red-500' : ''}
  />

  {/* Helper text */}
  <p className="text-xs text-gray-500">
    We'll use this to send important account updates.
  </p>

  {/* Error message */}
  {errors.email && (
    <p className="text-xs text-red-600 flex items-center gap-1">
      <AlertCircle className="w-3 h-3" />
      {errors.email.message}
    </p>
  )}
</div>
```

---

## Validation Patterns

### Inline Validation (On Blur — Recommended)

Validates after user leaves field. Best UX: catch errors early without annoying mid-typing.

```tsx
<FormField
  name="email"
  render={({ field, fieldState: { error } }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input
          {...field}
          onBlur={(e) => {
            field.onBlur();
            // Inline validation trigger
            validate(e.target.value);
          }}
          className={error ? 'border-red-500' : ''}
        />
      </FormControl>
      {error && <FormMessage>{error.message}</FormMessage>}
    </FormItem>
  )}
/>
```

### Form-Level Validation (On Submit)

Validate entire form when user clicks Submit. Show all errors at once.

```tsx
const onSubmit = async (data: FormData) => {
  try {
    await schema.parseAsync(data); // Zod validation
    // Submit to API
  } catch (err) {
    // Display errors inline
  }
};
```

### Real-Time Validation (During Typing — Use Sparingly)

Only for specific fields: password strength, username availability.

```tsx
<Input
  onChange={(e) => {
    field.onChange(e);
    checkPasswordStrength(e.target.value); // Real-time feedback
  }}
/>
```

### Zod Schema Validation

```tsx
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be 8+ characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[!@#$%^&*]/, 'Must contain special character'),
  age: z.coerce.number().min(18, 'Must be 18+').max(120),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms',
  }),
});

type FormData = z.infer<typeof formSchema>; // Type-safe data
```

---

## Error Display

### Red Border + Error Icon + Message

```tsx
<div className="space-y-2">
  <Label>Email</Label>
  <div className="relative">
    <Input
      className={`${error ? 'border-red-500 focus:ring-red-500' : ''}`}
      value={email}
    />
    {error && (
      <AlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
    )}
  </div>
  {error && (
    <p className="text-xs text-red-600 flex items-center gap-1">
      {error}
    </p>
  )}
</div>
```

### Error Summary (For Long Forms)

Display all errors at top of form in scrollable alert:

```tsx
{Object.keys(errors).length > 0 && (
  <Alert variant="destructive" className="mb-6">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Please fix the following errors:</AlertTitle>
    <AlertDescription className="mt-2">
      <ul className="list-disc pl-5 space-y-1">
        {Object.entries(errors).map(([field, error]) => (
          <li key={field} className="text-sm">
            <a
              href={`#${field}`}
              className="underline hover:no-underline"
              onClick={() => scrollToField(field)}
            >
              {field}: {error?.message}
            </a>
          </li>
        ))}
      </ul>
    </AlertDescription>
  </Alert>
)}
```

### Use Text + Color (Not Just Color)

Never rely on color alone. Always add text/icon:

```tsx
{/* ❌ Bad: Color only */}
<Input className={error ? 'border-red-500' : 'border-green-500'} />

{/* ✓ Good: Color + text + icon */}
<div className={error ? 'border-red-500' : ''}>
  <Input />
  {error && <span className="text-red-600 text-xs">{error}</span>}
</div>
```

---

## Required Field Indicators

### Asterisk on Required Fields

```tsx
<Label className="flex gap-1">
  Email
  <span className="text-red-600 font-bold">*</span>
</Label>
```

### Mark Optional Fields (Preferred by UX Experts)

Fewer asterisks = cleaner look. Mark the minority (optional fields):

```tsx
<Label className="flex gap-1">
  Phone Number
  <span className="text-gray-500 text-xs">(optional)</span>
</Label>
```

---

## Input Types & When to Use

### Input (Text)

```tsx
<Input type="text" placeholder="John Doe" />
```

### Input (Email)

```tsx
<Input type="email" placeholder="user@example.com" />
```

### Input (Password)

```tsx
<Input type="password" placeholder="••••••••" />
```

### Textarea (Multi-line Text)

```tsx
<Textarea placeholder="Describe your issue..." className="min-h-32" />
```

### Select (Dropdown)

```tsx
<Select value={selected} onValueChange={setSelected}>
  <SelectTrigger>
    <SelectValue placeholder="Choose an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="opt1">Option 1</SelectItem>
    <SelectItem value="opt2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Combobox (Searchable Dropdown)

```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox">
      {selected ? selected.name : 'Select...'}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-56 p-0">
    <Input
      placeholder="Search..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
    <div className="max-h-48 overflow-y-auto">
      {options
        .filter((opt) => opt.name.toLowerCase().includes(search.toLowerCase()))
        .map((opt) => (
          <Button
            key={opt.id}
            variant="ghost"
            onClick={() => {
              setSelected(opt);
              setOpen(false);
            }}
          >
            {opt.name}
          </Button>
        ))}
    </div>
  </PopoverContent>
</Popover>
```

### RadioGroup (Mutually Exclusive)

```tsx
<RadioGroup value={selected} onValueChange={setSelected}>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="daily" id="daily" />
    <Label htmlFor="daily">Daily</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="weekly" id="weekly" />
    <Label htmlFor="weekly">Weekly</Label>
  </div>
</RadioGroup>
```

### Checkbox (Multiple Selection)

```tsx
<div className="space-y-2">
  {options.map((opt) => (
    <div key={opt.id} className="flex items-center space-x-2">
      <Checkbox
        id={opt.id}
        checked={selected.includes(opt.id)}
        onCheckedChange={(checked) => {
          setSelected(
            checked ? [...selected, opt.id] : selected.filter((id) => id !== opt.id)
          );
        }}
      />
      <Label htmlFor={opt.id}>{opt.name}</Label>
    </div>
  ))}
</div>
```

### Switch (Boolean Toggle)

```tsx
<div className="flex items-center gap-4">
  <Label htmlFor="emails">Enable email notifications</Label>
  <Switch
    id="emails"
    checked={emailsEnabled}
    onCheckedChange={setEmailsEnabled}
  />
</div>
```

### DatePicker (Single Date)

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {date ? date.toDateString() : 'Pick a date'}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar mode="single" selected={date} onSelect={setDate} />
  </PopoverContent>
</Popover>
```

### DateRangePicker (Start + End Date)

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {dateRange.from?.toDateString()} - {dateRange.to?.toDateString()}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar
      mode="range"
      selected={dateRange}
      onSelect={(range) => setDateRange(range || {})}
    />
  </PopoverContent>
</Popover>
```

### Slider (Range Input)

```tsx
<div className="space-y-2">
  <Label>Budget: ${budget}</Label>
  <Slider
    min={0}
    max={50000}
    step={100}
    value={[budget]}
    onValueChange={([value]) => setBudget(value)}
  />
</div>
```

---

## Multi-Step Forms / Wizards

### Stepper + Step Validation

```tsx
export const MultiStepForm = () => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    email: '',
    name: '',
    plan: '',
  });

  const steps = [
    { label: 'Account', fields: ['email'] },
    { label: 'Profile', fields: ['name'] },
    { label: 'Plan', fields: ['plan'] },
  ];

  const currentStepFields = steps[step].fields;

  const handleNext = async () => {
    const schema = getSchemaForStep(step);
    try {
      await schema.parseAsync(pick(data, currentStepFields));
      setStep(step + 1);
    } catch (err) {
      // Show validation errors for current step
    }
  };

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`flex-1 h-2 rounded-full ${
              i < step ? 'bg-blue-600' : i === step ? 'bg-blue-400' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Step title */}
      <h2 className="text-2xl font-bold">{steps[step].label}</h2>

      {/* Step content */}
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        {step === 0 && <FormField name="email" />}
        {step === 1 && <FormField name="name" />}
        {step === 2 && <FormField name="plan" />}
      </form>

      {/* Navigation */}
      <div className="flex gap-2 justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={handleNext}>Next</Button>
        ) : (
          <Button onClick={() => submit(data)}>Submit</Button>
        )}
      </div>
    </div>
  );
};
```

---

## Autosave Patterns

### Debounced Save

```tsx
import { useMemo } from 'react';
import { debounce } from 'lodash-es';

export const AutoSaveForm = () => {
  const [data, setData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const debouncedSave = useMemo(
    () =>
      debounce(async (formData) => {
        setIsSaving(true);
        try {
          await api.post('/save', formData);
          setLastSaved(new Date());
        } finally {
          setIsSaving(false);
        }
      }, 1000),
    []
  );

  const handleChange = (field: string, value: any) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    debouncedSave(newData);
  };

  return (
    <form className="space-y-4">
      {/* Autosave indicator */}
      <div className="text-xs text-gray-500 flex items-center gap-2">
        {isSaving ? (
          <>
            <Loader className="w-3 h-3 animate-spin" />
            Saving...
          </>
        ) : lastSaved ? (
          <>
            <Check className="w-3 h-3 text-green-600" />
            Saved at {lastSaved.toLocaleTimeString()}
          </>
        ) : null}
      </div>

      <Input
        value={data.title || ''}
        onChange={(e) => handleChange('title', e.target.value)}
      />
      {/* More fields */}
    </form>
  );
};
```

---

## Confirmation Dialogs (Destructive Actions)

```tsx
<AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete Account</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete account?</AlertDialogTitle>
      <AlertDialogDescription>
        This action is permanent and cannot be undone. All data will be deleted.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDelete} className="bg-red-600">
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Form Spacing

### Spacing Scale

```tsx
// Field spacing (within a form)
<form className="space-y-4">
  <FormField />
  <FormField />
  {/* 16px gap (space-y-4) */}
</form>

// Field group spacing
<form className="space-y-6">
  <fieldset className="space-y-4">
    <legend>Personal Info</legend>
    <FormField />
    <FormField />
  </fieldset>
  <fieldset className="space-y-4">
    <legend>Address</legend>
    <FormField />
    <FormField />
  </fieldset>
  {/* 24px gap between groups (space-y-6) */}
</form>

// Section spacing
<div className="space-y-8">
  <FormSection />
  <FormSection />
  {/* 32px gap between major sections (space-y-8) */}
</div>
```

---

## Submit Button Placement

### Right-Aligned (Desktop), Full-Width (Mobile)

```tsx
<div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
  <Button variant="outline" type="button" onClick={handleCancel}>
    Cancel
  </Button>
  <Button type="submit" disabled={isLoading}>
    {isLoading ? 'Submitting...' : 'Submit'}
  </Button>
</div>
```

---

## Disabled State vs Read-Only State

### Disabled (Not Editable, Not Submitted)

```tsx
<Input value={value} disabled className="opacity-50 cursor-not-allowed" />
```

**Use when:** Field is unavailable for business reasons, or user doesn't have permission.

### Read-Only (Shows Value, But Can't Edit)

```tsx
<Input value={value} readOnly className="bg-gray-50 cursor-default" />
```

**Use when:** Field shows immutable data (invoice date, user ID, confirmation code).

---

## File Upload Patterns

### Drag-and-Drop Zone

```tsx
<div
  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
    isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
  }`}
  onDragEnter={handleDragEnter}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  <UploadCloud className="w-8 h-8 mx-auto text-gray-400 mb-2" />
  <p className="font-medium">Drag files here or click to upload</p>
  <p className="text-xs text-gray-500">Supported: PDF, CSV, Excel (max 10MB)</p>
  <input
    type="file"
    multiple
    accept=".pdf,.csv,.xlsx"
    onChange={handleFileSelect}
    className="hidden"
    ref={fileInput}
  />
</div>
```

### Progress Bar

```tsx
{file && (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-sm">
      <span>{file.name}</span>
      <span className="text-gray-500">{uploadProgress}%</span>
    </div>
    <Progress value={uploadProgress} />
  </div>
)}
```

### File List

```tsx
<div className="space-y-2">
  {files.map((file) => (
    <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
      <div className="flex items-center gap-3">
        <FileIcon className="w-4 h-4 text-gray-400" />
        <div>
          <p className="text-sm font-medium">{file.name}</p>
          <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => removeFile(file.id)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  ))}
</div>
```

---

## Settings Forms (Cards + Per-Section Save)

### Pattern

Group settings in cards with independent save buttons:

```tsx
export const SettingsPage = () => (
  <div className="max-w-2xl space-y-6">
    {/* Account Card */}
    <Card>
      <CardHeader>
        <CardTitle>Account Information</CardTitle>
        <CardDescription>Update your account details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField name="email" />
        <FormField name="name" />
      </CardContent>
      <CardFooter>
        <Button onClick={saveAccount}>Save</Button>
      </CardFooter>
    </Card>

    {/* Email Preferences Card */}
    <Card>
      <CardHeader>
        <CardTitle>Email Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch id="newsletters" />
          <Label htmlFor="newsletters">Marketing emails</Label>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={saveEmails}>Save</Button>
      </CardFooter>
    </Card>
  </div>
);
```

---

## React Hook Form + Zod + shadcn/ui Integration Pattern

### Complete Example

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Step 1: Define Zod schema
const formSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z
    .string()
    .min(8, 'Must be 8+ characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain number'),
  acceptTerms: z.boolean().refine((val) => val, {
    message: 'You must accept the terms',
  }),
});

type FormData = z.infer<typeof formSchema>;

// Step 2: Create form component
export const SignUpForm = () => {
  // Step 3: Initialize useForm with zodResolver
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      acceptTerms: false,
    },
  });

  // Step 4: Handle submit
  const onSubmit = async (data: FormData) => {
    try {
      // Submit to API
      await api.post('/signup', data);
    } catch (err) {
      form.setError('root', { message: 'Signup failed' });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Email field */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="user@example.com" {...field} />
              </FormControl>
              <FormDescription>We'll send a verification link.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Password field */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Checkbox field */}
        <FormField
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel>I accept the terms of service</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit button */}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Signing up...' : 'Sign Up'}
        </Button>
      </form>
    </Form>
  );
};
```

---

## Responsive Design

### Breakpoint Behavior

- **sm (640px):** Single-column layout, full-width inputs, stacked buttons
- **md (768px):** Two-column fields collapse to single, wizard steppers become vertical
- **lg (1024px):** Two-column layout for related fields, horizontal steppers
- **xl (1280px):** Wider containers, increased spacing between field groups

### Layout Transformations

**Two-Column Form → Single Column:**
```tsx
{/* Desktop: 2 columns for related fields */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <FormField name="firstName" />
  <FormField name="lastName" />
</div>

{/* Mobile: Automatically stacks to single column */}
```

**Multi-Step Wizard: Horizontal → Vertical:**
```tsx
{/* Desktop: Horizontal progress bar */}
<div className="hidden md:flex gap-2 mb-8">
  {steps.map((_, i) => (
    <div key={i} className="flex-1 h-1 rounded bg-gray-300" />
  ))}
</div>

{/* Mobile: Vertical progress text */}
<div className="md:hidden mb-6 text-sm text-gray-600">
  Step {currentStep + 1} of {steps.length}
</div>
```

**File Upload Zone: Drag → Tap:**
```tsx
{/* Desktop: Large drag-drop area */}
<div className="hidden md:flex border-2 border-dashed rounded-lg p-12 h-48 flex-col items-center justify-center cursor-pointer">
  <UploadCloud className="w-8 h-8 mb-2" />
  <p>Drag files here or click</p>
</div>

{/* Mobile: Compact tap button */}
<div className="md:hidden border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-3">
  <Button className="w-full h-11">Tap to Upload</Button>
  <p className="text-xs text-gray-500">Max 10MB</p>
</div>
```

**Form Actions: Right-Aligned → Sticky Bottom:**
```tsx
{/* Desktop: Right-aligned buttons */}
<div className="flex gap-2 justify-end pt-6">
  <Button variant="outline">Cancel</Button>
  <Button>Submit</Button>
</div>

{/* Mobile: Sticky footer bar */}
<div className="fixed md:relative bottom-0 left-0 right-0 md:bottom-auto p-4 md:p-0 bg-white border-t md:border-t-0 flex gap-2">
  <Button variant="outline" className="flex-1 md:flex-none">Cancel</Button>
  <Button className="flex-1 md:flex-none">Submit</Button>
</div>
```

**Select Dropdowns: Popover → Bottom Sheet:**
```tsx
{/* Desktop: Popover */}
<div className="hidden sm:block">
  <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline">Choose</Button>
    </PopoverTrigger>
    <PopoverContent className="w-56 p-0">
      {/* Options */}
    </PopoverContent>
  </Popover>
</div>

{/* Mobile: Bottom sheet with 44px targets */}
<Sheet open={open} onOpenChange={setOpen}>
  <SheetTrigger asChild className="sm:hidden w-full">
    <Button variant="outline" className="w-full">Choose</Button>
  </SheetTrigger>
  <SheetContent side="bottom" className="h-96">
    {/* Large tap target options */}
  </SheetContent>
</Sheet>
```

### Touch Targets

- **Minimum target size:** 44x44px for all interactive elements
- **Input height:** 44px on mobile (40px on desktop acceptable)
- **Button height:** 44-48px on mobile
- **Checkbox/radio area:** 44x44px inclusive (not just the checkbox itself)
- **Label clickable area:** Must extend across input width
- **Error icons:** 24x24px minimum for tapping
- **Field spacing:** 16px minimum vertical gap between fields on mobile

### Code Example

```tsx
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const formSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  country: z.string(),
  message: z.string(),
  acceptTerms: z.boolean(),
});

export const ResponsiveForm = () => {
  const isMobile = useIsMobile();
  const form = useForm({ resolver: zodResolver(formSchema) });
  const [countryOpen, setCountryOpen] = useState(false);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold">Create Account</h1>
            <p className="text-sm md:text-base text-gray-600">
              Get started in minutes
            </p>
          </div>

          {/* Two-Column Fields: 1→2 layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm md:text-base font-medium">
                    First Name <span className="text-red-600">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John"
                      {...field}
                      className="h-10 md:h-11 text-base"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm md:text-base font-medium">
                    Last Name <span className="text-red-600">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Doe"
                      {...field}
                      className="h-10 md:h-11 text-base"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          {/* Full-Width Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm md:text-base font-medium">
                  Email <span className="text-red-600">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    {...field}
                    className="h-10 md:h-11 text-base"
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          {/* Select: Desktop Popover → Mobile Sheet */}
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm md:text-base font-medium">
                  Country <span className="text-red-600">*</span>
                </FormLabel>

                {/* Desktop: Popover */}
                <div className="hidden sm:block">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-10 md:h-11 justify-between text-base"
                      >
                        {field.value || 'Select country'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0">
                      <div className="space-y-1 p-2 max-h-64 overflow-y-auto">
                        {COUNTRIES.map((c) => (
                          <Button
                            key={c}
                            variant="ghost"
                            className="w-full justify-start h-9 text-sm"
                            onClick={() => {
                              field.onChange(c);
                              setCountryOpen(false);
                            }}
                          >
                            {c}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Mobile: Full-screen sheet */}
                <Sheet open={countryOpen} onOpenChange={setCountryOpen}>
                  <SheetTrigger asChild className="sm:hidden w-full">
                    <Button variant="outline" className="w-full h-11 justify-between text-base">
                      {field.value || 'Select country'}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-96">
                    <div className="space-y-2 mt-6">
                      {COUNTRIES.map((c) => (
                        <Button
                          key={c}
                          variant="ghost"
                          className="w-full justify-start h-12 text-base"
                          onClick={() => {
                            field.onChange(c);
                            setCountryOpen(false);
                          }}
                        >
                          {c}
                        </Button>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>

                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          {/* Textarea */}
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm md:text-base font-medium">
                  Message <span className="text-red-600">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell us more..."
                    {...field}
                    className="min-h-24 md:min-h-32 resize-none text-base"
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          {/* Checkbox: 44px touch area */}
          <FormField
            control={form.control}
            name="acceptTerms"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="w-5 h-5 mt-1 md:w-4 md:h-4"
                  />
                </FormControl>
                <FormLabel className="text-xs md:text-sm font-normal cursor-pointer leading-tight">
                  I accept the{' '}
                  <a href="/terms" className="underline text-blue-600 hover:no-underline">
                    terms of service
                  </a>
                </FormLabel>
              </FormItem>
            )}
          />

          {/* Submit: Sticky on mobile */}
          <div className="fixed md:relative bottom-0 left-0 right-0 md:bottom-auto p-4 md:p-0 bg-white border-t md:border-t-0 gap-2 flex">
            <Button
              type="button"
              variant="outline"
              className="flex-1 md:flex-none h-11 md:h-10 text-base"
              onClick={() => form.reset()}
            >
              Clear
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="flex-1 md:flex-none h-11 md:h-10 text-base"
            >
              {form.formState.isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </div>

          {/* Bottom spacer on mobile */}
          <div className="md:hidden h-16" />
        </form>
      </Form>
    </div>
  );
};
```

### Mobile Best Practices

- **Font size:** text-base (16px) in inputs to prevent iOS zoom on focus
- **Padding:** p-4 on mobile, p-6/p-8 on md+
- **Field labels:** Bold, 14px+ on mobile for clarity
- **Helper text:** text-xs (12px), subtle gray color
- **Errors:** Red text with icon, always paired with message
- **Sticky footer:** Keep safe area padding (16px) for notched devices
- **Input focus:** Ensure focus state is clearly visible (ring color)
- **Textarea:** min-h-24 (96px) on mobile for comfortable typing

---

## Dark Mode

Forms need careful dark mode treatment to maintain readability and visual feedback. Input contrast, focus rings, and validation indicators must remain clear in both light and dark modes.

### CSS Variable Mapping

**Light Mode (default):**
```css
--background: 0 0% 100%        /* Form container background */
--foreground: 0 0% 3.6%        /* Labels, text */
--input: 0 0% 89.8%            /* Input field background */
--border: 0 0% 89.8%           /* Input borders */
--ring: 0 0% 3.6%              /* Focus ring color */
--destructive: 0 84.2% 60.2%   /* Error color (red) */
--muted-foreground: 0 0% 45.1% /* Helper text, placeholders */
```

**Dark Mode:**
```css
--background: 0 0% 3.6%        /* Near black */
--foreground: 0 0% 98%         /* Off white text */
--input: 0 0% 14.9%            /* Dark input background */
--border: 0 0% 20%             /* Subtle dark borders */
--ring: 0 0% 63.9%             /* Light focus ring for dark */
--destructive: 0 84.2% 60.2%   /* Red stays consistent */
--muted-foreground: 0 0% 63.9% /* Lighter secondary text */
```

### Component-Level Overrides

#### Input Fields

```tsx
<Input
  id="email"
  type="email"
  placeholder="user@example.com"
  className={cn(
    'dark:bg-input dark:border-border dark:text-foreground dark:placeholder:text-muted-foreground',
    'dark:focus:ring-ring dark:focus:border-border',
    errors.email ? 'dark:border-destructive dark:focus:ring-destructive' : ''
  )}
/>
```

#### Focus Rings (Validation States)

```tsx
<Input
  className={cn(
    'focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-background',
    errors.email
      ? 'border-destructive focus:ring-destructive dark:focus:ring-destructive'
      : 'border-input dark:border-border focus:ring-ring dark:focus:ring-ring'
  )}
/>
```

#### Error Text Color

```tsx
{errors.email && (
  <p className="text-xs text-destructive dark:text-red-400 flex items-center gap-1">
    <AlertCircle className="w-3 h-3" />
    {errors.email.message}
  </p>
)}
```

#### Helper Text

```tsx
<p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
  We'll use this to send important updates.
</p>
```

#### Form Labels

```tsx
<Label htmlFor="email" className="text-sm font-medium dark:text-foreground">
  Email
  <span className="text-destructive dark:text-red-400">*</span>
</Label>
```

#### Disabled State (Reduced Opacity)

```tsx
<Input
  disabled
  className="dark:opacity-50 dark:cursor-not-allowed dark:bg-muted"
/>
```

#### Validation Success Indicator

```tsx
<div className={cn(
  'border rounded-md p-3',
  success
    ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
    : 'bg-gray-50 dark:bg-muted border-border dark:border-border'
)}>
  <p className="text-sm dark:text-green-400">{success}</p>
</div>
```

### Common Dark Mode Mistakes in Forms

1. **Placeholder text disappears:** Use `dark:placeholder:text-muted-foreground` to ensure placeholders are visible in dark mode.
2. **Focus ring invisible:** Default focus rings become invisible on dark inputs. Always set `dark:focus:ring-ring` to use the lighter ring color.
3. **Error messages hard to read:** Red on dark background needs adjustment. Use `dark:text-red-400` instead of pure red.
4. **Input fields blend with background:** Ensure `dark:bg-input` (14.9% gray) is distinct from form background (3.6% gray). Test the contrast ratio.
5. **Labels too light:** Labels must maintain contrast. Use `dark:text-foreground` (98% white) not muted text.
6. **Disabled inputs still look clickable:** Apply `dark:opacity-50` and `dark:cursor-not-allowed` to make disabled state obvious.
7. **Helper text becomes invisible:** Helper text color must be lighter than input text. Use `dark:text-muted-foreground`.
8. **Radio/Checkbox borders disappear:** Ensure border colors contrast with input background in dark mode.

### Code Example: Complete Dark Mode Form

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be 8+ characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
});

type FormData = z.infer<typeof formSchema>;

export const DarkModeForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
      fullName: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log('Form submitted:', data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-background p-6 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="space-y-2 mb-6">
          <h1 className="text-3xl font-bold dark:text-foreground">Sign Up</h1>
          <p className="text-muted-foreground dark:text-muted-foreground">
            Create your account to get started
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Full Name Field */}
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-foreground">
                    Full Name
                    <span className="text-destructive dark:text-red-400">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      className={cn(
                        'dark:bg-input dark:border-border dark:text-foreground',
                        'dark:placeholder:text-muted-foreground',
                        'dark:focus:ring-ring dark:focus:ring-2',
                        form.formState.errors.fullName &&
                          'dark:border-destructive dark:focus:ring-destructive'
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="dark:text-muted-foreground">
                    This will be displayed on your profile
                  </FormDescription>
                  <FormMessage className="dark:text-red-400" />
                </FormItem>
              )}
            />

            {/* Email Field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-foreground">
                    Email
                    <span className="text-destructive dark:text-red-400">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="user@example.com"
                        className={cn(
                          'dark:bg-input dark:border-border dark:text-foreground',
                          'dark:placeholder:text-muted-foreground',
                          'dark:focus:ring-ring dark:focus:ring-2',
                          form.formState.errors.email &&
                            'dark:border-destructive dark:focus:ring-destructive'
                        )}
                        {...field}
                      />
                      {form.formState.errors.email && (
                        <AlertCircle className="absolute right-3 top-3 w-5 h-5 text-destructive dark:text-red-400" />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage className="dark:text-red-400" />
                </FormItem>
              )}
            />

            {/* Password Field */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-foreground">
                    Password
                    <span className="text-destructive dark:text-red-400">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      className={cn(
                        'dark:bg-input dark:border-border dark:text-foreground',
                        'dark:placeholder:text-muted-foreground',
                        'dark:focus:ring-ring dark:focus:ring-2',
                        form.formState.errors.password &&
                          'dark:border-destructive dark:focus:ring-destructive'
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="dark:text-muted-foreground">
                    Must be 8+ characters with uppercase and number
                  </FormDescription>
                  <FormMessage className="dark:text-red-400" />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
            >
              {isSubmitting ? 'Signing up...' : 'Sign Up'}
            </Button>
          </form>
        </Form>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground dark:text-muted-foreground mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-primary dark:text-primary hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
};
```

---

## Sources

- [5 Best Practices for SaaS Product Design 2024](https://www.flexy.global/resources/saas/5-best-practices-for-saas-product-design-2024)
- [58 Form Design Best Practices & UX (2026)](https://ventureharbour.com/form-design-best-practices/)
- [12 Form UI/UX Design Best Practices to Follow in 2026](https://www.designstudiouiux.com/blog/form-ux-design-best-practices/)
- [React Hook Form - shadcn/ui](https://ui.shadcn.com/docs/forms/react-hook-form)
- [Building Advanced React Forms Using React Hook Form, Zod and Shadcn](https://wasp.sh/blog/2025/01/22/advanced-react-hook-form-zod-shadcn)
- [How to Use Zod Validation for React Hook Forms with ShadCN's Form Component](https://www.wisp.blog/blog/how-to-use-zod-validation-for-react-hook-forms-with-shadcns-form-component)
