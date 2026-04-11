# App Review Process — Submission to Launch

> Source: shopify.dev/docs/apps/launch/app-store-review | shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
> Last extracted: 2026-04-04

## Status Progression

### 1. Draft
- App created in Developer Dashboard
- Not yet submitted for review
- Cannot be seen by merchants
- Status: Preparing submission

### 2. Submitted
- Developer clicks "Submit for Review"
- Confirmation email sent
- Shopify review team receives submission
- Status: Waiting for review

### 3. Reviewed
- Shopify reviewed the app
- If additional fixes needed, status changes to "Reviewed"
- Developer receives email with issues/questions
- Status: Requires response/changes

### 4. Published
- App approved and published
- App appears on Shopify App Store
- Merchants can install
- Status: Live

---

## Review Timeline

| Step | Timeline |
|------|----------|
| **Submission** | Developer submits app |
| **Review** | 2-5 business days typical (can be longer if issues found) |
| **Outcome** | Approved, Rejected, or Needs Changes |
| **If Changes Needed** | Fix issues, resubmit (resets review clock) |
| **Total Time** | 1-4 weeks typical (depending on fixes needed) |

---

## What Triggers Review

### Automatic Review on Submission
- All public app submissions go through Shopify review team
- Review focuses on: security, privacy, functionality, compliance
- Checklist items verified:
  - All 11 BLOCKING requirements met
  - App functions as described
  - No vulnerabilities present
  - Privacy policy adequate
  - Demo store works

---

## 10 Common Rejection Reasons

### 1. **Missing/Broken Privacy Policy Link**
- Link doesn't work or 404s
- Policy incomplete or generic
- Policy doesn't explain data collection
- **Fix:** Write comprehensive policy, test link

### 2. **App Not Functional**
- App crashes or has bugs
- Features don't work as described
- Demo store broken or inaccessible
- **Fix:** Test thoroughly on dev store, fix bugs, restart demo store

### 3. **Security Vulnerabilities**
- OWASP Top 10 issues found
- Hardcoded secrets discovered
- SQL injection, XSS, or CSRF issues
- **Fix:** Security audit, fix vulnerabilities, retest

### 4. **Using Deprecated APIs**
- App uses APIs within 90-day deprecation window
- Using unsupported API versions
- **Fix:** Update to latest API version, redeploy

### 5. **Missing Compliance Webhooks**
- customers/data_request webhook not implemented
- customers/redact webhook not working
- shop/redact webhook missing
- **Fix:** Implement all 3 webhooks, test on dev store

### 6. **Scope Over-Requesting**
- Requesting scopes app doesn't need
- Requesting admin_api.graphql_queries without justification
- **Fix:** Remove unused scopes, document necessity

### 7. **No Working Demo Store**
- Demo store link doesn't work
- App not installed on demo store
- Store closed/inactive
- **Fix:** Create new dev store, install app, provide working URL

### 8. **Poor/Incomplete Listing**
- Missing app description
- No pricing information
- Screenshots missing or poor quality
- **Fix:** Complete listing per best practices file

### 9. **Over-Requesting Merchant Data**
- App copies product catalog without permission
- Connects to unauthorized data sources
- Duplicates customer data unnecessarily
- **Fix:** Only process merchant's own data, minimize collection

### 10. **Theme Modifications Without Extensions**
- App directly modifies theme code
- Injects Liquid into theme.liquid
- Cannot use custom code in theme
- **Fix:** Use theme app extensions (blocks) instead

---

## If Rejected or Needs Changes

### Receiving Rejection Email

**Email Contains:**
- Issues found during review
- Which requirements not met
- Examples of violations
- What needs to be fixed

### Response Protocol

1. **Read carefully** — understand each issue
2. **Fix issues** — address every point raised
3. **Test thoroughly** — verify fixes work on dev store
4. **Reply to email** — explain fixes made
5. **Resubmit** — click "Resubmit for Review"
6. **New review starts** — clock resets

### Handling Discretionary Rejections

Some rejections are discretionary (reviewer judgment, not checklist):
- App incomplete or beta
- Features not production-ready
- UX poor or confusing
- Performance issues
- Doesn't meet quality standards

**Response:**
- Request clarification if needed
- Polish app quality and UX
- Resubmit with improvements
- Be patient — reviewers are thorough

---

## Best Practices for Passing Review

### Before Submission

