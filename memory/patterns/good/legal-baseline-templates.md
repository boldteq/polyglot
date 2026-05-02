# Legal Baseline Templates — Stack A & Stack B

**Created:** 2026-04-11 (Sync Pass 3, Tier 3 #9)
**Owner agent:** Sage (legal compliance gate) + Quill (copy polish)
**Anchored to:** Pinzo submission runbook item #15 (privacy/ToS URLs must be real and reachable), Rankora brand kit §8 (EU AI Act, "augment don't replace", evidence-based not bias-free), global `user/feedback.md` no-fabrication invariant
**Loaded by:** Sage (pre-submission gate), Quill (page copy), Koda (page scaffolding), Bolt (verifies URLs live before submission)

---

## Purpose

These are **reusable starting templates** — not final legal documents. Every new Boldteq product (Stack A SaaS or Stack B Shopify app) must ship Terms of Service, Privacy Policy, and a Data Processing Addendum on day 1. Without them:
- Shopify app store rejects submission
- EU AI Act / GDPR / CCPA exposure is uncapped
- Dodo Payments requires ToS URL at checkout
- Supabase RLS alone is not enough — users must be told what's stored and why

**Hard rule:** Sage blocks any submission where `/terms`, `/privacy`, `/dpa` return 404 or contain placeholder text. Bolt verifies with `curl -sSf` before submission.

**Legal disclaimer on the templates themselves:** These are engineering starting points. For high-risk deployments (EU AI Act high-risk category, enterprise contracts, regulated industries), a licensed attorney reviews before launch. Sage escalates to Yash when the product touches: healthcare, finance, children under 13, government contracts, or EU AI Act high-risk (resume screening = Rankora = already flagged).

---

## 1. Terms of Service — Stack A Template (SaaS, Dodo-billed)

Save as `app/terms/page.tsx` in any Stack A project. Replace `{{PRODUCT}}`, `{{COMPANY}}`, `{{DOMAIN}}`, `{{EFFECTIVE_DATE}}`, `{{JURISDICTION}}` before shipping.

```markdown
# Terms of Service

**Effective Date:** {{EFFECTIVE_DATE}}
**Last Updated:** {{EFFECTIVE_DATE}}

These Terms of Service ("Terms") govern your access to and use of {{PRODUCT}} ("Service"), operated by {{COMPANY}} ("we", "us", "our"). By creating an account or using the Service, you agree to be bound by these Terms.

## 1. Account Registration
You must be at least 18 years old to use the Service. You agree to provide accurate information and to keep your account credentials secure. You are responsible for all activity under your account.

## 2. Subscription and Billing
The Service is offered on a subscription basis. Paid plans are billed monthly in advance via Dodo Payments. By subscribing, you authorize us to charge your payment method for the selected plan until you cancel.

- **Free Plan:** Available at no cost, subject to usage limits described on our pricing page.
- **Paid Plans:** Billed monthly in USD (additional currencies may be offered). Prices are subject to change with 30 days' notice; existing subscribers are honored at the prior rate for one billing cycle after a change.
- **Cancellation:** You may cancel at any time from your account settings. Cancellation takes effect at the end of the current billing period. We do not issue prorated refunds for partial months.
- **Refunds:** We offer a refund within 7 days of initial purchase if you have not meaningfully used the Service. Subsequent renewals are non-refundable except as required by law.
- **Failed Payment:** If a payment fails, we will retry for up to 7 days. During that window your account may be downgraded to the Free plan. Full functionality is restored once payment succeeds.

## 3. Acceptable Use
You agree not to:
- Reverse-engineer, decompile, or attempt to extract the source code of the Service
- Use the Service to store or transmit unlawful content, including content that infringes third-party rights
- Upload content you do not own or have permission to process
- Probe, scan, or test the vulnerability of our systems without written permission
- Use the Service to build a competing product
- Exceed the rate limits or usage quotas of your plan through automated means

## 4. User Content
You retain ownership of content you upload ("User Content"). By uploading, you grant us a limited license to store, process, and display that content solely for the purpose of providing the Service to you.

You are solely responsible for the legality and accuracy of your User Content. We do not pre-screen User Content but may remove content that violates these Terms.

## 5. AI-Generated Output
The Service may use artificial intelligence and machine learning models (including third-party models) to generate output based on your inputs. You acknowledge:
- AI output may contain errors, omissions, or bias and should be reviewed by a qualified human before use for consequential decisions
- We do not guarantee the accuracy of AI-generated output
- You are responsible for how you use AI output, including compliance with applicable laws
- For regulated decisions (hiring, lending, healthcare, legal), AI output is advisory only and must be reviewed by a qualified professional

## 6. Service Availability
We target 99.5% monthly uptime but do not guarantee uninterrupted service. Scheduled maintenance, third-party provider outages, and force majeure events may cause downtime. We are not liable for downtime.

## 7. Data and Privacy
Our collection, use, and protection of your data is described in our [Privacy Policy]({{DOMAIN}}/privacy) and [Data Processing Addendum]({{DOMAIN}}/dpa), which are incorporated by reference.

## 8. Intellectual Property
The Service, including its design, code, trademarks, and documentation, is owned by {{COMPANY}}. Nothing in these Terms transfers ownership of the Service to you. Feedback you provide may be used by us without obligation to you.

## 9. Termination
We may suspend or terminate your account for violation of these Terms, non-payment, or activity that threatens the integrity of the Service. Upon termination:
- Access to the Service ends immediately
- You may request a data export within 30 days
- After 30 days, your data may be permanently deleted per our Privacy Policy

You may close your account at any time from your settings.

## 10. Disclaimer of Warranties
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

## 11. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, {{COMPANY}}'S TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THE SERVICE IS LIMITED TO THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM, OR $100, WHICHEVER IS GREATER. WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

## 12. Indemnification
You agree to indemnify and hold {{COMPANY}} harmless from claims arising from your User Content, your use of the Service in violation of these Terms, or your violation of applicable law.

## 13. Governing Law and Disputes
These Terms are governed by the laws of {{JURISDICTION}}, without regard to conflict-of-law rules. Disputes will be resolved in the courts of {{JURISDICTION}}, and you consent to personal jurisdiction there.

## 14. Changes to These Terms
We may update these Terms from time to time. Material changes will be communicated via email or in-app notice at least 30 days before taking effect. Continued use after the effective date constitutes acceptance.

## 15. Contact
Questions about these Terms: **legal@{{DOMAIN}}**
```

---

## 2. Privacy Policy — Stack A Template

Save as `app/privacy/page.tsx`.

```markdown
# Privacy Policy

**Effective Date:** {{EFFECTIVE_DATE}}

This Privacy Policy describes how {{COMPANY}} ("we", "us") collects, uses, and protects information when you use {{PRODUCT}}.

## 1. Information We Collect

**Account Information:** Email address, name, password hash (via Supabase Auth), and subscription tier.

**User Content:** Files, text, and data you upload to the Service for processing. This may include job descriptions, resumes, product data, or other content depending on the Service.

**Usage Data:** Pages viewed, features used, timestamps, device type, browser, IP address, and anonymized event data (via PostHog).

**Payment Data:** We do not store full payment card details. Dodo Payments processes and stores payment information under its own privacy policy.

**Error Data:** Crash reports, stack traces, and performance metrics (via Sentry). We scrub PII from error events before storage.

## 2. How We Use Information

- To provide, maintain, and improve the Service
- To process payments and manage subscriptions
- To communicate with you about the Service (transactional email via Resend)
- To investigate and prevent fraud, abuse, and security incidents
- To comply with legal obligations
- To train our own models **only with your explicit opt-in consent** — we do not use User Content to train models by default

## 3. Third-Party Processors

We share limited data with service providers strictly to operate the Service:

| Processor | Purpose | Data | Location |
|---|---|---|---|
| Supabase | Auth, database, storage | Account data, User Content | United States |
| Railway | Application hosting | All traffic | United States |
| Dodo Payments | Subscription billing | Email, payment tokens | United States |
| OpenAI | AI model inference | Prompts containing User Content (only for AI features) | United States |
| Anthropic | AI model inference (fallback) | Prompts containing User Content (only for AI features) | United States |
| Resend | Transactional email | Email address | United States |
| Sentry | Error monitoring | Scrubbed error events | United States |
| PostHog | Product analytics | Anonymized usage events | United States (EU option available) |

All processors are bound by data processing agreements.

## 4. AI Providers and Your Content

When you use AI features:
- Your prompt (which may include User Content) is sent to OpenAI or Anthropic for inference
- These providers have committed via their API terms to not train on API-submitted content
- We do not retain prompts beyond what is needed to deliver the response and operate the feature
- For enterprise customers with heightened requirements, we can configure a private deployment path; contact legal@{{DOMAIN}}

## 5. Data Retention

- **Account data:** Retained for the lifetime of your account plus 30 days after deletion for recovery purposes, then permanently deleted
- **User Content:** Retained for the lifetime of your account; deleted within 30 days of account closure
- **Usage data:** Retained for 13 months then aggregated and anonymized
- **Error data:** Retained for 90 days
- **Billing records:** Retained for 7 years to comply with tax law

## 6. Your Rights

Depending on your jurisdiction (GDPR, CCPA, UK GDPR, and similar), you have the right to:
- **Access** the personal data we hold about you
- **Correct** inaccurate data
- **Delete** your data ("right to erasure")
- **Export** your data in a machine-readable format
- **Object** to certain processing
- **Withdraw consent** where processing is consent-based
- **Lodge a complaint** with a supervisory authority

To exercise any right, email **privacy@{{DOMAIN}}**. We respond within 30 days.

## 7. International Data Transfers

We transfer data to the United States and other countries where our processors operate. For transfers from the EEA, UK, or Switzerland, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission.

## 8. Children's Privacy

The Service is not directed to children under 16. We do not knowingly collect data from children under 16. If you believe a child has provided data, email privacy@{{DOMAIN}} and we will delete it.

## 9. Security

We use industry-standard measures including:
- TLS 1.2+ for all traffic
- Encryption at rest for database and storage (Supabase default)
- Row-level security on every table (tenant isolation)
- Access logs and anomaly monitoring
- Least-privilege access for employees
- No production database access from laptops (only via approved tooling)

No system is perfectly secure. We will notify affected users within 72 hours of confirming a breach that materially impacts personal data.

## 10. Cookies

We use essential cookies for authentication and session management. We use analytics cookies (via PostHog) to understand product usage. You can disable non-essential cookies in your browser. We do not use advertising cookies.

## 11. Changes to This Policy

We will notify you of material changes by email or in-app notice at least 30 days before they take effect.

## 12. Contact

- **Privacy requests:** privacy@{{DOMAIN}}
- **Data Protection Officer (EEA/UK):** dpo@{{DOMAIN}} (if appointed)
- **Postal:** {{COMPANY_ADDRESS}}
```

---

## 3. Data Processing Addendum (DPA) — Stack A Template

Save as `app/dpa/page.tsx`. This is the document enterprise customers will ask for by name.

```markdown
# Data Processing Addendum

**Effective Date:** {{EFFECTIVE_DATE}}

This Data Processing Addendum ("DPA") forms part of the Terms of Service between {{COMPANY}} ("Processor") and the customer ("Controller") and governs processing of personal data by the Processor on behalf of the Controller.

## 1. Definitions
Terms not defined here have the meanings given in the GDPR (Regulation 2016/679).

## 2. Subject Matter and Duration
The Processor processes personal data for the duration of the Terms of Service in order to provide the Service.

## 3. Nature and Purpose of Processing
Storage, retrieval, transmission, and computation (including AI inference where Controller uses AI features) on personal data provided by the Controller.

## 4. Categories of Data Subjects
End users of the Controller's business, employees of the Controller, job applicants (if Rankora or similar screening product), and any individuals whose data the Controller uploads.

## 5. Categories of Personal Data
Name, email, professional information, resume content, job descriptions, ZIP/postal codes, and any other data the Controller chooses to upload.

## 6. Processor Obligations
The Processor shall:
- Process personal data only on documented instructions from the Controller
- Ensure persons authorized to process personal data are bound by confidentiality
- Implement appropriate technical and organizational security measures (see Privacy Policy §9)
- Assist the Controller in responding to data subject requests
- Notify the Controller within 48 hours of becoming aware of a personal data breach
- Delete or return all personal data at the end of the Service
- Make available information necessary to demonstrate compliance and allow for audits

## 7. Sub-Processors
The Controller authorizes the Processor to engage the sub-processors listed in the Privacy Policy §3. The Processor will notify the Controller of new sub-processors with 30 days' notice and give the Controller the right to object.

## 8. International Transfers
Where personal data is transferred outside the EEA/UK/Switzerland, the parties agree to be bound by the Standard Contractual Clauses (Module 2: Controller to Processor) as published by the European Commission, incorporated by reference.

## 9. Audits
The Controller may audit the Processor's compliance once per year on 30 days' notice, during business hours, at the Controller's expense, and subject to confidentiality obligations. SOC 2 Type II reports (when available) will satisfy audit requirements.

## 10. Liability
Liability under this DPA is subject to the limitation of liability clause in the Terms of Service.

## 11. AI Processing Specific Terms (applies only if Controller uses AI features)
- User prompts are sent to OpenAI/Anthropic under API terms that prohibit training on submitted content
- The Processor does not use Controller data to train its own models without explicit opt-in consent
- For EU AI Act high-risk deployments (e.g., resume screening), the Controller is the deployer and is responsible for the deployer-side obligations including bias monitoring, human oversight, and registration where required

## 12. Contact
Data protection questions: **dpo@{{DOMAIN}}** or **privacy@{{DOMAIN}}**
```

---

## 4. Stack B Shopify App — Delta

Shopify apps have different legal requirements. Most of Stack A templates apply, but these deltas are mandatory:

### 4.1 Shopify-specific ToS additions
Append to Stack A ToS §2 (Subscription and Billing):

```markdown
## 2A. Shopify Billing
If you install this app on Shopify, subscription charges are processed via Shopify's Billing API, not Dodo Payments. You authorize Shopify to bill you through your Shopify account. Cancellation and refunds follow Shopify's billing policies. {{COMPANY}} does not store your payment details for Shopify-billed subscriptions.
```

### 4.2 Shopify-specific Privacy Policy additions
Append to Stack A Privacy Policy §1 (Information We Collect):

```markdown
**Shop Data (Shopify apps only):** We access your Shopify store data according to the API scopes you grant during installation. Scopes for {{PRODUCT}} are: `{{SCOPES}}`. We store only what's necessary to operate the app. Shop data is scoped per store (multi-tenant isolation).

**Shopify Customer Data:** If our app processes customer data (orders, addresses), we handle it as a processor on your behalf under our DPA. We respond to Shopify's mandatory GDPR webhooks:
- `customers/data_request` — returns all data we hold for a customer within 30 days
- `customers/redact` — deletes customer data within 30 days
- `shop/redact` — deletes all shop data within 48 hours of app uninstall + 48-hour grace period
```

### 4.3 Shopify App Store listing requirements
The app store listing page must link to:
1. Privacy Policy URL (public, no auth wall)
2. Terms of Service URL
3. Support email
4. Pricing page (matches `shopify.app.toml` billing config exactly)

Sage runs this check before submission:
```bash
# submit-legal-check.sh — run from Pinzo root
DOMAIN="pinzo.app"
for path in privacy terms support pricing; do
  status=$(curl -sS -o /dev/null -w "%{http_code}" "https://$DOMAIN/$path")
  if [ "$status" != "200" ]; then
    echo "FAIL: https://$DOMAIN/$path returned $status"
    exit 1
  fi
done
echo "All legal URLs return 200"
```

Bolt blocks submission on any non-200.

---

## 5. Rankora-Specific EU AI Act Rider

Rankora is classified as **high-risk AI** under the EU AI Act (resume screening = Annex III category). Add this rider to Rankora's Terms of Service and Privacy Policy:

```markdown
## EU AI Act Notice (Rankora only)

{{PRODUCT}} is an AI-assisted resume evaluation tool. Under Regulation (EU) 2024/1689 (the "AI Act"), resume screening systems are classified as **high-risk AI systems** (Annex III, Point 4).

**{{COMPANY}} is the Provider.** We:
- Maintain a risk management system for the AI system
- Use training, validation, and testing data that meet quality criteria
- Maintain technical documentation demonstrating conformity
- Enable automatic logging of events throughout the system's lifecycle
- Design the system to allow effective human oversight
- Design for appropriate levels of accuracy, robustness, and cybersecurity
- Register the system in the EU database before placing it on the EU market (required from August 2, 2026)

**You (the Deployer) are responsible for:**
- Using the system according to its instructions
- Assigning human oversight to competent persons
- Monitoring the system's operation for indications of risk
- Keeping logs generated by the system for at least 6 months
- Informing workers' representatives and affected workers before deploying the system in the workplace
- Conducting a Fundamental Rights Impact Assessment if you are a public authority or body governed by public law
- Registering your use of the system in the EU database if required

**Important limitations:**
- {{PRODUCT}} provides **evidence-based rankings with quoted resume passages**, not hiring decisions
- {{PRODUCT}} does not select candidates — recruiters select candidates using {{PRODUCT}} as an input
- {{PRODUCT}} must not be used to make fully automated hiring decisions
- {{PRODUCT}} is not marketed or intended to evaluate protected characteristics; any such use is a misuse under these Terms

**NYC Local Law 144 notice (if you deploy for New York City jobs):**
If you use {{PRODUCT}} as an Automated Employment Decision Tool (AEDT) for candidates or employees in NYC, you must:
- Obtain an independent bias audit in the last 12 months
- Publicly post a summary of the audit results
- Notify candidates at least 10 business days before use
- Allow candidates to request an alternative selection process
{{COMPANY}} provides audit-ready logs and evidence trails in the Team plan to support these obligations. You remain responsible for obtaining the audit and issuing notices.
```

**Hard rule (enforced by Sage):** Rankora's legal copy must never claim the tool is "bias-free", "unbiased", "fair", or "compliant out of the box". It is *explainable* and *auditable*; compliance is a shared responsibility with the deployer.

---

## 6. Sage Submission Gate (legal-check.sh)

Sage runs this before any Pinzo app-store submission or Rankora cutover. Placed in `scripts/legal-check.sh` in each project root.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/legal-check.sh https://yourdomain.com
DOMAIN="${1:?domain required}"
MISSING=0

check_url() {
  local path="$1"
  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" "$DOMAIN$path" || echo "000")
  if [ "$status" != "200" ]; then
    echo "FAIL  $path → $status"
    MISSING=$((MISSING + 1))
  else
    echo "OK    $path"
  fi
}

scan_placeholders() {
  local path="$1"
  local body
  body=$(curl -sS "$DOMAIN$path" || echo "")
  for token in "{{PRODUCT}}" "{{COMPANY}}" "{{DOMAIN}}" "{{EFFECTIVE_DATE}}" "{{JURISDICTION}}" "lorem ipsum" "TODO"; do
    if echo "$body" | grep -qi "$token"; then
      echo "FAIL  $path contains placeholder: $token"
      MISSING=$((MISSING + 1))
    fi
  done
}

echo "Legal URL check: $DOMAIN"
check_url /terms
check_url /privacy
check_url /dpa

echo
echo "Placeholder scan:"
scan_placeholders /terms
scan_placeholders /privacy
scan_placeholders /dpa

echo
if [ $MISSING -gt 0 ]; then
  echo "LEGAL GATE FAILED — $MISSING issues"
  exit 1
fi
echo "LEGAL GATE PASSED"
```

Exit code 0 = Bolt may proceed. Non-zero = block submission/cutover.

---

## 7. Escalation Triggers (Sage → Yash)

Sage opens an escalation ticket (not an auto-fix) when any of these appear:
1. Product touches healthcare protected health information (HIPAA)
2. Product touches financial account data (PCI-DSS scope beyond payment processor tokens)
3. Product processes data of children under 13 (COPPA) or under 16 (GDPR)
4. Product targets EU AI Act high-risk categories (resume screening, credit scoring, biometric identification, critical infrastructure, education scoring, law enforcement, migration, justice)
5. Enterprise customer redlines the DPA
6. Data breach or suspected breach
7. Regulator inquiry or subpoena
8. Product launches in a new jurisdiction (new country = re-check ToS governing law + privacy rights)

For items 4 and 5, Sage pauses ship and waits for Yash to confirm whether to engage outside counsel.

---

## 8. How Each Agent Uses This File

| Agent | Action |
|---|---|
| **Koda** | Scaffolds `/terms`, `/privacy`, `/dpa` pages from these templates with real values filled in. Commits to repo. |
| **Quill** | Polishes any customer-facing legal copy on the pricing page, FAQ, upgrade modals. Enforces Rankora "evidence-based" language. |
| **Sage** | Runs `legal-check.sh` as a pre-submission gate. Blocks ship on placeholder tokens or 404s. Opens escalations per §7. |
| **Bolt** | Runs the gate one more time immediately before deploy/submit. Hard-blocks rollout if the gate fails. |
| **Verdict** | Treats a failing legal gate as a critical blocker — no SCALE decision is valid while `/terms`, `/privacy`, `/dpa` are broken. |
| **Mira** | On first successful use, captures the real values (product, company, domain, effective date) back into the project memory file for re-use. |

---

## 9. Version Log

- **v1 — 2026-04-11** — First legal baseline. Covers Stack A ToS/Privacy/DPA, Stack B Shopify deltas, Rankora EU AI Act rider, Sage legal gate, escalation triggers. Not a substitute for licensed counsel on high-risk deployments; Sage escalates when §7 triggers.
