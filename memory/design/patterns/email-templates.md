# Email Template Architecture & Patterns

**Last updated: 2026-04-04**

Email template design is fundamentally different from web design. Email clients—especially Outlook and Gmail—have severely limited CSS support. This guide covers production patterns for transactional email: welcome, verification, password reset, receipts, trial expiry, and usage alerts.

---

## 1. Email Template Architecture

### Core Constraints

- **Width:** Max 600px, centered on desktop, full width on mobile
- **Layout:** HTML tables (not CSS Grid/Flexbox—email clients don't support these)
- **Fonts:** System fonts only (Arial, Helvetica, Verdana, sans-serif). No web fonts.
- **Colors:** Inline `style` attributes only. No CSS classes or embedded `<style>` tags.
- **Styling method:** Inline CSS for maximum compatibility
- **Media queries:** Only 76% of email clients support them; design must degrade gracefully
- **File size:** Keep under 102KB total. Gmail clips emails over this, hiding footer and unsubscribe.
- **Dark mode:** Use `@media (prefers-color-scheme: dark)` + transparent logos

### Basic Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Email Subject</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      min-width: 100% !important;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color: #333;
      background-color: #f5f5f5;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #e0e0e0;
      }
      .dark-bg {
        background-color: #2a2a2a !important;
      }
      .dark-text {
        color: #e0e0e0 !important;
      }
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      display: block;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: nearest-neighbor;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      body {
        width: 100% !important;
      }
      table[class="responsive-table"] {
        width: 100% !important;
      }
      td[class="responsive-cell"] {
        width: 100% !important;
        display: block !important;
        padding: 20px 0 !important;
      }
      img[class="responsive-image"] {
        width: 100% !important;
        height: auto !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; min-width: 100% !important; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5;">
  <!-- Outer wrapper -->
  <table class="responsive-table" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px 0;">
        <!-- Content container: 600px max -->
        <table width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff; border-collapse: collapse;">
          <!-- Header with logo -->
          <tr>
            <td style="padding: 30px 20px; text-align: center; border-bottom: 1px solid #eee;">
              <img src="https://cdn.example.com/logo.png" alt="Company Logo" width="180" height="45" style="display: block; margin: 0 auto;">
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding: 30px 20px;">
              <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: bold; color: #333; line-height: 1.3;">Email heading here</h1>
              <p style="margin: 0 0 15px 0; font-size: 16px; color: #666; line-height: 1.5;">Email body text here.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 20px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999;">
              <p style="margin: 0 0 10px 0;">Company Name<br>Address Line 1<br>City, State ZIP</p>
              <p style="margin: 0;"><a href="https://example.com/unsubscribe" style="color: #0066cc;">Unsubscribe</a> | <a href="https://example.com/preferences" style="color: #0066cc;">Update preferences</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 2. Transactional Email Templates

### 2.1 Welcome Email

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Welcome to the project</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #1a1a1a; }
      .dark-bg { background-color: #2a2a2a !important; }
      .dark-text { color: #e0e0e0 !important; }
    }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    @media only screen and (max-width: 600px) {
      td[class="responsive-cell"] { width: 100% !important; display: block !important; }
      img { max-width: 100%; height: auto; }
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px; text-align: center; border-bottom: 2px solid #007bff;">
              <img src="https://cdn.example.com/logo.png" alt="the project" width="200" height="50" style="display: block; margin: 0 auto;">
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: bold; color: #333;">Welcome to the project!</h1>
              <p style="margin: 0 0 25px 0; font-size: 16px; color: #666; line-height: 1.6;">Hi {{first_name}},</p>
              <p style="margin: 0 0 25px 0; font-size: 16px; color: #666; line-height: 1.6;">We're excited to have you on board. the project makes resume screening faster and smarter using AI-powered ranking.</p>

              <!-- Setup steps -->
              <h2 style="margin: 30px 0 20px 0; font-size: 18px; font-weight: bold; color: #333;">Get Started in 3 Steps</h2>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px 0;">
                <tr>
                  <td style="padding: 15px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 40px; text-align: center; padding-right: 15px;">
                          <div style="width: 32px; height: 32px; background-color: #007bff; border-radius: 50%; text-align: center; line-height: 32px; color: #fff; font-weight: bold; font-size: 16px;">1</div>
                        </td>
                        <td>
                          <p style="margin: 0; font-size: 16px; color: #333; font-weight: 600;">Create a Job Posting</p>
                          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Paste the job description or upload a file</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 40px; text-align: center; padding-right: 15px;">
                          <div style="width: 32px; height: 32px; background-color: #007bff; border-radius: 50%; text-align: center; line-height: 32px; color: #fff; font-weight: bold; font-size: 16px;">2</div>
                        </td>
                        <td>
                          <p style="margin: 0; font-size: 16px; color: #333; font-weight: 600;">Upload Resumes</p>
                          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Drag and drop or select multiple files</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 40px; text-align: center; padding-right: 15px;">
                          <div style="width: 32px; height: 32px; background-color: #007bff; border-radius: 50%; text-align: center; line-height: 32px; color: #fff; font-weight: bold; font-size: 16px;">3</div>
                        </td>
                        <td>
                          <p style="margin: 0; font-size: 16px; color: #333; font-weight: 600;">Get Ranked Results</p>
                          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">View AI-powered scores and candidate insights</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0" style="background-color: #007bff; border-radius: 4px;">
                      <tr>
                        <td style="padding: 14px 32px;">
                          <a href="https://app.example.com/dashboard" style="display: inline-block; text-decoration: none; color: #ffffff; font-weight: bold; font-size: 16px;">Start Ranking Resumes</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 25px 0 0 0; font-size: 14px; color: #999;">Questions? <a href="https://example.com/help" style="color: #007bff;">Check our help docs</a> or <a href="mailto:support@example.com" style="color: #007bff;">email support</a>.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999;">
              <p style="margin: 0 0 10px 0; text-align: center;">© 2026 the project. All rights reserved.</p>
              <p style="margin: 0; text-align: center;"><a href="https://example.com/unsubscribe" style="color: #666;">Unsubscribe</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 2.2 Email Verification

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    @media only screen and (max-width: 600px) {
      td[class="responsive-cell"] { width: 100% !important; display: block !important; }
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0 0 15px 0; font-size: 24px; font-weight: bold; color: #333;">Verify Your Email</h1>
              <p style="margin: 0 0 30px 0; font-size: 16px; color: #666;">Click the button below to confirm your email address.</p>
            </td>
          </tr>

          <!-- Verification button -->
          <tr>
            <td style="padding: 0 30px 30px 30px; text-align: center;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: #28a745; border-radius: 4px; padding: 16px 40px;">
                    <a href="{{verification_link}}" style="display: inline-block; text-decoration: none; color: #ffffff; font-weight: bold; font-size: 16px;">Verify Email Address</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alternative link -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Or copy this link into your browser:</p>
              <p style="margin: 0 0 20px 0; font-size: 12px; color: #999; word-break: break-all;"><code>{{verification_link}}</code></p>
            </td>
          </tr>

          <!-- Expiry notice -->
          <tr>
            <td style="padding: 20px 30px; background-color: #fff3cd; border-left: 4px solid #ffc107;">
              <p style="margin: 0; font-size: 13px; color: #856404;">
                <strong>This link expires in 24 hours.</strong> If you didn't create an account, you can ignore this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999; text-align: center;">
              <p style="margin: 0;">© 2026 the project. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 2.3 Password Reset

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: bold; color: #333;">Reset Your Password</h1>
              <p style="margin: 0 0 25px 0; font-size: 16px; color: #666; line-height: 1.6;">We received a request to reset the password for your the project account.</p>

              <!-- Reset button -->
              <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #dc3545; border-radius: 4px; padding: 14px 32px;">
                    <a href="{{reset_link}}" style="display: inline-block; text-decoration: none; color: #ffffff; font-weight: bold; font-size: 16px;">Reset Password</a>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <div style="padding: 15px; background-color: #f0f0f0; border-radius: 4px; margin: 25px 0;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #333; font-weight: bold;">Security Notice</p>
                <p style="margin: 0; font-size: 13px; color: #666;">If you didn't request a password reset, you can safely ignore this email. Your account remains secure.</p>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 13px; color: #999;">This link expires in 1 hour. If it's expired, you can request a new password reset.</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999; text-align: center;">
              <p style="margin: 0;">© 2026 the project. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 2.4 Payment Receipt

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5; }
    table { border-collapse: collapse; }
    .amount { font-size: 32px; font-weight: bold; color: #28a745; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 40px 30px; text-align: center; border-bottom: 4px solid #28a745;">
              <h1 style="margin: 0 0 10px 0; font-size: 28px; font-weight: bold; color: #333;">Payment Received</h1>
              <p style="margin: 0; font-size: 16px; color: #666;">Thank you for your purchase</p>
            </td>
          </tr>

          <!-- Amount display -->
          <tr>
            <td style="padding: 30px; text-align: center; background-color: #f9f9f9; border-bottom: 1px solid #eee;">
              <p style="margin: 0 0 5px 0; font-size: 14px; color: #999;">Amount Paid</p>
              <p class="amount" style="margin: 0;">${{amount}}</p>
            </td>
          </tr>

          <!-- Receipt details -->
          <tr>
            <td style="padding: 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 10px 0; font-size: 14px;">
                    <strong style="display: inline-block; width: 120px; color: #666;">Order ID:</strong>
                    <span style="color: #333;">{{order_id}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 14px;">
                    <strong style="display: inline-block; width: 120px; color: #666;">Plan:</strong>
                    <span style="color: #333;">{{plan_name}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 14px;">
                    <strong style="display: inline-block; width: 120px; color: #666;">Date:</strong>
                    <span style="color: #333;">{{payment_date}}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 14px;">
                    <strong style="display: inline-block; width: 120px; color: #666;">Billing Period:</strong>
                    <span style="color: #333;">{{billing_period}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Credits added -->
          <tr>
            <td style="padding: 20px 30px; background-color: #e8f5e9; border-left: 4px solid #28a745;">
              <p style="margin: 0 0 5px 0; font-size: 14px; color: #333; font-weight: bold;">Credits Added</p>
              <p style="margin: 0; font-size: 24px; font-weight: bold; color: #28a745;">{{credits_amount}} credits</p>
            </td>
          </tr>

          <!-- Invoice link -->
          <tr>
            <td style="padding: 20px 30px;">
              <p style="margin: 0; font-size: 14px; color: #666;">
                <a href="{{invoice_link}}" style="color: #007bff;">Download Invoice (PDF)</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999;">
              <p style="margin: 0 0 10px 0;">Questions about your receipt? <a href="mailto:billing@example.com" style="color: #007bff;">Contact billing support</a></p>
              <p style="margin: 0; text-align: center;">© 2026 the project. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 2.5 Trial Expiring Soon

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Trial Ends Soon</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #ffffff;">Your Trial Ends {{trial_end_date}}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 25px 0; font-size: 16px; color: #666; line-height: 1.6;">Hi {{first_name}},</p>
              <p style="margin: 0 0 25px 0; font-size: 16px; color: #666; line-height: 1.6;">Your the project trial ends in {{days_remaining}} days. Upgrade now to continue ranking resumes with AI.</p>

              <!-- Plan features -->
              <h3 style="margin: 30px 0 15px 0; font-size: 16px; font-weight: bold; color: #333;">What You Get With {{plan_name}}</h3>
              <ul style="margin: 0 0 25px 0; padding: 0 0 0 20px; font-size: 14px; color: #666;">
                <li style="margin: 10px 0;">Unlimited resume screening</li>
                <li style="margin: 10px 0;">AI-powered ranking and analysis</li>
                <li style="margin: 10px 0;">Priority support</li>
                <li style="margin: 10px 0;">Email resume ingestion</li>
              </ul>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #667eea; border-radius: 4px; padding: 14px 32px;">
                    <a href="{{upgrade_link}}" style="display: inline-block; text-decoration: none; color: #ffffff; font-weight: bold; font-size: 16px;">Upgrade Now</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #999;">No credit card required to start. Cancel anytime.</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999; text-align: center;">
              <p style="margin: 0;">© 2026 the project. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### 2.6 Usage Alert (80% Credits Used)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've Used 80% of Your Credits</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 20px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 30px; background-color: #fff3cd; border-bottom: 3px solid #ffc107; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: bold; color: #856404;">You've Used 80% of Your Credits</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 25px 0; font-size: 16px; color: #666; line-height: 1.6;">Hi {{first_name}},</p>
              <p style="margin: 0 0 25px 0; font-size: 16px; color: #666; line-height: 1.6;">You've used {{used_credits}} of your {{total_credits}} credits. You have {{remaining_credits}} credits remaining.</p>

              <!-- Usage bar -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: bold; color: #333;">Usage: {{usage_percentage}}%</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #e9ecef; border-radius: 4px; height: 24px; overflow: hidden;">
                      <tr>
                        <td width="{{usage_percentage}}%" style="background-color: #ffc107; height: 24px;"></td>
                        <td></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Options -->
              <h3 style="margin: 30px 0 15px 0; font-size: 16px; font-weight: bold; color: #333;">Options</h3>
              <p style="margin: 0 0 15px 0; font-size: 14px; color: #666;">
                <strong>Buy Credits:</strong> Add more credits to your account anytime.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                <tr>
                  <td style="background-color: #ffc107; border-radius: 4px; padding: 12px 28px;">
                    <a href="{{buy_credits_link}}" style="display: inline-block; text-decoration: none; color: #333; font-weight: bold; font-size: 14px;">Buy Credits Now</a>
                  </td>
                  <td style="padding: 0 15px;">
                    <table cellpadding="0" cellspacing="0" style="border: 2px solid #e9ecef; border-radius: 4px; padding: 10px 20px;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="{{upgrade_plan_link}}" style="text-decoration: none; color: #667eea; font-weight: bold; font-size: 14px;">Upgrade Plan</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0 0; font-size: 13px; color: #999;">Your account will continue working until you run out of credits.</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999; text-align: center;">
              <p style="margin: 0;">© 2026 the project. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 3. Bulletproof Email Button Pattern

The classic email button that works in Outlook, Gmail, and all major clients:

```html
<!-- Bulletproof Button with VML fallback -->
<table cellpadding="0" cellspacing="0" style="margin: 20px 0;">
  <tr>
    <td align="center">
      <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{button_link}}" style="height: 44px; v-text-anchor: middle; width: 200px;" arcsize="4%" stroke="f" fillcolor="#007bff">
          <w:anchorlock/>
          <center style="color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold;">Button Text</center>
        </v:roundrect>
      <![endif]-->
      <a href="{{button_link}}" style="background-color: #007bff; border: 1px solid #007bff; border-radius: 4px; color: #ffffff; display: inline-block; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; line-height: 44px; text-align: center; text-decoration: none; width: 200px; mso-padding-alt: 10px 20px; text-decoration: none;">
        Button Text
      </a>
    </td>
  </tr>
</table>
```

### Button Variants

```html
<!-- Primary (Blue) -->
<table cellpadding="0" cellspacing="0">
  <tr>
    <td style="background-color: #007bff; border-radius: 4px; padding: 14px 32px;">
      <a href="{{link}}" style="color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">Primary Button</a>
    </td>
  </tr>
</table>

<!-- Success (Green) -->
<table cellpadding="0" cellspacing="0">
  <tr>
    <td style="background-color: #28a745; border-radius: 4px; padding: 14px 32px;">
      <a href="{{link}}" style="color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">Success Button</a>
    </td>
  </tr>
</table>

<!-- Danger (Red) -->
<table cellpadding="0" cellspacing="0">
  <tr>
    <td style="background-color: #dc3545; border-radius: 4px; padding: 14px 32px;">
      <a href="{{link}}" style="color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">Danger Button</a>
    </td>
  </tr>
</table>

<!-- Warning (Yellow/Orange) -->
<table cellpadding="0" cellspacing="0">
  <tr>
    <td style="background-color: #ffc107; border-radius: 4px; padding: 14px 32px;">
      <a href="{{link}}" style="color: #333333; text-decoration: none; font-weight: bold; font-size: 16px;">Warning Button</a>
    </td>
  </tr>
</table>
```

---

## 4. Email Footer Pattern

Required by CAN-SPAM law (15 US Code Section 7704):

```html
<tr>
  <td style="padding: 30px 20px; border-top: 1px solid #eee; background-color: #f9f9f9; font-size: 12px; color: #999;">
    <!-- Company info & address -->
    <table cellpadding="0" cellspacing="0" style="margin: 0 0 15px 0;">
      <tr>
        <td style="font-weight: bold; color: #666;">the project</td>
      </tr>
      <tr>
        <td>123 Tech Street</td>
      </tr>
      <tr>
        <td>San Francisco, CA 94105</td>
      </tr>
      <tr>
        <td>United States</td>
      </tr>
    </table>

    <!-- Links -->
    <p style="margin: 15px 0 0 0; text-align: center;">
      <a href="https://example.com/unsubscribe" style="color: #666; text-decoration: none;">Unsubscribe</a> |
      <a href="https://example.com/preferences" style="color: #666; text-decoration: none;">Update Preferences</a> |
      <a href="https://example.com/privacy" style="color: #666; text-decoration: none;">Privacy Policy</a>
    </p>

    <!-- Social media -->
    <p style="margin: 10px 0 0 0; text-align: center;">
      <a href="https://twitter.com/rankora" style="text-decoration: none; margin: 0 5px;"><img src="https://cdn.example.com/twitter.png" alt="Twitter" width="20" height="20" style="display: inline-block;"></a>
      <a href="https://linkedin.com/company/rankora" style="text-decoration: none; margin: 0 5px;"><img src="https://cdn.example.com/linkedin.png" alt="LinkedIn" width="20" height="20" style="display: inline-block;"></a>
    </p>

    <!-- Copyright -->
    <p style="margin: 10px 0 0 0; text-align: center;">© 2026 the project. All rights reserved.</p>
  </td>
</tr>
```

---

## 5. Responsive Email Design

Mobile-first fallback using media queries:

```html
<style>
  @media only screen and (max-width: 600px) {
    body {
      width: 100% !important;
    }

    /* Stack columns vertically on mobile */
    table[class="responsive-table"] {
      width: 100% !important;
    }

    td[class="responsive-cell"] {
      width: 100% !important;
      display: block !important;
      text-align: left !important;
      padding: 20px 0 !important;
    }

    /* Full-width images */
    img[class="responsive-image"] {
      width: 100% !important;
      height: auto !important;
      max-width: 600px;
    }

    /* Increase font sizes for readability */
    h1 {
      font-size: 22px !important;
      line-height: 1.3 !important;
    }

    h2 {
      font-size: 18px !important;
    }

    p {
      font-size: 14px !important;
    }

    /* Full-width buttons */
    table[class="button-table"] {
      width: 100% !important;
    }

    table[class="button-table"] a {
      width: 100% !important;
      display: block !important;
    }
  }
</style>
```

---

## 6. React Email / Resend Integration

Using `@react-email/components` to build emails in React:

```typescript
// components/WelcomeEmail.tsx
import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Img,
  Link,
  Font,
  Preview,
} from '@react-email/components';

interface WelcomeEmailProps {
  firstName: string;
  email: string;
  dashboardUrl: string;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  firstName,
  email,
  dashboardUrl,
}) => (
  <Html>
    <Head>
      <Font
        fontFamily="Helvetica"
        fallbackFontFamily="Arial"
        webFont={{
          url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700',
          format: 'woff2',
        }}
      />
      <Preview>Welcome to the project</Preview>
    </Head>
    <Body style={{ fontFamily: 'Helvetica, Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
      <Container style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' }}>
        {/* Header */}
        <Section style={{ padding: '40px 30px', textAlign: 'center', borderBottom: '2px solid #007bff' }}>
          <Img
            src="https://cdn.example.com/logo.png"
            alt="the project"
            width="200"
            height="50"
            style={{ display: 'block', margin: '0 auto' }}
          />
        </Section>

        {/* Main content */}
        <Section style={{ padding: '40px 30px' }}>
          <Text style={{ fontSize: '28px', fontWeight: 'bold', color: '#333', marginBottom: '20px' }}>
            Welcome to the project!
          </Text>
          <Text style={{ fontSize: '16px', color: '#666', lineHeight: '1.6', marginBottom: '25px' }}>
            Hi {firstName},
          </Text>
          <Text style={{ fontSize: '16px', color: '#666', lineHeight: '1.6', marginBottom: '25px' }}>
            We're excited to have you on board. the project makes resume screening faster and smarter using AI-powered ranking.
          </Text>

          {/* CTA */}
          <Button
            href={dashboardUrl}
            style={{
              background: '#007bff',
              color: '#ffffff',
              padding: '14px 32px',
              borderRadius: '4px',
              fontWeight: 'bold',
              fontSize: '16px',
              textDecoration: 'none',
              display: 'inline-block',
              marginTop: '20px',
            }}
          >
            Start Ranking Resumes
          </Button>

          <Text style={{ fontSize: '14px', color: '#999', marginTop: '25px' }}>
            Questions?{' '}
            <Link href="https://example.com/help" style={{ color: '#007bff' }}>
              Check our help docs
            </Link>{' '}
            or{' '}
            <Link href={`mailto:support@example.com`} style={{ color: '#007bff' }}>
              email support
            </Link>
          </Text>
        </Section>

        {/* Footer */}
        <Section
          style={{
            padding: '30px',
            borderTop: '1px solid #eee',
            backgroundColor: '#f9f9f9',
            fontSize: '12px',
            color: '#999',
          }}
        >
          <Text style={{ textAlign: 'center', margin: '0' }}>
            © 2026 the project. All rights reserved.
          </Text>
          <Text style={{ textAlign: 'center', margin: '5px 0 0 0' }}>
            <Link href="https://example.com/unsubscribe" style={{ color: '#666' }}>
              Unsubscribe
            </Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

// Sending with Resend
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendWelcomeEmail = async (
  to: string,
  firstName: string,
  dashboardUrl: string,
) => {
  try {
    const response = await resend.emails.send({
      from: 'the project <noreply@rankora.com>',
      to,
      subject: 'Welcome to the project',
      react: <WelcomeEmail firstName={firstName} email={to} dashboardUrl={dashboardUrl} />,
    });
    return response;
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    throw error;
  }
};
```

---

## 7. Dark Mode in Email

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="light dark">
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      background-color: #ffffff;
      color: #333333;
    }

    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #e0e0e0;
      }

      .dark-bg {
        background-color: #2a2a2a !important;
      }

      .dark-text {
        color: #e0e0e0 !important;
      }

      .dark-border {
        border-color: #404040 !important;
      }

      /* Invert logo if needed */
      img[class="logo-dark"] {
        filter: invert(1);
      }

      /* Light text on dark backgrounds */
      .heading {
        color: #ffffff !important;
      }

      .subtext {
        color: #a0a0a0 !important;
      }
    }
  </style>
</head>
<body style="background-color: #ffffff; color: #333;">
  <!-- Template uses classes: .dark-bg, .dark-text, .dark-border, .logo-dark -->
</body>
</html>
```

---

## Testing & Validation

1. **Litmus** or **Email on Acid** — test across 70+ clients
2. **Inline CSS checker** — verify all styles are inline
3. **Image validation** — all images must have alt text and be hosted on HTTPS
4. **Link checker** — all UTM parameters and tracking
5. **Spam score** — use SpamAssassin to check deliverability
6. **File size** — keep total HTML under 102KB

---

## Dark Mode Implementation

### Email Dark Mode Strategy
Email dark mode support is limited and inconsistent across clients. Use CSS media query `@media (prefers-color-scheme: dark)` with fallback for unsupported clients.

### Color Mapping for Dark Mode
- Light background: `#ffffff` → Dark: `#1a1a1a` (with fallback to light if not supported)
- Light text: `#333333` → Dark: `#e0e0e0`
- Light borders: `#eee` → Dark: `#404040`
- Light section bg: `#f9f9f9` → Dark: `#2a2a2a`
- Light code blocks: `#f5f5f5` → Dark: `#1f1f1f`

### Email Dark Mode Rules
1. **Limited support**: Gmail, Apple Mail, Outlook 365 (web) support dark mode; Outlook desktop does not
2. **Use inline styles with fallbacks**: Always provide light mode as default, dark mode as enhancement
3. **Logo handling**: Consider inverting logo in dark mode if it has a light background using `filter: invert(1)`
4. **Buttons**: Use solid colors that work in both modes; avoid relying on borders alone

### Dark Mode Email Example
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="color-scheme" content="light dark">
  <style>
    /* Light mode (default) */
    body {
      background-color: #ffffff;
      color: #333333;
    }

    /* Dark mode - only supported clients will use this */
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a !important;
        color: #e0e0e0 !important;
      }

      .dark-bg {
        background-color: #2a2a2a !important;
      }

      .dark-text {
        color: #e0e0e0 !important;
      }

      .dark-border {
        border-color: #404040 !important;
      }

      /* Logo invert in dark mode */
      img.logo {
        filter: invert(1) !important;
      }

      /* Buttons: ensure readability */
      .btn {
        background-color: #3b82f6 !important;
        color: #ffffff !important;
      }

      /* Headings: brighten in dark mode */
      h1, h2, h3 {
        color: #ffffff !important;
      }

      /* Links: adjust for dark mode */
      a {
        color: #60a5fa !important;
      }
    }
  </style>
</head>
<body style="background-color: #ffffff; color: #333333; margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <!-- Email content with .dark-bg, .dark-text, .dark-border classes -->
</body>
</html>
```

---

## Responsive Behavior

### Email Responsive Strategy
Email clients have limited support for true responsive design. Use media queries for mobile stacking with fallbacks for unsupported clients.

### Breakpoint Strategy
- **Mobile (< 600px)**: Single column, stacked content, full-width tables
- **Desktop (> 600px)**: Multi-column layout, side-by-side content if desired

### Key Responsive Rules for Email
1. **Table width**: Set max-width 600px on outer table, 100% width on inner tables for mobile flexibility
2. **Column stacking**: Use `@media only screen and (max-width: 600px)` to stack table columns
3. **Font sizes**: Minimum 14px on mobile for readability, 12px on desktop (Outlook limitation)
4. **Button width**: Full-width on mobile (`width: 100%`), constrained on desktop with padding
5. **Image scaling**: Set max-width 100% with height auto to prevent overflow on mobile

### Responsive Email Example
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Desktop - default */
    @media only screen and (min-width: 601px) {
      .content {
        width: 600px !important;
      }
      .col {
        width: 50% !important;
        display: inline-block !important;
      }
      .img {
        max-width: 280px !important;
      }
      .btn {
        width: auto !important;
        padding: 12px 24px !important;
      }
    }

    /* Mobile - stacked */
    @media only screen and (max-width: 600px) {
      .content {
        width: 100% !important;
      }
      .col {
        width: 100% !important;
        display: block !important;
      }
      .img {
        max-width: 100% !important;
        height: auto !important;
      }
      .btn {
        width: 100% !important;
        display: block !important;
        padding: 16px 12px !important;
        box-sizing: border-box !important;
      }
      .text {
        font-size: 16px !important;
        line-height: 1.5 !important;
      }
      .heading {
        font-size: 20px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <!-- Outer container - max 600px width -->
  <table class="content" width="600" style="max-width: 600px; width: 100%; margin: 0 auto; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px;">

        <!-- Two-column row - stacks on mobile -->
        <table width="100%" style="width: 100%; border-collapse: collapse;">
          <tr>
            <!-- Column 1 - 50% on desktop, 100% on mobile -->
            <td class="col" style="padding: 10px; vertical-align: top;">
              <img class="img" src="image1.jpg" alt="Image 1" style="max-width: 280px; width: 100%; height: auto; display: block;">
            </td>
            <!-- Column 2 - 50% on desktop, 100% on mobile -->
            <td class="col" style="padding: 10px; vertical-align: top;">
              <h2 class="heading" style="font-size: 24px; margin: 0 0 10px 0; color: #333;">
                Heading
              </h2>
              <p class="text" style="font-size: 14px; line-height: 1.6; color: #666; margin: 0;">
                Content goes here...
              </p>
            </td>
          </tr>
        </table>

        <!-- Full-width button - stacks nicely -->
        <table width="100%" style="margin-top: 20px;">
          <tr>
            <td align="center">
              <a
                href="https://example.com/cta"
                class="btn"
                style="
                  display: inline-block;
                  padding: 12px 24px;
                  background-color: #3b82f6;
                  color: #ffffff;
                  text-decoration: none;
                  border-radius: 4px;
                  font-size: 14px;
                  font-weight: bold;
                "
              >
                Call to Action
              </a>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Best Practices Summary

- Use HTML tables for layout, not CSS Grid/Flexbox
- Inline all CSS; no external stylesheets or embedded `<style>`
- Max width 600px, centered
- System fonts only (Arial, Helvetica, Georgia)
- Media queries for mobile stacking (graceful degradation)
- `@media (prefers-color-scheme: dark)` for dark mode (Gmail, Apple Mail support only)
- VML fallback for buttons in Outlook
- CAN-SPAM compliant: physical address + unsubscribe link
- Test across Gmail, Outlook, Apple Mail, mobile
- Minimum font size 14px on mobile for accessibility
- All images must have alt text and be hosted on HTTPS
- Responsive images: max-width 100%, height auto