1. **Complete Requirements Checklist**
   - [ ] All 11 BLOCKING requirements met
   - [ ] Privacy policy written and linked
   - [ ] Demo store working
   - [ ] All webhooks implemented
   - [ ] No deprecated APIs
   - [ ] Scopes minimized

2. **Test Thoroughly**
   - [ ] Install on dev store
   - [ ] Test every feature
   - [ ] Test on mobile
   - [ ] Test error flows
   - [ ] Test billing (if applicable)
   - [ ] Run Lighthouse (>90 score)

3. **Verify All URLs**
   - [ ] Privacy policy link works
   - [ ] Support links work
   - [ ] Demo store accessible
   - [ ] Changelog accessible
   - [ ] FAQ link works

4. **Test Billing (If Applicable)**
   - [ ] Create test charges
   - [ ] Verify charge confirmation
   - [ ] Test charge decline handling
   - [ ] Test refund flow
   - [ ] Test subscription cancellation

5. **Security Review**
   - [ ] `npm audit` clean (no vulnerabilities)
   - [ ] No hardcoded secrets
   - [ ] No test data in production
   - [ ] Penetration testing done
   - [ ] Secrets in env vars only

6. **Code Quality**
   - [ ] No console.log or debugging code
   - [ ] TypeScript strict mode
   - [ ] Linting clean (eslint passes)
   - [ ] No TODO comments
   - [ ] Code is production-ready

7. **Documentation**
   - [ ] README complete
   - [ ] Changelog updated
   - [ ] Help docs written
   - [ ] API docs (if applicable)
   - [ ] Setup guide clear

### During Review

- **Monitor email** — watch for Shopify communications
- **Keep demo store active** — don't close it during review
- **Don't make changes** — wait for decision before updating
- **Respond promptly** — if changes needed, fix quickly

### If Approved

- App appears on Shopify App Store
- Merchants can install
- Monitor support emails
- Keep app maintained and updated

---

## Review Status Check

**How to Check Status:**
1. Log into Partner Dashboard
2. Go to Apps section
3. Click your app
4. Check "Status" field
5. View submission timeline

**Status Details Show:**
- Current status (Draft, Submitted, Reviewed, Published)
- Submission date
- Last review date
- Any reviewer comments

---

## Re-Submission Tips

### After Rejection

**Don't:**
- ❌ Resubmit immediately without fixes
- ❌ Ignore reviewer feedback
- ❌ Use different app name to bypass rejection
- ❌ Submit incomplete fixes
- ❌ Argue with reviewer decision

**Do:**
- ✅ Carefully read all feedback
- ✅ Fix every issue thoroughly
- ✅ Test fixes comprehensively
- ✅ Explain what you fixed in resubmission message
- ✅ Request clarification if feedback unclear

### Resubmission Message Template

```
We've addressed all feedback from your review:

1. **Privacy Policy:** Expanded policy to include all data types and added
   contact information.
2. **API Version:** Updated app to use latest stable API (2025-10).
3. **Webhooks:** Implemented all 3 compliance webhooks and tested on dev store.
4. **Security:** Ran `npm audit` and fixed vulnerabilities; removed hardcoded
   secrets.

Demo store: https://my-test-store.myshopify.com/admin/apps/...

Ready for re-review. Thank you!
```

---

## Review Checklist

- [ ] All 11 BLOCKING requirements verified
- [ ] Privacy policy complete, linked, accessible
- [ ] Demo store created, app installed, working
- [ ] All features tested on dev store
- [ ] All webhooks implemented and tested
- [ ] No deprecated APIs used
- [ ] `npm audit` clean (no vulnerabilities)
- [ ] No hardcoded secrets
- [ ] Lighthouse score >90 (mobile)
- [ ] Performance acceptable (page load <3s)
- [ ] Mobile responsive and fully functional
- [ ] All links (privacy, support, FAQ) verified working
- [ ] Billing tested (if applicable)
- [ ] Documentation complete (README, changelog, help)
- [ ] App listing complete (icon, title, description, screenshots)
- [ ] Category and keywords accurate
- [ ] Emergency contact updated in Partner Dashboard
- [ ] Support contact email verified working
- [ ] Code quality review passed (linting, TypeScript)

---

## References

- **Submit for Review:** https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review
- **Review Process:** https://shopify.dev/docs/apps/launch/app-store-review/review-process
- **Pass Review:** https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review
- **Rejection Reasons:** https://shopify.dev/docs/apps/launch/app-store-review/review-failure-reasons
