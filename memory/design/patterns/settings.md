# SaaS Settings Page Design Patterns

Comprehensive guide to designing production-grade settings pages and user preference interfaces. Covers layout strategies, section organization, forms, security, billing, and responsive design.

---

## 1. Settings Page Layout Strategies

Two primary layouts: sidebar navigation (complex products) and single-page sections (simple products).

### 1.1 Sidebar Navigation + Content Area (Recommended for the project)

Best for: Many settings sections, complex products, admin dashboards.

**Advantages:**
- Always-visible section navigation
- Easy to jump between sections (no page reload)
- Scales to 10+ sections without clutter
- Works well on desktop and tablets

**Anatomy:**
```typescript
// App structure: Sidebar + Content
<div className="flex h-screen">
  {/* Left sidebar (200-240px) */}
  <aside className="w-60 border-r bg-gray-50">
    <SettingsSidebar active={activeSection} onSelectSection={setActiveSection} />
  </aside>

  {/* Main content area */}
  <main className="flex-1 overflow-auto">
    <div className="max-w-4xl mx-auto p-8">
      {/* Section content (cards, forms) */}
      {renderSectionContent(activeSection)}
    </div>
  </main>
</div>
```

**Sidebar Navigation Component:**
```typescript
const SettingsSidebar = ({ active, onSelectSection }) => {
  const sections = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'profile', label: 'Profile', icon: UserCircle },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Integrations', icon: Link2 },
    { id: 'api', label: 'API & Webhooks', icon: Code },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <nav className="p-6 space-y-2">
      <h2 className="text-sm font-semibold text-gray-600 px-3 mb-4">Settings</h2>

      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <button
            key={section.id}
            onClick={() => onSelectSection(section.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
              active === section.id
                ? 'bg-white text-gray-900 border-l-4 border-blue-600'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <Icon className="h-4 w-4" />
            {section.label}
          </button>
        );
      })}
    </nav>
  );
};
```

### 1.2 Single-Page Sections (For Simpler Products)

Best for: Few settings sections (3-5), mobile-first, startup MVP.

**Advantages:**
- Simpler implementation
- Mobile-friendly by default
- Fewer navigation clicks
- Linear flow

**Structure:**
```typescript
// Single page with vertical sections
<main className="max-w-2xl mx-auto p-6 space-y-8">
  <AppHeader />

  {/* Section 1 */}
  <AccountCard />

  {/* Section 2 */}
  <NotificationsCard />

  {/* Section 3 */}
  <BillingCard />

  {/* Danger zone (always last) */}
  <DangerZoneCard />
</main>
```

### 1.3 Mobile Responsive Strategy

**Desktop (1024px+):**
- Sidebar always visible (fixed or sticky)
- Content area takes full remaining width

**Tablet (768px-1023px):**
- Sidebar can collapse to icon-only or become hidden
- Toggle button to show sidebar as overlay
- Content area full-width when sidebar hidden

**Mobile (<768px):**
- Sidebar becomes Select dropdown or bottom sheet
- No fixed sidebar (takes up too much space)

```typescript
// Responsive settings layout
const SettingsLayout = ({ children, sections }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Mobile: Dropdown selector */}
      <div className="lg:hidden p-4 border-b bg-gray-50">
        <select
          onChange={(e) => navigate(`/settings/${e.target.value}`)}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Select a section...</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tablet/Desktop: Sidebar */}
      <aside className="hidden lg:block w-60 border-r bg-gray-50 overflow-y-auto">
        <SettingsSidebar />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
};
```

---

## 2. Settings Sections (Typical SaaS)

Standard sections found in mature SaaS products:

| Section | Purpose | Key Cards |
|---------|---------|-----------|
| **Account** | Email, name, timezone | Account info, email verification |
| **Profile** | Personal details, avatar | Avatar upload, display name, bio |
| **Team** | Members, permissions, invites | Members list, invite form |
| **Billing** | Plans, payment methods, invoices | Current plan, payment method, history |
| **Notifications** | Frequency, channels, preferences | Preference matrix, digest frequency |
| **Integrations** | Third-party services | Connected apps grid, settings modals |
| **API** | Keys, webhooks, rate limits | Key management, webhook logs |
| **Security** | 2FA, sessions, password | 2FA setup, active sessions, password |

---

## 3. Account/Profile Card

User identity and basic info management.

### 3.1 Avatar Upload

```typescript
const AvatarUploadCard = ({ currentAvatar, userId }) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be smaller than 5MB');
      return;
    }

    setUploading(true);

    try {
      // Show preview
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from('avatars')
        .upload(`${userId}/${Date.now()}.jpg`, file, { upsert: true });

      if (error) throw error;

      // Update profile
      const { publicUrl } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${userId}/${Date.now()}.jpg`);

      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', userId);

      toast.success('Avatar updated');
      setPreviewUrl(null);
    } catch (error) {
      toast.error('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Picture</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          {/* Avatar preview */}
          <div className="flex-shrink-0">
            <img
              src={previewUrl || currentAvatar || '/default-avatar.png'}
              alt="Avatar"
              className="w-24 h-24 rounded-lg object-cover bg-gray-100"
            />
          </div>

          {/* Upload controls */}
          <div className="flex-1">
            <p className="text-sm text-gray-600 mb-4">
              JPG or PNG, max 5MB
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </>
                )}
              </Button>

              {currentAvatar && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    await supabase
                      .from('profiles')
                      .update({ avatar_url: null })
                      .eq('user_id', userId);
                    toast.success('Avatar removed');
                  }}
                >
                  Remove
                </Button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
