# Privacy & GDPR — Compliance Requirements

> Source: shopify.dev/docs/apps/launch/privacy-requirements | shopify.dev/docs/apps/build/compliance/privacy-law-compliance
> Last extracted: 2026-04-04

## Privacy Policy (BLOCKING)

### Mandatory Requirements

**BLOCKING:** Every app must have a privacy policy

1. **Publicly Accessible** — linked from App Store listing
2. **In User's Language** — policy language matches app users
3. **Clear & Detailed** — merchants/customers understand data usage
4. **Comprehensive** — covers all data collection practices
5. **Legally Sound** — compliant with GDPR, CPRA, and local laws

### What to Include in Privacy Policy

| Section | What to Disclose |
|---------|------------------|
| **Personal Data Collected** | List all data types: names, emails, phone numbers, usage data, IP addresses, cookies |
| **Processing Purposes** | Why each data type is collected: order processing, notifications, analytics, security |
| **Data Retention** | How long data is stored before deletion (e.g., "Customer data deleted 30 days after app uninstall") |
| **Third Parties** | Who has access: payment processors, analytics services, email providers, support tools |
| **Data Subject Rights** | GDPR Article 15: access, deletion, correction; how to request |
| **Geographic Transfers** | If data moves outside EU/UK, explain safeguards (Standard Contractual Clauses, etc.) |
| **Cookies & Tracking** | What cookies used, purpose, how to opt-out |
| **Contact Info** | Email/form for privacy questions |
| **Data Security** | Encryption methods, access controls, security measures |

### Example Privacy Policy Structure

```markdown
# Privacy Policy

## 1. Data We Collect
- Customer names and email addresses (from order data)
- Shop information (name, domain, plan level)
- Usage analytics (features used, frequency, errors)

## 2. Why We Collect It
- To provide core functionality (customer list, analytics)
- To improve app performance and stability
- To detect and prevent abuse

## 3. How Long We Keep It
- Customer data: deleted when app uninstalled
- Usage analytics: deleted after 90 days
- Error logs: deleted after 30 days

## 4. Who We Share It With
- Shopify (for API calls)
- Sentry (for error tracking)
- No third-party marketing services

## 5. Your Rights
- Access: contact us with shop ID
- Deletion: instant via GDPR webhook handlers
- Correction: update in your Shopify account

## 6. Contact
Email: privacy@yourapp.com
```

---

## GDPR Compliance (EU/UK Merchants & Customers)

### Data Transfer Restrictions

**BLOCKING:** Cannot transfer personal data outside EU/UK without safeguards

**Allowed Transfer Methods:**
1. **Standard Contractual Clauses (SCC)** — legal agreement ensuring protection
2. **Binding Corporate Rules** — internal company policy approved by regulators
3. **Explicit Consent** — customer/merchant agrees to transfer
4. **Legal Basis** — documented legal requirement for transfer

**Implementation:**
- Use EU-based servers when possible (avoid US-only data centers)
- If using US servers, implement SCCs with data processor
- Document data transfer basis in privacy policy
- Get merchant consent for non-EU transfers

### Three Mandatory Compliance Webhooks

**BLOCKING:** Must implement all 3 webhooks; app will be rejected without them

#### 1. customers/data_request (Data Export Request)

**Trigger:** Merchant or customer exercises GDPR Article 15 right (right to access)

**Deadline:** 30 days to respond

**Required Response:**
1. Compile ALL personal data about requesting customer
2. Return in portable format: JSON, CSV, or PDF
3. Include: Name, email, order history, app-specific data
4. Deliver to merchant (via email or app interface)
5. Log the request and response

**Implementation:**
```typescript
// app/routes/webhooks.tsx
case "CUSTOMERS_DATA_REQUEST":
  const customerId = payload.customer?.id;
  const shop = session.shop;

  // 1. Query all customer data
  const customerData = await prisma.customerData.findMany({
    where: { shop, customerId: String(customerId) }
  });

  // 2. Format as CSV or JSON
  const csvData = convertToCSV(customerData);

  // 3. Email to merchant (Shopify doesn't provide customer email)
  await sendEmail({
    to: shop, // Sent to shop contact
    subject: "Customer Data Export",
    attachment: csvData
  });

  return new Response("OK", { status: 200 });
```

#### 2. customers/redact (Data Deletion Request)

**Trigger:** Customer exercises GDPR Article 17 right (right to be forgotten)

**Deadline:** 30 days to comply

**Required Response:**
1. Permanently delete ALL personal data about customer
2. Include: Name, email, profile, order history, communications
3. Anonymize remaining records (cannot re-identify)
4. Confirm deletion in logs
5. Use secure deletion (overwrite data, not just mark as deleted)

**Implementation:**
```typescript
// app/routes/webhooks.tsx
case "CUSTOMERS_REDACT":
  const customerId = payload.customer?.id;
  const shop = session.shop;

  // 1. Delete all customer personal data
  await prisma.customerData.deleteMany({
    where: { shop, customerId: String(customerId) }
  });

  // 2. Anonymize if retaining some data
  await prisma.customerHistory.updateMany(
    { where: { shop, customerId: String(customerId) } },
    { data: { customerName: "Deleted", email: null } }
  );

  // 3. Log deletion
  await logGDPRAction("CUSTOMER_REDACT", customerId, shop);

  return new Response("OK", { status: 200 });
```

#### 3. shop/redact (Shop Deletion Request)

