# Communications

## What it does

Communications combines the activity timeline, phone dialer, video launch controls, messages, and email conversations. It can search CRM contacts so a conversation starts from the right person and record context.

![Communications phone workspace](../screenshots/communications.jpg)

## Where it lives

- Route: `/?tab=phone` for the Phone tab; the other communication tabs share the same workspace.
- Sidebar: **Projects → Communications**

## Enable it

Open Communications and choose **Activity**, **Phone**, **Video**, **Messages**, or **Email**. Configure the corresponding provider in Settings, refresh its status, select a contact, and test with a non-customer destination first.

## What it needs

- Twilio or another implemented calling route for phone work.
- Configured email transport and mailbox access for sending and conversations.
- A supported meeting link or video provider for video actions.
- CRM contacts for record-linked communication history.

## Limits and safety

Unconfigured tabs remain visible but do not invent a successful connection. Calls, messages, and email can incur provider charges and contact real people. Confirm the selected contact, number, address, and sender before an outbound action.

