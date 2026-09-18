# Maps → Command Center

A Chrome extension that turns Google Maps business listings into leads in your
Command Center CRM. Browse Google Maps, click "Send this business" (or "Send
all loaded") in the floating panel, and the listing lands in your CRM as a
lead. It also works on Google's "More places" local finder results
(`google.com/search?...&udm=1`).

It is a plain, unpacked Manifest V3 extension — no build step, no
dependencies, no bundler. Load the folder as-is.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder
   (`tools/maps-to-command-center`).
4. Click the extension's toolbar icon to open its settings page.

## Set your CRM's URL

The extension ships pointed at `http://localhost:3000` and does not know
about any specific server — you tell it where your CRM lives.

1. Open the extension's options page (click its toolbar icon).
2. Pick **Local** for a CRM running on your own machine, or choose
   **Custom URL…** and enter your CRM's base URL
   (e.g. `https://crm.example.com`).
3. Click **Save**.

Chrome extensions can only talk to hosts they have permission for. The first
time you save a given origin, Chrome will prompt you to grant the extension
access to it — that's expected, and is what lets this extension work with
any CRM URL rather than one hardcoded host. If you decline, nothing is saved
and the extension will tell you so.

## Authentication

Two ways in. Either works; pick one.

**Signed-in session (simplest).** The extension sends requests with your
browser's cookies, so if you are logged into your CRM in the same Chrome
profile, harvested leads go in under your own account. Nothing else to set up —
leave the API token field blank.

**Server token (for unattended use).** Set `FCC_MAPS_INTAKE_TOKEN` to a long
random value in your CRM's environment, restart it, then paste the same value
into the extension's **API token** field. The extension sends it as
`Authorization: Bearer <token>` and the intake endpoint accepts it without a
login session. Use this when you want to harvest without being signed in, or
from a profile that isn't your CRM session.

If neither is set up, the endpoint refuses the request and the extension shows
the error it got back.

## What data is harvested, and where it goes

While you're on a Google Maps or Google local-finder page, the extension
reads the business details visible on that page: name, phone, address,
website, category, hours, star rating, review count, and the Google Maps
place link. Nothing else on the page is read.

When you click "Send," that data is POSTed as JSON to
`/api/leads/maps-intake` on the CRM base URL you configured, where it's
created as a lead.

**Privacy, plainly:** this extension reads the Google Maps pages you visit
and sends the extracted business details to the server you configured —
nothing else, nowhere else. It does not phone home to any other server,
and it does not read pages outside `google.com`.

## Shortcut

`Alt+S` sends the currently open business, or all visible feed results if no
listing panel is open.