**Trigger:** Merchant closes store or uninstalls app (triggered 48 hours after uninstall)

**Deadline:** 30 days to comply

**Required Response:**
1. Delete ALL shop data and customer records
2. Include: Merchant contact info, shop settings, all customer data
3. Clean up databases AND backups
4. Confirm deletion
5. Log the deletion

**Implementation:**
```typescript
// app/routes/webhooks.tsx
case "SHOP_REDACT":
  const shop = session.shop;

  // 1. Delete all shop data
  await prisma.shop.delete({ where: { shopDomain: shop } });

  // 2. Delete all resources for this shop
  await prisma.customerData.deleteMany({ where: { shop } });
  await prisma.resource.deleteMany({ where: { shop } });

  // 3. Log deletion
  await logGDPRAction("SHOP_REDACT", null, shop);

  return new Response("OK", { status: 200 });
```

### Lawful Basis for Processing

**GDPR Requirement:** Document basis for collecting/processing personal data

**Valid Bases:**
1. **Consent** — customer/merchant explicitly agrees
2. **Contract** — necessary to deliver service (order processing)
3. **Legal Obligation** — required by law (tax compliance)
4. **Legitimate Interests** — necessary for business purpose (fraud prevention)

**Document in Privacy Policy:**
```
Data Type: Customer Email
Purpose: Send order notifications
Legal Basis: Contract (necessary to deliver service)
Retention: Until 30 days after order completed
```

---

## CPRA Compliance (California)

### Four Consumer Rights to Respect

1. **Right to Know** — what personal data is collected
2. **Right to Delete** — request deletion of personal data
3. **Right to Correct** — fix inaccurate personal data
4. **Right to Opt-Out** — refuse sale/sharing of personal data
5. **Right to Non-Discrimination** — no penalty for exercising rights

### Compliance Actions

| Right | Action Required |
|-------|-----------------|
| Know | Transparency: privacy policy discloses all data collection |
| Delete | Implement deletion webhooks (same as GDPR) |
| Correct | Allow merchants to update customer data |
| Opt-Out | Provide mechanism to disable data sharing |
| Non-Discrimination | Don't charge more for exercising rights |

**CPRA Deadlines:** Respond within 45 days (vs 30 days for GDPR)

---

## Other Privacy Jurisdictions

| Jurisdiction | Law | Key Requirements |
|--------------|-----|------------------|
| **Canada** | PIPEDA | Consent required, access rights, similar to GDPR |
| **Australia** | Privacy Act + Consumer Law | Australian Consumer Law compliance required |
| **Singapore** | PDPA | Explicit consent for sensitive data |
| **Brazil** | LGPD | Data minimization, consent, transparency |

**Recommendation:** Implement GDPR (strictest) to cover most jurisdictions

---

## Data Protection Best Practices

### 1. Minimal Data Collection
- **Only collect what's necessary** for app functionality
- ❌ Don't collect "just in case"
- ✅ Collect only: customer names, emails, order history (if needed)

### 2. Secure Storage
- **Encrypt sensitive data** at rest (AES-256)
- **Limit access** (only app servers, not personal computers)
- **Use secrets management** (environment variables, secrets manager)
- **Regular backups** with encryption

### 3. Transparent Processing
- **Privacy policy** explains all data usage
- **In-app disclosure** of data collection (e.g., "We analyze X to improve Y")
- **Merchant consent** for non-essential processing
- **No surprises** — merchants understand data usage

### 4. Secure Deletion
- **Permanent deletion** on request (not just marked as deleted)
- **Overwrite data** (multiple passes, not just single delete)
- **Backup deletion** — remove from all backups
- **Verification** — confirm deletion in logs

### 5. Regular Audits
- **Quarterly review** of data handling practices
- **Inventory of data** collected and stored
- **Access control audit** (who has access?)
- **Retention policy review** (still necessary to keep this data?)

### 6. Staff Training
- **GDPR awareness** for all developers
- **Data handling procedures** documented
- **Incident response plan** (what if data breaches?)
- **Regular updates** (privacy laws change)

---

## Privacy Checklist

- [ ] Privacy policy written and publicly accessible
- [ ] Privacy policy linked in App Store listing
- [ ] All data types collected documented in policy
- [ ] Purpose of each data collection explained
- [ ] Retention period specified for each data type
- [ ] Third-party data sharing disclosed
- [ ] Customer rights (access, delete, correct) explained
- [ ] Contact info for privacy questions provided
- [ ] customers/data_request webhook implemented and tested
- [ ] customers/redact webhook implemented and tested
- [ ] shop/redact webhook implemented and tested
- [ ] All webhooks respond within 30 days
- [ ] Data encryption at rest enabled
- [ ] Sensitive data not in logs
- [ ] No hardcoded personally identifiable information (PII)
- [ ] Data deletion tested (app uninstall removes all data)
- [ ] Backup deletion policy documented
- [ ] Standard Contractual Clauses in place (if data leaves EU)
- [ ] Staff trained on data protection
- [ ] Incident response plan documented

---

## References

- **Privacy Requirements:** https://shopify.dev/docs/apps/launch/privacy-requirements
- **Customer Privacy API:** https://shopify.dev/docs/api/customer-privacy
- **GDPR Compliance:** https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
- **GDPR Full Guide:** https://shopify.dev/docs/apps/launch/privacy-requirements/gdpr-compliance
