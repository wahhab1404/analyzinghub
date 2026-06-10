const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Language = "ar" | "en";

interface EmailRequest {
  to: string;
  subject?: string;
  code: string;
  type?: "login" | "signup";
  /** Optional UI language. When omitted the email is rendered bilingually. */
  language?: Language;
}

/**
 * Brand palette — kept in sync with the platform theme
 * (primary: hsl(217 91% 50%) ≈ #1d6ff2, accent cyan: hsl(189 80% 50%) ≈ #1ac7e6).
 */
const BRAND = {
  name: "AnalyzingHub",
  url: Deno.env.get("APP_BASE_URL") || "https://analyzhub.com",
  logo: Deno.env.get("EMAIL_LOGO_URL") || "https://analyzhub.com/logo.png",
  supportEmail: Deno.env.get("SMTP_FROM_EMAIL") || "noreply@analyzhub.com",
  gradientFrom: "#2563EB",
  gradientTo: "#06B6D4",
};

/** Localised copy for the OTP email. */
const COPY = {
  ar: {
    dir: "rtl",
    align: "right",
    preheader: "رمز التحقق الخاص بك من AnalyzingHub",
    heading: "رمز التحقق",
    intro: (type: string) =>
      type === "login"
        ? "استخدم الرمز التالي لتسجيل الدخول إلى حسابك في AnalyzingHub:"
        : "استخدم الرمز التالي لتأكيد حسابك في AnalyzingHub:",
    expiry: "ينتهي هذا الرمز خلال 10 دقائق.",
    ignore: "إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.",
    security: "لا تشارك هذا الرمز مع أي شخص. فريق AnalyzingHub لن يطلبه منك أبدًا.",
  },
  en: {
    dir: "ltr",
    align: "left",
    preheader: "Your AnalyzingHub verification code",
    heading: "Verification code",
    intro: (type: string) =>
      type === "login"
        ? "Use the following code to sign in to your AnalyzingHub account:"
        : "Use the following code to verify your AnalyzingHub account:",
    expiry: "This code expires in 10 minutes.",
    ignore: "If you didn't request this code, you can safely ignore this email.",
    security: "Never share this code with anyone. The AnalyzingHub team will never ask for it.",
  },
};

/** Renders one localised block (Arabic or English) of the OTP body. */
function otpBlock(lang: Language, code: string, type: string): string {
  const c = COPY[lang];
  return `
    <div dir="${c.dir}" style="text-align:${c.align};">
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">${c.heading}</h2>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">${c.intro(type)}</p>
      <div style="margin:0 0 18px;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
        <span style="display:inline-block;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND.gradientFrom};">${code}</span>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">${c.expiry}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">${c.ignore}</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;">${c.security}</p>
    </div>`;
}

/** Builds the full HTML email. If `language` is omitted, both languages are shown. */
function buildOtpEmail(code: string, type: string, language?: Language): string {
  let body: string;
  let preheader: string;

  if (language === "ar" || language === "en") {
    body = otpBlock(language, code, type);
    preheader = COPY[language].preheader;
  } else {
    // Bilingual: Arabic first, then a divider, then English.
    body = `
      ${otpBlock("ar", code, type)}
      <div style="height:1px;background:#e2e8f0;margin:28px 0;"></div>
      ${otpBlock("en", code, type)}`;
    preheader = `${COPY.ar.preheader} · ${COPY.en.preheader}`;
  }

  return `<!DOCTYPE html>
<html lang="ar">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${BRAND.name}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Cairo',Tahoma,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,${BRAND.gradientFrom} 0%,${BRAND.gradientTo} 100%);padding:32px;text-align:center;">
                <a href="${BRAND.url}" style="text-decoration:none;">
                  <img src="${BRAND.logo}" alt="${BRAND.name}" height="40" style="height:40px;max-height:40px;margin-bottom:8px;display:inline-block;" />
                  <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${BRAND.name}</div>
                </a>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                ${body}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#0f172a;padding:24px 32px;text-align:center;">
                <p style="margin:0 0 6px;font-size:13px;color:#cbd5e1;">${BRAND.name}</p>
                <p style="margin:0;font-size:12px;color:#64748b;">© ${new Date().getFullYear()} ${BRAND.name}. جميع الحقوق محفوظة · All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { to, subject, code, type, language }: EmailRequest = await req.json();

    if (!to || !code) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const zeptoApiKey = Deno.env.get("SMTP_PASSWORD");
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || "noreply@analyzhub.com";
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "AnalyzingHub";

    if (!zeptoApiKey) {
      console.error("SMTP_PASSWORD environment variable is missing");
      return new Response(
        JSON.stringify({
          error: "Configuration error",
          details: "SMTP_PASSWORD environment variable is not configured. Please set it in your deployment environment."
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const htmlContent = buildOtpEmail(code, type || "login", language);

    const defaultSubject = `رمز التحقق · Your AnalyzingHub code: ${code}`;

    const zeptoMailResponse = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        "Authorization": zeptoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: {
          address: fromEmail,
          name: fromName,
        },
        to: [
          {
            email_address: {
              address: to,
            },
          },
        ],
        subject: subject || defaultSubject,
        htmlbody: htmlContent,
      }),
    });

    if (!zeptoMailResponse.ok) {
      const errorData = await zeptoMailResponse.text();
      console.error("ZeptoMail API error:", errorData);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errorData }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const responseData = await zeptoMailResponse.json();
    console.log("Email sent successfully:", responseData);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send email", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
