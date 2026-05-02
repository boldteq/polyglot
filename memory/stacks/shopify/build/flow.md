# Build: Flow Extensions

> Source: shopify.dev/docs/apps/build/flow
> Last extracted: 2026-04-04

## Overview

**Purpose:** Shopify Flow is an app for merchant automation. Developers extend it with custom tasks.

**Components:** Triggers and Actions (developers CANNOT build conditions — only Shopify can)

**Extensibility:** Events in your app can trigger workflows; workflows can execute your app actions.

**Use case:** Automate store operations, integrations, multi-step business logic.

## Triggers

**Definition:** Task that starts workflow execution.

**Represents:** An event happening in store or app.

**Developer role:** Create trigger extensions to publish app events to Flow.

### Trigger Fields

- **Settings section:** Specify trigger fields in TOML file
- **Field types:**
  - **Reference fields:** Send identifier of Shopify resource; Flow can access all related data
  - **Custom fields:** Define custom data sent with trigger request
- **Event data:** Triggers include data describing the event

### Trigger Implementation

```toml
# shopify.flow.extension.toml (trigger)
[[triggers]]
name = "my_event"
description = "Event triggered by my app"

[triggers.settings]
my_field = { type = "string" }
resource_field = { type = "reference", resource = "Product" }
```

Emit trigger: POST to Flow API with event data

## Actions

**Definition:** Workflow component representing task executed when conditions met.

**Execution:** Runs in store or app when workflow conditions are true.

**Developer role:** Build actions so merchants can use your app in Flow workflows.

### Action Fields

- **Settings section:** Define action endpoint requirements in TOML
- **Field types:** Same as triggers (reference and custom fields)
- **Merchant input:** Merchants provide field values in Flow UI when building workflow

### Action Implementation

```toml
# shopify.flow.extension.toml (action)
[[actions]]
name = "my_action"
description = "Action executed by Flow"
endpoint = "https://myapp.com/flow/actions/my_action"

[actions.settings]
target_field = { type = "string" }
product_ref = { type = "reference", resource = "Product" }
```

Action endpoint receives POST with merchant-configured values

## Conditions (Developer Constraint)

**CRITICAL:** Only Shopify builds conditions — developers CANNOT create custom conditions.

**Available conditions:** Shopify-maintained set of condition builders.

**Limitation:** Triggers and actions must work with Shopify's condition set.

## Common Patterns

### Pattern 1: Trigger → Conditions → Action
- App event fires trigger
- Merchant builds workflow with Shopify conditions
- Workflow executes app action

### Pattern 2: Multiple Triggers
- Chain multiple app/Shopify triggers
- Share same action

### Pattern 3: Reference Field Usage
- Send Product/Order/Customer reference
- Merchant can access all data for that resource in conditions/subsequent actions

## Pitfalls

- **Endpoint availability required** — Action endpoints must be publicly accessible
- **No custom conditions** — Cannot limit workflow logic to custom conditions
- **Rate limiting** — Flow actions should handle concurrent merchant workflows
- **Error handling** — Action failures may halt workflow; return appropriate error codes
