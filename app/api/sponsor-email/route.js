import { NextResponse } from "next/server";
import { Resend } from "resend";
import { sponsorEmailHtml, newspaperOutreachEmailHtml, tdaOutreachEmailHtml } from "@/lib/sponsor-email-template";

const BRAND_FROM = {
  farrington_dev: "Farrington Development <redacted@example.invalid>",
  newsroomaios: "NewsroomAIOS <redacted@example.invalid>",
  newsroomaios_demo: "NewsroomAIOS <redacted@example.invalid>",
  wnc_times: "WNC Times <redacted@example.invalid>",
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextHtml({ brandLabel, plainText }) {
  const safeBrand = escapeHtml(brandLabel || "Farrington Development");
  const safeBody = escapeHtml(plainText || "").replace(/\n/g, "<br />");
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;max-width:680px;margin:0 auto;padding:24px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">${safeBrand}</div>
      <div style="font-size:15px;">${safeBody}</div>
    </div>
  `;
}

export async function POST(req) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Resend API key is not configured" }, { status: 503 });
    }
    const resend = new Resend(apiKey);

    const formData = await req.formData();
    const toRaw = formData.get("to");
    const to = toRaw.split(",").map(e => e.trim()).filter(e => e.includes("@"));
    const subject = formData.get("subject");
    const campaignType = formData.get("campaignType") || "sponsors";
    const contactName = formData.get("contactName");
    const paperName = formData.get("paperName");
    const marketName = formData.get("marketName");
    const category = formData.get("category");
    const price = Number(formData.get("price")) || 2500;
    const monthlyPrice = Number(formData.get("monthlyPrice")) || Math.round(price / 12);
    const plainText = formData.get("body");
    const city = formData.get("city") || "";
    const state = formData.get("state") || "";
    const brand = formData.get("brand") || campaignType;
    const fromName = formData.get("fromName") || "";

    if (!to.length || !subject) {
      return NextResponse.json({ error: "Missing required fields: to, subject" }, { status: 400 });
    }

    let html;
    if (campaignType === "farrington_dev" || campaignType === "newsroomaios_demo" || campaignType === "wnc_times") {
      html = plainTextHtml({ brandLabel: fromName || campaignType, plainText });
    } else if (campaignType === "tda_outreach") {
      html = tdaOutreachEmailHtml({ contactName: contactName || "there", orgName: paperName || "your tourism office", state: state || "" });
    } else if (campaignType === "newspaper_outreach") {
      html = newspaperOutreachEmailHtml({ contactName: contactName || "there", paperName: paperName || "your paper", city, state });
    } else {
      html = sponsorEmailHtml({ contactName: contactName || "there", paperName: paperName || "Our Paper", marketName: marketName || "", category: category || "", price, monthlyPrice });
    }

    const attachments = [];
    const files = formData.getAll("attachments");
    for (const file of files) {
      if (file && file.size > 0) {
        const bytes = await file.arrayBuffer();
        attachments.push({ filename: file.name, content: Buffer.from(bytes) });
      }
    }

    const { data, error } = await resend.emails.send({
      from: BRAND_FROM[brand] || BRAND_FROM[campaignType] || process.env.RESEND_FROM_EMAIL || "Farrington Development <redacted@example.invalid>",
      to, subject, html, text: plainText,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