```

### 3.2 Basic Info Card

```typescript
const AccountInfoCard = ({ profile, onSave }) => {
  const [formData, setFormData] = useState({
    name: profile.name,
    email: profile.email,
    timezone: profile.timezone || 'UTC',
    language: profile.language || 'en'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      toast.success('Profile updated');
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Full name */}
        <div>
          <label className="text-sm font-medium">Full Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </div>

        {/* Email (read-only with change option) */}
        <div>
          <label className="text-sm font-medium">Email Address</label>
          <div className="flex gap-2 mt-1">
            <input
              type="email"
              value={formData.email}
              disabled
              className="flex-1 border rounded px-3 py-2 bg-gray-50 text-gray-600"
            />
            <Button variant="outline" size="sm">
              Change Email
            </Button>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Verified email with checkmark icon
          </p>
        </div>

        {/* Timezone */}
        <div>
          <label className="text-sm font-medium">Timezone</label>
          <select
            value={formData.timezone}
            onChange={(e) => handleChange('timezone', e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {/* Language */}
        <div>
          <label className="text-sm font-medium">Language</label>
          <select
            value={formData.language}
            onChange={(e) => handleChange('language', e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};
```

---

## 4. Password & Security Card

Password management and account security features.

### 4.1 Change Password Form

```typescript
const ChangePasswordCard = () => {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isChanging, setIsChanging] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  const validatePassword = (password: string): string | null => {
    if (password.length < 12) return 'Password must be at least 12 characters';
    if (!/[A-Z]/.test(password)) return 'Must contain uppercase letter';
    if (!/[a-z]/.test(password)) return 'Must contain lowercase letter';
    if (!/[0-9]/.test(password)) return 'Must contain number';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Must contain special character';
    return null;
  };

  const handleChange = async () => {
    const newErrors: Record<string, string> = {};

    // Validate new password
    const passwordError = validatePassword(formData.newPassword);
    if (passwordError) newErrors.newPassword = passwordError;

    // Match check
    if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsChanging(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setErrors({});
    } catch (error: any) {
      if (error.message.includes('Invalid password')) {
        setErrors({ currentPassword: 'Current password is incorrect' });
      } else {
        toast.error('Failed to update password');
      }
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current password */}
        <div>
          <label className="text-sm font-medium">Current Password</label>
          <div className="relative mt-1">
            <input
              type={showPasswords.current ? 'text' : 'password'}
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              className={cn(
                'w-full border rounded px-3 py-2 pr-10',
                errors.currentPassword && 'border-red-600'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((prev) => ({ ...prev, current: !prev.current }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showPasswords.current ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.currentPassword && (
            <p className="text-sm text-red-600 mt-1">{errors.currentPassword}</p>
          )}
        </div>

        {/* New password with strength indicator */}
        <div>
          <label className="text-sm font-medium">New Password</label>
          <div className="relative mt-1">
            <input
              type={showPasswords.new ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              className={cn(
                'w-full border rounded px-3 py-2 pr-10',
                errors.newPassword && 'border-red-600'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((prev) => ({ ...prev, new: !prev.new }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
            >
              {showPasswords.new ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Password requirements checklist */}
          {formData.newPassword && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">Password requirements:</p>
              <ul className="space-y-1">
                <li className="text-xs flex items-center gap-2">
                  {formData.newPassword.length >= 12 ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <Circle className="h-3 w-3 text-gray-300" />
                  )}
                  At least 12 characters
                </li>
                <li className="text-xs flex items-center gap-2">
                  {/[A-Z]/.test(formData.newPassword) ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <Circle className="h-3 w-3 text-gray-300" />
                  )}
                  Uppercase letter (A-Z)
                </li>
                <li className="text-xs flex items-center gap-2">
                  {/[0-9]/.test(formData.newPassword) ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <Circle className="h-3 w-3 text-gray-300" />
                  )}
                  Number (0-9)
                </li>
                <li className="text-xs flex items-center gap-2">
                  {/[^A-Za-z0-9]/.test(formData.newPassword) ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <Circle className="h-3 w-3 text-gray-300" />
                  )}
                  Special character (!@#$%^&*)
                </li>
              </ul>
            </div>
          )}

          {errors.newPassword && (
            <p className="text-sm text-red-600 mt-1">{errors.newPassword}</p>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label className="text-sm font-medium">Confirm Password</label>
          <div className="relative mt-1">
            <input
              type={showPasswords.confirm ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className={cn(
                'w-full border rounded px-3 py-2 pr-10',
                errors.confirmPassword && 'border-red-600'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((prev) => ({ ...prev, confirm: !prev.confirm }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
            >
              {showPasswords.confirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-red-600 mt-1">{errors.confirmPassword}</p>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Button
          onClick={handleChange}
          disabled={!formData.currentPassword || !formData.newPassword || isChanging}
        >
          {isChanging ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Updating...
            </>
          ) : (
            'Update Password'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};
```

### 4.2 Active Sessions

```typescript
const ActiveSessionsCard = ({ sessions, userId }) => {
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleRevokeSession = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await supabase.auth.admin.signOut({ sessionId });
      toast.success('Session revoked');
      // Refresh sessions list
    } catch (error) {
      toast.error('Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Sessions</CardTitle>
        <CardDescription>
          Devices where you're signed in. Revoke access from any device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {session.deviceType === 'mobile' ? (
                  <Smartphone className="h-5 w-5 text-gray-400" />
                ) : (
                  <Monitor className="h-5 w-5 text-gray-400" />
                )}

                <div>
                  <p className="text-sm font-medium">
                    {session.os} • {session.browser}
                  </p>
                  <p className="text-xs text-gray-600">
                    {session.city}, {session.country}
                  </p>
                  <p className="text-xs text-gray-500">
                    Last active: {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}
                  </p>
                </div>
              </div>

              {session.isCurrent ? (
                <Badge>Current device</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevokeSession(session.id)}
                  disabled={revoking === session.id}
                >
                  {revoking === session.id ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Revoking...
                    </>
                  ) : (
                    'Revoke'
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
```

---

## 5. Team Members Card

Team management, invitations, and permissions.

### 5.1 Team Members Table

```typescript
const TeamMembersCard = ({ members, teamId, userRole }) => {
  const [invitingEmail, setInvitingEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [members, setMembers] = useState(members);

  const handleInvite = async () => {
    if (!invitingEmail) {
      toast.error('Enter an email address');
      return;
    }

    setIsInviting(true);
    try {
      await supabase.from('team_invitations').insert({
        team_id: teamId,
        invited_email: invitingEmail,
        role: selectedRole
      });

      toast.success(`Invitation sent to ${invitingEmail}`);
      setInvitingEmail('');
      setSelectedRole('member');
    } catch (error: any) {
      if (error.message.includes('already member')) {
        toast.error('User is already a member');
      } else {
        toast.error('Failed to send invitation');
      }
    } finally {
      setIsInviting(false);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('id', memberId);

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );

      toast.success('Role updated');
    } catch (error) {
      toast.error('Failed to update role');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId);

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success('Member removed');
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
        <CardDescription>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Invite form */}
        {userRole === 'admin' && (
          <div className="p-4 bg-gray-50 rounded-lg mb-6 border">
            <h4 className="text-sm font-semibold mb-3">Invite team member</h4>
            <div className="flex gap-3">
              <input
                type="email"
                placeholder="user@company.com"
                value={invitingEmail}
                onChange={(e) => setInvitingEmail(e.target.value)}
                className="flex-1 border rounded px-3 py-2 text-sm"
              />

              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as any)}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>

              <Button
                onClick={handleInvite}
                disabled={!invitingEmail || isInviting}
              >
                {isInviting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invite'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Members table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left py-2 px-3 font-semibold">Member</th>
                <th className="text-left py-2 px-3 font-semibold">Email</th>
                <th className="text-left py-2 px-3 font-semibold">Role</th>
                <th className="text-left py-2 px-3 font-semibold">Status</th>
                <th className="text-left py-2 px-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <img
                        src={member.avatar_url || '/default-avatar.png'}
                        alt={member.name}
                        className="w-8 h-8 rounded-full bg-gray-200"
                      />
                      <span className="font-medium">{member.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-gray-600">{member.email}</td>
                  <td className="py-3 px-3">
                    {userRole === 'admin' && member.id !== currentUserId ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {member.status === 'pending' ? (
                      <Badge variant="outline">Invitation pending</Badge>
                    ) : (
                      <span className="text-green-600 text-sm">Active</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {userRole === 'admin' && member.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending invitations */}
        {pendingInvitations.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h4 className="text-sm font-semibold mb-3">Pending invitations</h4>
            <div className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-gray-600">
                      Invited {formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resendInvitation(invitation.id)}
                  >
                    Resend
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

---

## 6. Billing Card

Plan management, payment methods, and invoices.

### 6.1 Current Plan + Usage

```typescript
const BillingCard = ({ currentPlan, usage, limits }) => {
  const usagePercent = (usage.resumes / limits.maxResumes) * 100;
  const creditsPercent = (usage.credits / currentPlan.monthlyCredits) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing & Subscription</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current plan */}
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-semibold">{currentPlan.name}</h4>
            <p className="text-sm text-gray-600 mt-1">
              ${currentPlan.price}/month
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Next billing date: {formatDate(currentPlan.nextBillingDate)}
            </p>
          </div>

          <Badge variant="default">{currentPlan.name}</Badge>
        </div>

        {/* Usage meters */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Resumes Ranked</label>
              <span className="text-sm text-gray-600">
                {usage.resumes} / {limits.maxResumes}
              </span>
            </div>
            <Progress value={usagePercent} className="h-2" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Credits Remaining</label>
              <span className="text-sm text-gray-600">
                {usage.credits} / {currentPlan.monthlyCredits}
              </span>
            </div>
            <Progress value={creditsPercent} className="h-2" />
            {usage.credits < 10 && (
              <p className="text-xs text-yellow-600 mt-2">
                Running low on credits. Upgrade or purchase more.
              </p>
            )}
          </div>
        </div>

        {/* Plan features */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h5 className="text-sm font-semibold mb-3">Plan includes:</h5>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              {limits.maxResumes} resumes per job
            </li>
            <li className="flex gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              {currentPlan.monthlyCredits} credits per month
            </li>
            <li className="flex gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              Email support
            </li>
            {currentPlan.id !== 'free' && (
              <>
                <li className="flex gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  Email inbox integration
                </li>
                <li className="flex gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  Priority support
                </li>
              </>
            )}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => openPricingModal()}>
            Change Plan
          </Button>
          <Button variant="outline" onClick={() => openInvoicesPage()}>
            View Invoices
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
```

### 6.2 Payment Method

```typescript
const PaymentMethodCard = ({ paymentMethod, onUpdate }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Method</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Card brand icon */}
            {paymentMethod.brand === 'visa' && (
              <CreditCard className="h-12 w-12 text-blue-600" />
            )}
            {paymentMethod.brand === 'mastercard' && (
              <CreditCard className="h-12 w-12 text-red-600" />
            )}

            <div>
              <p className="font-medium">
                {paymentMethod.brand.toUpperCase()} ending in {paymentMethod.lastFour}
              </p>
              <p className="text-sm text-gray-600">
                Expires {paymentMethod.expMonth}/{paymentMethod.expYear}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => openUpdatePaymentModal()}
          >
            Update
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
```

---

## 7. Notification Preferences (Matrix UI)

Covered extensively in notifications.md, but settings-specific implementation:

```typescript
// Simplified notification preferences for Settings page
const NotificationPreferencesCard = () => {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    ranking_complete: true,
    feature_updates: true,
    billing_alerts: true,
    security_alerts: true
  });

  const savePreferences = async () => {
    await updateNotificationPreferences(prefs);
    toast.success('Preferences saved');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {[
          { key: 'ranking_complete', label: 'Job ranking complete', required: false },
          { key: 'feature_updates', label: 'New features & updates', required: false },
          { key: 'billing_alerts', label: 'Billing notifications', required: true },
          { key: 'security_alerts', label: 'Security & login alerts', required: true }
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <label className="text-sm font-medium">{item.label}</label>
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={(e) => setPrefs({ ...prefs, [item.key]: e.target.checked })}
              disabled={item.required}
              className="cursor-pointer"
            />
          </div>
        ))}
      </CardContent>

      <CardFooter>
        <Button onClick={savePreferences}>Save Preferences</Button>
      </CardFooter>
    </Card>
  );
};
```

---

## 8. Integrations Card

Connected third-party services.

```typescript
const IntegrationsCard = ({ connectedApps, availableApps }) => {
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Connect tools to extend the app's functionality
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableApps.map((app) => {
            const isConnected = connectedApps.find((c) => c.id === app.id);

            return (
              <div key={app.id} className="border rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <img src={app.logo} alt={app.name} className="w-8 h-8" />
                    <div>
                      <h4 className="font-semibold text-sm">{app.name}</h4>
                      <p className="text-xs text-gray-600">{app.description}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {isConnected ? (
                    <>
                      <Badge>Connected</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfiguring(app.id)}
                      >
                        Configure
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setDisconnecting(app.id);
                          try {
                            await disconnectIntegration(app.id);
                            toast.success(`${app.name} disconnected`);
                          } catch (error) {
                            toast.error('Failed to disconnect');
                          } finally {
                            setDisconnecting(null);
                          }
                        }}
                        disabled={disconnecting === app.id}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : app.comingSoon ? (
                    <Badge variant="outline">Coming Soon</Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => openOAuthFlow(app.id)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
```

---

## 9. API Keys Card

API key generation and management.

```typescript
const ApiKeysCard = ({ userId }) => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [displayKey, setDisplayKey] = useState<string | null>(null);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Enter a key name');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .insert({
          user_id: userId,
          name: newKeyName,
          secret: generateSecureToken()
        })
        .select()
        .single();

      if (error) throw error;

      // Display key once (never show again)
      setDisplayKey(data.secret);
      setKeys([...keys, data]);
      setNewKeyName('');
      setShowCreateForm(false);
    } catch (error) {
      toast.error('Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyKey = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success('Copied to clipboard');
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      await supabase.from('api_keys').delete().eq('id', keyId);
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success('API key revoked');
    } catch (error) {
      toast.error('Failed to revoke key');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>
          Create keys to access the project API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create form */}
        {showCreateForm && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-sm mb-3">Create API Key</h4>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Key name (e.g., 'Production API')"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
              <Button
                onClick={handleCreateKey}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Display newly created key */}
        {displayKey && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-semibold text-green-900 mb-2">
              Save your API key (shown only once):
            </p>
            <div className="flex gap-2">
              <code className="flex-1 bg-white border rounded px-3 py-2 text-xs font-mono break-all">
                {displayKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyKey(displayKey)}
              >
                Copy
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setDisplayKey(null)}
            >
              Done
            </Button>
          </div>
        )}

        {/* Existing keys */}
        {keys.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Your API Keys</h4>
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">{key.name}</p>
                  <p className="text-xs text-gray-600">
                    ••••{key.secret.slice(-4)} • Created {formatDate(key.createdAt)}
                  </p>
                  {key.lastUsedAt && (
                    <p className="text-xs text-gray-500">
                      Last used {formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}
                    </p>
                  )}
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRevokeKey(key.id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state + create button */}
        {keys.length === 0 && !showCreateForm && (
          <div className="text-center py-6">
            <Code className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-4">No API keys yet</p>
            <Button onClick={() => setShowCreateForm(true)}>
              Create API Key
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

---

## 10. Danger Zone

Destructive actions at bottom of settings.

```typescript
const DangerZoneCard = ({ userId }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typeDeleteConfirm, setTypeDeleteConfirm] = useState('');

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-red-600">Danger Zone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Delete account button */}
        <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
          <div>
            <h4 className="font-semibold text-sm text-red-900">Delete Account</h4>
            <p className="text-xs text-red-800 mt-1">
              Permanently delete your account and all data. This cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            Delete Account
          </Button>
        </div>

        {/* Export data button */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <h4 className="font-semibold text-sm">Export Data</h4>
            <p className="text-xs text-gray-600 mt-1">
              Download all your data in JSON format for backup or migration.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const data = await exportUserData(userId);
              downloadJSON(data, 'rankora_export.json');
              toast.success('Export complete');
            }}
          >
            Export
          </Button>
        </div>
      </CardContent>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Account Permanently</AlertDialogTitle>
          <AlertDialogDescription>
            <p className="mb-4">
              This action is permanent. All your data, jobs, and ranking history will be deleted.
            </p>
            <p className="font-semibold text-sm mb-2">
              Type DELETE to confirm:
            </p>
            <input
              type="text"
              value={typeDeleteConfirm}
              onChange={(e) => setTypeDeleteConfirm(e.target.value.toUpperCase())}
              placeholder="Type DELETE"
              className="w-full border rounded px-2 py-1"
            />
          </AlertDialogDescription>

          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await supabase.auth.admin.deleteUser(userId);
                  toast.success('Account deleted');
                  navigate('/');
                } catch (error) {
                  toast.error('Failed to delete account');
                }
              }}
              disabled={typeDeleteConfirm !== 'DELETE'}
              className="bg-red-600 disabled:opacity-50"
            >
              Delete Account
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
```

---

## 11. Save Behavior Strategies

### 11.1 Per-Card Save Buttons

Each card has its own save button in the footer:

```typescript
<Card>
  <CardHeader>
    <CardTitle>Settings</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Form fields */}
  </CardContent>
  <CardFooter>
    {/* Save button only for this card */}
    <Button onClick={handleSaveCard}>Save Changes</Button>
  </CardFooter>
</Card>
```

**Advantages:**
- User saves only what they changed
- Clear association between fields and save action
- No global state to manage
- Can fail independently

### 11.2 Autosave for Toggles

Switches/checkboxes save immediately without needing a button:

```typescript
const NotificationToggle = ({ type, enabled, onChange }) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async (newValue: boolean) => {
    onChange(newValue);
    setIsSaving(true);

    try {
      await updateNotificationPreference(type, newValue);
      toast.success('Updated');
    } catch (error) {
      // Revert on error
      onChange(!newValue);
      toast.error('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <label>{type}</label>
      <div className="relative">
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={isSaving}
        />
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin absolute -right-6 top-0.5" />
        )}
      </div>
    </div>
  );
};
```

### 11.3 Unsaved Changes Warning

Warn user before navigating away with unsaved changes:

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasUnsavedChanges]);

// Also warn on navigation
useEffect(() => {
  if (!hasUnsavedChanges) return;

  const unblock = navigate((e: any) => {
    if (window.confirm('You have unsaved changes. Leave anyway?')) {
      return true;
    }
    return false;
  });

  return unblock;
}, [hasUnsavedChanges, navigate]);
```

---

## 12. Responsive Settings Layout

Adapt layout for mobile, tablet, and desktop.

```typescript
// Use Select dropdown on mobile
const ResponsiveSettingsNav = ({ activeSection, onSelectSection, isMobile }) => {
  if (isMobile) {
    return (
      <select
        value={activeSection}
        onChange={(e) => onSelectSection(e.target.value)}
        className="w-full border rounded px-3 py-2 mb-6"
      >
        {SECTIONS.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    );
  }

  return <SettingsSidebar active={activeSection} onSelectSection={onSelectSection} />;
};

// Stack cards full-width on mobile
const SettingsContent = ({ isMobile }) => {
  return (
    <div className={cn('space-y-6', isMobile ? 'p-4' : 'max-w-4xl mx-auto p-8')}>
      <AccountInfoCard />
      <ChangePasswordCard />
      <TeamMembersCard />
      <BillingCard />
      <NotificationPreferencesCard />
      <IntegrationsCard />
      <ApiKeysCard />
      <DangerZoneCard />
    </div>
  );
};

// Main settings page
const SettingsPage = () => {
  const isMobile = useMobile(); // Hook for < 768px
  const [activeSection, setActiveSection] = useState('account');

  return (
    <>
      <AppHeader />
      <div className={cn('flex', isMobile && 'flex-col')}>
        <ResponsiveSettingsNav
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          isMobile={isMobile}
        />
        <SettingsContent isMobile={isMobile} />
      </div>
    </>
  );
};
```

---

---

## Dark Mode

Settings pages benefit from dark mode—users often tweak preferences late at night. Key challenges: maintaining contrast in toggles, making danger zone cards visually distinct, and ensuring the sidebar navigation is scannable.

### CSS Variable Mapping

**Light Mode (default):**
```css
--background: 0 0% 100%        /* Page background */
--card: 0 0% 100%              /* Settings card backgrounds */
--border: 0 0% 89.8%           /* Card borders, section dividers */
--muted: 0 0% 96.1%            /* Disabled states, subtle backgrounds */
--foreground: 0 0% 3.6%        /* Text, labels */
--destructive: 0 84.2% 60.2%   /* Danger zone card, delete button */
--input: 0 0% 89.8%            /* Toggle switch track, inputs */
```

**Dark Mode:**
```css
--background: 0 0% 3.6%        /* Near black */
--card: 0 0% 8%                /* Slightly lighter cards */
--border: 0 0% 20%             /* Subtle dark borders */
--muted: 0 0% 14.9%            /* Disabled state background */
--foreground: 0 0% 98%         /* Off white text */
--destructive: 0 84.2% 60.2%   /* Red consistent */
--input: 0 0% 20%              /* Dark toggle track */
```

### Component-Level Overrides

#### Settings Sidebar

```tsx
<aside className="hidden md:block w-64 border-r dark:border-border dark:bg-card min-h-screen p-4">
  <nav className="space-y-1">
    {sections.map((section) => (
      <button
        key={section.id}
        onClick={() => setActiveSection(section.id)}
        className={cn(
          'w-full text-left px-4 py-2 rounded-lg transition',
          activeSection === section.id
            ? 'bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground'
            : 'dark:text-foreground dark:hover:bg-muted'
        )}
      >
        {section.label}
      </button>
    ))}
  </nav>
</aside>
```

#### Settings Card (Standard)

```tsx
<Card className="dark:bg-card dark:border-border">
  <CardHeader className="pb-4 border-b dark:border-border">
    <CardTitle className="dark:text-foreground">{title}</CardTitle>
    <CardDescription className="dark:text-muted-foreground">
      {description}
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4 pt-6">
    {/* Content goes here */}
  </CardContent>
  <CardFooter className="border-t dark:border-border flex justify-end gap-2 pt-6">
    <Button variant="outline" className="dark:bg-muted dark:border-border dark:text-foreground">
      Cancel
    </Button>
    <Button className="dark:bg-primary dark:text-primary-foreground">
      Save changes
    </Button>
  </CardFooter>
</Card>
```

#### Danger Zone Card

```tsx
<Card className="dark:border-destructive/20 dark:bg-destructive/5 border-destructive/20 bg-destructive/5">
  <CardHeader className="pb-4">
    <CardTitle className="text-lg dark:text-destructive text-red-700">
      Danger Zone
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="border-t dark:border-destructive/20 border-destructive/20 pt-4">
      <h3 className="font-medium dark:text-foreground mb-2">Delete account</h3>
      <p className="text-sm dark:text-muted-foreground mb-4">
        This action cannot be undone. All data will be permanently deleted.
      </p>
      <Button variant="destructive" className="dark:bg-destructive dark:text-destructive-foreground">
        Delete my account
      </Button>
    </div>
  </CardContent>
</Card>
```

#### Toggle Switch

```tsx
<div className="flex items-center justify-between p-4 dark:bg-muted/20 rounded-lg">
  <div>
    <Label className="dark:text-foreground">Email notifications</Label>
    <p className="text-sm dark:text-muted-foreground">Receive updates about your account</p>
  </div>
  <Switch
    checked={emailNotifications}
    onCheckedChange={setEmailNotifications}
    className="dark:bg-input dark:data-[state=checked]:bg-primary"
  />
</div>
```

#### Save Button with Loading State

```tsx
<Button
  onClick={handleSave}
  disabled={isSaving}
  className="dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
>
  {isSaving ? (
    <>
      <Loader className="w-4 h-4 mr-2 animate-spin" />
      Saving...
    </>
  ) : (
    'Save changes'
  )}
</Button>
```

#### Tab Navigation

```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="dark:bg-muted dark:border-border border-b w-full justify-start rounded-none">
    {tabs.map((tab) => (
      <TabsTrigger
        key={tab.id}
        value={tab.id}
        className="dark:text-muted-foreground dark:data-[state=active]:text-foreground dark:data-[state=active]:border-b-2 dark:data-[state=active]:border-primary"
      >
        {tab.label}
      </TabsTrigger>
    ))}
  </TabsList>
  <TabsContent value={activeTab} className="dark:bg-card">
    {/* Tab content */}
  </TabsContent>
</Tabs>
```

#### Input Field in Settings

```tsx
<div className="space-y-2">
  <Label className="dark:text-foreground">Full Name</Label>
  <Input
    value={fullName}
    onChange={(e) => setFullName(e.target.value)}
    className="dark:bg-input dark:border-border dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:ring-ring"
  />
</div>
```

### Common Dark Mode Mistakes in Settings

1. **Sidebar navigation hard to read:** Don't use pure gray text. Use `dark:text-foreground` for active states, `dark:text-muted-foreground` for inactive.
2. **Danger zone card blends with background:** The red-tinted danger card needs `dark:border-destructive/20 dark:bg-destructive/5` to be visible.
3. **Toggle switches hard to see:** Input background `dark:bg-input` must contrast with card background. Checked state needs explicit `dark:data-[state=checked]:bg-primary`.
4. **Disabled form fields look enabled:** Use `dark:opacity-50 dark:cursor-not-allowed` for disabled inputs.
5. **Card dividers invisible:** Use `dark:border-border` on borders within settings cards, not lighter grays.
6. **Tab navigation underline invisible:** Tab active states need `dark:data-[state=active]:border-primary` to be visible.
7. **Save button contrast weak:** Buttons need `dark:bg-primary dark:text-primary-foreground` to stand out from card background.
8. **Helper text too faint:** Use `dark:text-muted-foreground` for descriptions, not lighter grays.

### Code Example: Complete Dark Mode Settings Page

```tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Loader, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DarkModeSettingsPage = () => {
  const [email, setEmail] = useState('user@example.com');
  const [fullName, setFullName] = useState('John Doe');
  const [isSaving, setIsSaving] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [activeTab, setActiveTab] = useState('account');
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen dark:bg-background">
      {/* Header */}
      <div className="border-b dark:border-border px-6 py-4">
        <h1 className="text-3xl font-bold dark:text-foreground">Settings</h1>
        <p className="text-sm dark:text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:block w-64 border-r dark:border-border dark:bg-card min-h-[calc(100vh-80px)] p-4">
          <nav className="space-y-1">
            {[
              { id: 'account', label: 'Account' },
              { id: 'notifications', label: 'Notifications' },
              { id: 'billing', label: 'Billing' },
              { id: 'security', label: 'Security' },
            ].map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveTab(section.id)}
                className={cn(
                  'w-full text-left px-4 py-2 rounded-lg transition text-sm font-medium',
                  activeTab === section.id
                    ? 'bg-primary text-primary-foreground'
                    : 'dark:text-foreground dark:hover:bg-muted hover:bg-gray-100'
                )}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 space-y-6 max-w-2xl">
          {/* Account Settings */}
          {activeTab === 'account' && (
            <Card className="dark:bg-card dark:border-border">
              <CardHeader className="pb-4 border-b dark:border-border">
                <CardTitle className="dark:text-foreground">Account Information</CardTitle>
                <CardDescription className="dark:text-muted-foreground">
                  Update your basic account details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label className="dark:text-foreground">Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="dark:bg-input dark:border-border dark:text-foreground dark:placeholder:text-muted-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-foreground">Email</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    className="dark:bg-input dark:border-border dark:text-foreground dark:placeholder:text-muted-foreground"
                  />
                </div>
              </CardContent>
              <CardFooter className="border-t dark:border-border flex justify-end gap-2 pt-6">
                <Button variant="outline" className="dark:bg-muted dark:border-border dark:text-foreground">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving} className="dark:bg-primary dark:text-primary-foreground">
                  {isSaving ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save changes'
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Notification Settings */}
          {activeTab === 'notifications' && (
            <Card className="dark:bg-card dark:border-border">
              <CardHeader className="pb-4 border-b dark:border-border">
                <CardTitle className="dark:text-foreground">Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-center justify-between p-3 dark:bg-muted/20 rounded-lg">
                  <div>
                    <Label className="dark:text-foreground">Email notifications</Label>
                    <p className="text-sm dark:text-muted-foreground">Updates about your account</p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                  />
                </div>
              </CardContent>
              <CardFooter className="border-t dark:border-border flex justify-end gap-2 pt-6">
                <Button className="dark:bg-primary dark:text-primary-foreground">
                  Save preferences
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Security / Danger Zone */}
          {activeTab === 'security' && (
            <Card className="dark:border-destructive/20 dark:bg-destructive/5 border-destructive/20 bg-destructive/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg dark:text-destructive text-red-700">
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-t dark:border-destructive/20 border-destructive/20 pt-4 space-y-4">
                  <div>
                    <h3 className="font-medium dark:text-foreground mb-2">API Keys</h3>
                    <div className="flex items-center gap-2 p-3 dark:bg-black/30 rounded-lg">
                      <code className="text-xs dark:text-muted-foreground flex-1 font-mono">
                        sk_live_51Abc123...
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard('sk_live_51Abc123')}
                        className="dark:text-muted-foreground dark:hover:text-foreground"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="border-t dark:border-destructive/20 border-destructive/20 pt-4">
                    <h3 className="font-medium dark:text-foreground mb-2">Delete account</h3>
                    <p className="text-sm dark:text-muted-foreground mb-4">
                      This action cannot be undone. All data will be permanently deleted.
                    </p>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="dark:bg-destructive dark:text-destructive-foreground">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete my account
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="dark:bg-card dark:border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="dark:text-foreground">Delete account</AlertDialogTitle>
                          <AlertDialogDescription className="dark:text-muted-foreground">
                            This action is permanent. Type your email to confirm.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="dark:bg-muted dark:text-foreground dark:border-border">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction className="dark:bg-destructive dark:text-destructive-foreground">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
};
```

---

## Responsive Design

### Breakpoint Behavior

- **sm (640px):** Sidebar hidden (top tabs), full-width cards, danger zone modal on mobile
- **md (768px):** Sidebar collapsible, cards remain full-width
- **lg (1024px):** Sidebar visible, cards in 2-column grid
- **xl (1280px):** Sidebar fixed, wider content area

### Layout Transformations

**Sidebar → Top Tabs:**
```tsx
{/* Desktop: Left sidebar visible */}
<div className="hidden lg:flex lg:w-56 border-r bg-white flex-col">
  <Sidebar activeSection={activeSection} onSelectSection={setActiveSection} />
</div>

{/* Mobile: Top tabs/select dropdown */}
<div className="lg:hidden mb-6">
  <Select value={activeSection} onValueChange={setActiveSection}>
    <SelectTrigger className="w-full h-11">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {SECTIONS.map(s => (
        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

**Settings Cards: Multi-Column → Single Column:**
```tsx
{/* Desktop: 2-column grid */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {settingsCards.map(card => <Card>{card}</Card>)}
</div>

{/* Mobile: Single column, full-width cards */}
<div className="space-y-6">
  {settingsCards.map(card => <Card>{card}</Card>)}
</div>
```

**Danger Zone: Inline → Modal Confirmation:**
```tsx
{/* Desktop: Inline delete with type-to-confirm */}
<Card>
  <CardContent className="space-y-4">
    <p>Type "DELETE" to confirm</p>
    <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} />
    <Button variant="destructive" disabled={confirmText !== 'DELETE'}>
      Delete Account
    </Button>
  </CardContent>
</Card>

{/* Mobile: Modal/sheet confirmation */}
<Button
  variant="destructive"
  onClick={() => setShowDeleteConfirm(true)}
  className="w-full h-11"
>
  Delete Account
</Button>

<AlertDialog open={showDeleteConfirm}>
  {/* Confirmation with full-width buttons */}
</AlertDialog>
```

**Avatar Upload: Desktop Upload → Mobile Tap:**
```tsx
{/* Desktop: Drag-drop zone */}
<div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer">
  <UploadCloud />
  <p>Drag or click to upload</p>
</div>

{/* Mobile: Compact tap button */}
<div className="flex gap-2">
  <Button className="flex-1 h-11">Tap to Upload</Button>
  <Button variant="outline" className="flex-1 h-11">Remove</Button>
</div>
```

### Touch Targets

- **Sidebar items:** 44px height minimum
- **Card buttons:** 44px height on mobile
- **Avatar upload:** 44x44px button minimum
- **Save/Cancel buttons:** 44px height, full-width on mobile
- **Delete button:** 44px height minimum
- **Tab/select dropdown:** 44px height

### Code Example

```tsx
import { useIsMobile } from '@/hooks/use-mobile';

export const ResponsiveSettingsPage = () => {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState('account');

  const sections = [
    { id: 'account', label: 'Account', icon: <User /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <AppHeader />

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        {/* Mobile: Top section selector (dropdown) */}
        <div className="lg:hidden mb-6">
          <Select value={activeSection} onValueChange={setActiveSection}>
            <SelectTrigger className="w-full h-11 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-6">
          {/* Desktop: Left Sidebar */}
          <aside className="hidden lg:flex lg:w-56 flex-col gap-1">
            {sections.map(s => (
              <Button
                key={s.id}
                variant={activeSection === s.id ? 'default' : 'ghost'}
                className="justify-start h-10 gap-2"
                onClick={() => setActiveSection(s.id)}
              >
                {s.icon}
                {s.label}
              </Button>
            ))}
          </aside>

          {/* Main Content */}
          <main className="flex-1 space-y-6">
            {/* Account Section */}
            {activeSection === 'account' && (
              <div className="space-y-6">
                {/* Avatar Card */}
                <Card className="p-4 md:p-6">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Profile Picture</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-16 h-16">
                        <AvatarImage src={avatarUrl} />
                        <AvatarFallback>YB</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-2 flex-1">
                        <input
                          type="file"
                          ref={fileInput}
                          className="hidden"
                          onChange={handleAvatarUpload}
                        />
                        <Button
                          onClick={() => fileInput.current?.click()}
                          className="w-full md:w-auto h-10 md:h-11"
                        >
                          Upload
                        </Button>
                        {avatarUrl && (
                          <Button
                            variant="outline"
                            onClick={removeAvatar}
                            className="w-full md:w-auto h-10 md:h-11"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-600">Max 5MB. JPEG, PNG</p>
                  </CardContent>
                </Card>

                {/* Email Card */}
                <Card className="p-4 md:p-6">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Email</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="h-10 md:h-11 text-base"
                    />
                    <Button className="w-full md:w-auto h-10 md:h-11">
                      Save Changes
                    </Button>
                  </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-red-200 p-4 md:p-6">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg text-red-600">Danger Zone</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="destructive"
                      className="w-full h-11 md:h-10"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete Account
                    </Button>
                  </CardContent>
                </Card>

                {/* Delete Confirmation */}
                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                  <AlertDialogContent className="max-w-sm">
                    <h2 className="text-lg font-semibold mb-2">Delete account?</h2>
                    <p className="text-sm text-gray-600 mb-6">
                      This action cannot be undone. All data will be lost.
                    </p>
                    <div className="flex gap-3 justify-end">
                      <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleDeleteAccount}>
                        Delete
                      </Button>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* Billing Section */}
            {activeSection === 'billing' && <BillingSection />}

            {/* Notifications Section */}
            {activeSection === 'notifications' && <NotificationsSection />}
          </main>
        </div>
      </div>
    </div>
  );
};
```

### Mobile-Specific Considerations

- **Sidebar:** Hidden on sm/md, visible on lg+ (use Select dropdown on mobile)
- **Cards:** Full-width on mobile, 2-col grid on lg+
- **Buttons:** h-11 (44px) on mobile, h-10 on desktop
- **Danger zone:** Modal confirmation on mobile (easier to confirm), inline on desktop
- **Avatar:** Tap-to-upload button on mobile, drag-drop on desktop
- **Spacing:** p-4 on mobile, p-6 on desktop

---


## Implementation Checklist

- [ ] Settings layout: sidebar + content (or single page if simpler)
- [ ] All sections use Card + CardHeader + CardFooter pattern
- [ ] Per-card save buttons with loading states
- [ ] Autosave for toggles/switches
- [ ] Unsaved changes warning before navigation
- [ ] Avatar upload with preview and size/format validation
- [ ] Password change with strength indicator checklist
- [ ] Team members: invite form, members table, pending invitations
- [ ] Billing: current plan, usage meters, payment method
- [ ] Notification preferences: matrix UI with toggles
- [ ] Integrations: grid of available/connected apps
- [ ] API keys: create, copy, revoke with one-time display
- [ ] Danger zone: delete account with type-to-confirm, export data
- [ ] Mobile responsive: Select dropdown on mobile, full-width cards
- [ ] Consistent error/success toast feedback
- [ ] All destructive actions use AlertDialog with confirmation

---

## Sources

- [SaaS Settings UI/UX Design Patterns (SaaSUI)](https://www.saasui.design/)
- [Settings Page Design Examples (Nicelydone)](https://nicelydone.club/pages/settings)
- [Account Settings Best Practices (2024)](https://medium.com/design-bootcamp/designing-profile-account-and-setting-pages-for-better-ux-345ef4ca1490)
- [Team Management SaaS UI Patterns](https://saaswebsites.com/page-categories/team-pages/)
- [API Key Management UI Design (Carbon Design System)](https://carbondesignsystem.com/community/patterns/generate-an-api-key/)
- [Notification Preferences UI (Nicelydone)](https://nicelydone.club/pages/notification-settings)
- [SaaS Settings & Configuration Design (SaaSFrame)](https://www.saasframe.io/categories/settings)
- [Security Settings UI Patterns](https://nicelydone.club/pages/security-settings)
