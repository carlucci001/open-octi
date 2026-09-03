// ═══════════════════════════════════════════════════════════════
// NEWSPAPER OUTREACH EMAIL TEMPLATE (Campaign: Newspaper Upgrade)
// ═══════════════════════════════════════════════════════════════



export function newspaperOutreachEmailHtml(data) {
  const { contactName, paperName, city, state } = data;
  const signupUrl = `https://content.example.com`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Upgrade Your Newspaper with AI</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Logo -->
  <tr>
    <td style="background-color:#ffffff;padding:24px 40px;text-align:center;border-bottom:1px solid #e5e7eb;">
      <img src="https://content.example.com/newsroom-logo.png" alt="ContentHub" width="180" style="display:inline-block;max-width:180px;height:auto;" />
    </td>
  </tr>

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#2563eb 100%);padding:28px 40px;text-align:center;">
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">A News &amp; Community<br/>Engagement Platform</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">AI-powered tools built for community newspapers like yours</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px 24px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
        Hi ${contactName},
      </p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
        It was great talking with you. I can tell you care deeply about <strong>${paperName}</strong> and the community you serve in ${city}.
      </p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
        As I mentioned, <strong>ContentHub</strong> is a news and community engagement platform built specifically for community newspapers like yours. We handle the technology so you can focus on what matters — the journalism and the community.
      </p>

      <!-- What You Get -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background-color:#0f172a;padding:14px 24px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">What You Get — Day One</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;background-color:#f9fafb;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>AI-powered article generation</strong> — local news, sports, business, events covered automatically
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Professional website</strong> — modern design, mobile-optimized, Google News indexed
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Built-in sponsor system</strong> — 6 category slots at $2,500–$5,000/yr that YOU sell and keep
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>AI banner ad generation</strong> — create professional sponsor ads automatically
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 0 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Your brand, your market</strong> — keep your name, your identity, your editorial voice
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Revenue callout -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);border-radius:10px;padding:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">Revenue Potential — Year One</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#ffffff;">$17,500<span style="font-size:16px;font-weight:400;opacity:0.8;">/year</span></p>
            <p style="margin:6px 0 0;font-size:15px;color:rgba(255,255,255,0.85);">From 6 founding sponsors in your market</p>
          </td>
        </tr>
      </table>

      <!-- How it works -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#1e40af;">
              <strong>How it works:</strong> Sign up on our platform, choose your market, and your paper is live within 24 hours. We handle the AI, the hosting, the SEO, the distribution. You focus on your community and your sponsors.
            </p>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr>
          <td align="center">
            <a href="${signupUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">
              Visit ContentHub
            </a>
          </td>
        </tr>
      </table>

      <!-- Schedule a Demo CTA -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td align="center">
            <a href="https://calendar.app.google/Lii7ixesgekmiKNn6" style="display:inline-block;background-color:#059669;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
              &#128197; Schedule a 15-Minute Demo Call
            </a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:8px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Pick a time that works for you — I'll walk you through the platform live.</p>
          </td>
        </tr>
      </table>

      <!-- WNC Times proof -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background-color:#fefce8;border-left:4px solid #eab308;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.5;color:#854d0e;">
              <strong>See it in action:</strong> Our flagship paper, <a href="https://wnctimes.com" style="color:#2563eb;text-decoration:underline;font-weight:600;">WNC Times</a> in Asheville, NC, is already live and proving the model. Take a look — this is exactly what your paper would look like.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#374151;">Looking forward to getting you set up,</p>
      <p style="margin:0;font-size:16px;font-weight:600;color:#1e3a5f;">Carl Farrington</p>
      <p style="margin:2px 0 0;font-size:14px;color:#6b7280;">Founder, ContentHub</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
        <a href="https://content.example.com" style="color:#2563eb;text-decoration:none;font-weight:500;">content.example.com</a>
        &nbsp;&middot;&nbsp;
        <a href="https://wnctimes.com" style="color:#2563eb;text-decoration:none;font-weight:500;">wnctimes.com</a>
        &nbsp;&middot;&nbsp;
        <a href="https://company.example.com" style="color:#2563eb;text-decoration:none;font-weight:500;">company.example.com</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">PHONE_REDACTED &nbsp;&middot;&nbsp; redacted@example.invalid</p>
      <p style="margin:0;font-size:11px;color:#b0b7c3;">ContentHub is a service of Farrington Development, LLC</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// TDA OUTREACH EMAIL TEMPLATE (Campaign: State TDAs)
// ═══════════════════════════════════════════════════════════════



