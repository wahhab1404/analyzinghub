const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  to: string;
  subject: string;
  code: string;
  type: 'login' | 'signup';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { to, subject, code, type }: EmailRequest = await req.json();

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

    const actionText = type === 'login' ? 'sign in to' : 'verify your account on';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; color: #3b82f6; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>AnalyzingHub</h1>
            </div>
            <div class="content">
              <h2>Your Verification Code</h2>
              <p>Use the following code to ${actionText} AnalyzingHub:</p>
              <div class="otp-code">${code}</div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 AnalyzingHub. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

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
        subject: subject || `Your AnalyzingHub verification code: ${code}`,
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