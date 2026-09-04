# Automations

## What it does

Automation Studio stores reusable workflows with a trigger, ordered steps, data sources, outputs, metrics, and optional approval gates. Templates can create a draft automation that you then inspect, clone, enable, run, or delete.

![Automation Studio](../screenshots/automations.jpg)

## Where it lives

- Route: `/?tab=automations`
- Sidebar: **Build → Automations**

## Enable it

Choose **Add to studio** on a template or select **New Automation**. Review its scope, trigger, inputs, steps, destination, and approval policy. Save the draft, test it manually, and enable scheduling only after the result is correct.

## What it needs

- Credentials for every data source, model, and delivery channel used by its steps.
- A recipient address for workflows that deliver email.
- A running OpenOcti process and scheduler for recurring triggers.

## Limits and safety

Saving a schedule is not proof that a background runner is active. Approval-gated templates must remain held until an operator approves them. A run can complete only the step kinds implemented by its runner; inspect the run result before treating downstream delivery as verified.