export function tdaOutreachEmailHtml(data) {
  const { contactName, orgName, state } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Tourism Promotion Platform for ${state}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Logo -->
  <tr>
    <td style="background-color:#ffffff;padding:24px 40px;text-align:center;border-bottom:1px solid #e5e7eb;">
      <img src="https://content.example.com/newsroom-logo.png" alt="ContentHub" width="180" style="display:inline-block;max-width:180px;height:auto;" />
    </td>
  </tr>

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#065f46 0%,#059669 50%,#10b981 100%);padding:28px 40px;text-align:center;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">A News &amp; Community Engagement<br/>Platform for ${state} Tourism</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">An AI-powered platform — built exclusively for ${orgName}</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px 24px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
        Hi ${contactName},
      </p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
        Thank you for taking the time to speak with me. I wanted to follow up because what we've built at <strong>ContentHub</strong> is unlike anything currently available to tourism development authorities — and I believe it could be a powerful new tool for ${orgName}.
      </p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
        Here's the idea in plain terms:
      </p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
        We build a <strong>dedicated news and community engagement platform</strong> for ${orgName} — a professional, AI-powered publication designed entirely around promoting tourism in your region. Hotels, restaurants, outfitters, attractions, event venues, B&amp;Bs — <strong>every member of your tourism network gets featured at no cost to them.</strong>
      </p>

      <!-- What's Included -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-radius:10px;overflow:hidden;border:1px solid #d1d5db;">
        <tr>
          <td style="background-color:#065f46;padding:14px 24px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">Your News &amp; Engagement Platform — Everything Included</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;background-color:#f0fdf4;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#059669;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Your own news &amp; community engagement platform</strong> — professionally designed and live within 24 hours
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#059669;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Free advertising for all your members</strong> — directory listings, premium placements, and editorial features at no cost to any business in your network
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#059669;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Advertorials &amp; business editorials</strong> — we write and publish feature stories on your member businesses, destinations, events, and attractions
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#059669;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Google News indexed</strong> — every article ranks in organic search, so travelers find your member businesses on a trusted news source
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#059669;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>AI voice assistant</strong> — built into your platform, giving visitors a conversational way to discover destinations and member businesses
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#059669;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>We handle everything</strong> — the news, the content, the technology, and all interactions with your member businesses
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#059669;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 0 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Dedicated support</strong> — one primary contact for your office, plus a support ticket system for anything you need
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Pricing -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#065f46 0%,#059669 100%);border-radius:10px;padding:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">Complete Engagement Platform — One Annual Fee</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#ffffff;">$25,000<span style="font-size:16px;font-weight:400;opacity:0.8;">/year</span></p>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">No additional costs for your office or your member businesses</p>
          </td>
        </tr>
      </table>

      <!-- Key differentiator -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background-color:#f0fdf4;border-left:4px solid #059669;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#065f46;">
              <strong>This is not an advertising product.</strong> There is nothing for your members to buy. This is a news and community engagement platform — we handle the content, the technology, and all member interactions. Every tourism business in your network benefits from being part of a professional, Google News-indexed publication that engages travelers and promotes your region year-round.
            </p>
          </td>
        </tr>
      </table>

      <!-- Comparison -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#1e40af;">
              <strong>Think of it this way:</strong> for less than the cost of a single billboard campaign, every tourism business in your region gets a full year of free promotion through a professional news and engagement platform — plus AI-powered tools that connect travelers directly to your member businesses.
            </p>
          </td>
        </tr>
      </table>

      <!-- CTAs -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr>
          <td align="center">
            <a href="https://content.example.com" style="display:inline-block;background-color:#059669;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">
              Learn More About ContentHub
            </a>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td align="center">
            <a href="https://calendar.app.google/Lii7ixesgekmiKNn6" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
              &#128197; Schedule a Demo
            </a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:8px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Or just reply to this email — I'm happy to set something up.</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">Looking forward to it,</p>

      <!-- Signature -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:16px;">
        <tr>
          <td style="padding-right:16px;vertical-align:top;">
            <a href="https://content.example.com" style="text-decoration:none;">
              <img src="https://content.example.com/newsroom-logo.png" alt="ContentHub" width="120" style="display:block;max-width:120px;height:auto;" />
            </a>
          </td>
          <td style="vertical-align:top;border-left:2px solid #059669;padding-left:16px;">
            <p style="margin:0;font-size:16px;font-weight:700;color:#065f46;">Carl Farrington</p>
            <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">Founder, ContentHub</p>
            <p style="margin:8px 0 0;font-size:13px;color:#374151;">PHONE_REDACTED</p>
            <p style="margin:2px 0 0;font-size:13px;">
              <a href="https://content.example.com" style="color:#059669;text-decoration:none;font-weight:500;">content.example.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
        <a href="https://content.example.com" style="color:#059669;text-decoration:none;font-weight:500;">content.example.com</a>
        &nbsp;&middot;&nbsp;
        <a href="https://wnctimes.com" style="color:#059669;text-decoration:none;font-weight:500;">wnctimes.com</a>
        &nbsp;&middot;&nbsp;
        <a href="https://company.example.com" style="color:#059669;text-decoration:none;font-weight:500;">company.example.com</a>
      </p>
      <p style="margin:0;font-size:11px;color:#b0b7c3;">ContentHub is a service of Farrington Development, LLC</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// SPONSOR EMAIL TEMPLATE (Campaign: Founding Sponsors)
// ═══════════════════════════════════════════════════════════════



export function sponsorEmailHtml(data) {
  const { contactName, paperName, marketName, category, price, monthlyPrice } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Founding Sponsor Opportunity</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
<tr><td align="center">

<!-- Main card -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Logo bar -->
  <tr>
    <td style="background-color:#ffffff;padding:24px 40px;text-align:center;border-bottom:1px solid #e5e7eb;">
      <img src="https://content.example.com/newsroom-logo.png" alt="ContentHub" width="180" style="display:inline-block;max-width:180px;height:auto;" />
    </td>
  </tr>

  <!-- Header banner -->
  <tr>
    <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 40px;text-align:center;">
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${paperName}</h1>
      <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.8);font-weight:400;">A News &amp; Community Engagement Platform for ${marketName}</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px 24px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
        Hi ${contactName},
      </p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#374151;">
        Thank you for taking my call. We're launching <strong>${paperName}</strong>, a news and community engagement platform serving ${marketName}.
      </p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
        I'm reaching out because we have a unique <strong>Founding Sponsor</strong> opportunity — and your business is an ideal fit for the <strong>${category}</strong> section.
      </p>

      <!-- Category ownership card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background-color:#1e3a5f;padding:14px 24px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">Your Exclusive Category</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff;">${category}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;background-color:#f9fafb;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Header, sidebar &amp; footer ads</strong> on every article in your section
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Unlimited advertorials</strong> and sponsored content pieces
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 12px 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>Zero competitors</strong> — you are the only sponsor in your category
                </td>
              </tr>
              <tr>
                <td width="24" valign="top" style="padding-top:2px;">
                  <div style="width:18px;height:18px;background-color:#2563eb;border-radius:50%;text-align:center;line-height:18px;font-size:11px;color:#fff;font-weight:bold;">&#10003;</div>
                </td>
                <td style="padding:0 0 0 12px;font-size:15px;line-height:1.5;color:#374151;">
                  <strong>12 months</strong> of exclusive category domination
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Pricing callout -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#059669 0%,#10b981 100%);border-radius:10px;padding:24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">Founding Sponsor Investment</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#ffffff;">$${price.toLocaleString()}<span style="font-size:16px;font-weight:400;opacity:0.8;">/year</span></p>
            <p style="margin:6px 0 0;font-size:15px;color:rgba(255,255,255,0.85);">Just $${monthlyPrice}/month</p>
          </td>
        </tr>
      </table>

      <!-- Urgency -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.5;color:#92400e;">
              <strong>Only 6 sponsor slots exist per market.</strong> Once your category is taken, it's gone. Don't miss the chance to own ${category} in ${marketName}.
            </p>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td align="center">
            <a href="https://content.example.com/sponsor?contact=${encodeURIComponent(contactName)}&market=${encodeURIComponent(marketName)}&category=${encodeURIComponent(category)}&paper=${encodeURIComponent(paperName)}&price=${price}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">
              View Full Details &amp; Reserve Your Spot
            </a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:12px;">
            <p style="margin:0;font-size:13px;color:#9ca3af;">Or reply directly to this email — we&rsquo;re happy to talk.</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#374151;">Looking forward to hearing from you,</p>
      <p style="margin:0;font-size:16px;font-weight:600;color:#1e3a5f;">Carl Farrington</p>
      <p style="margin:2px 0 0;font-size:14px;color:#6b7280;">Farrington Development</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
        <a href="https://company.example.com" style="color:#2563eb;text-decoration:none;font-weight:500;">company.example.com</a>
        &nbsp;&middot;&nbsp;
        <a href="https://content.example.com" style="color:#2563eb;text-decoration:none;font-weight:500;">content.example.com</a>
        &nbsp;&middot;&nbsp;
        <a href="https://wnctimes.com" style="color:#2563eb;text-decoration:none;font-weight:500;">wnctimes.com</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">PHONE_REDACTED &nbsp;&middot;&nbsp; redacted@example.invalid</p>
      <p style="margin:0;font-size:11px;color:#b0b7c3;">ContentHub is a service of Farrington Development, LLC</p>
    </td>
  </tr>

</table>
<!-- End main card -->

</td></tr>
</table>
<!-- End outer wrapper -->

</body>
</html>`;
}
