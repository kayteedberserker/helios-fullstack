export const RESET_LINK_MINUTES = 30;
export const LOGO_CID = 'nooky-brand-mark@nooky.io';

const escape = input => String(input).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function renderResetEmail({ link, privacyUrl }) {
  const reset = escape(link);
  const privacy = escape(privacyUrl);
  const subject = 'Reset your Nooky password';
  return {
    subject,
    text: `${subject}\n\nWe received a request to reset the password for your Nooky account. Use this link to choose a new password:\n\n${link}\n\nThis link expires in ${RESET_LINK_MINUTES} minutes and can be used once. If you didn’t request a reset, you can ignore this email.\n\nThe Nooky team\nPrivacy Policy: ${privacyUrl}`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f7f3ea;color:#23313e;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Your secure Nooky password reset link expires in ${RESET_LINK_MINUTES} minutes.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f7f3ea" style="background:#f7f3ea">
    <tr><td align="center" style="padding:32px 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px">
        <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e5e9ec;border-top:4px solid #087af5;border-radius:20px;padding:28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding-right:8px"><img src="cid:${LOGO_CID}" width="30" height="30" alt="" style="display:block;border:0"></td>
            <td style="font-size:26px;line-height:30px;font-weight:bold;letter-spacing:-1.1px;color:#253747">Nooky<span style="color:#086bd9">.</span></td></tr>
          </table>
          <p style="margin:26px 0 8px;color:#0861bd;font-size:11px;font-weight:bold;letter-spacing:1.6px">ACCOUNT SECURITY</p>
          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.18;letter-spacing:-.7px;color:#23313e">Reset your password</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#435361">We received a request to reset the password for your Nooky account. Use the button below to choose a new one.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" bgcolor="#075fc4" style="border-radius:10px;background:#075fc4"><a href="${reset}" style="display:inline-block;padding:13px 20px;border:1px solid #075fc4;border-radius:10px;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:bold">Reset my password</a></td></tr>
          </table>
          <p style="margin:20px 0 0;padding:12px 14px;background:#eef5fd;border-radius:9px;font-size:13px;line-height:1.5;color:#314f6c">This link expires in <strong>${RESET_LINK_MINUTES} minutes</strong> and can be used once.</p>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#435361">If you didn’t request a reset, you can ignore this email.</p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#435361">If the button doesn’t work, copy this link into your browser:<br><a href="${reset}" style="color:#075fc4;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all">${reset}</a></p>
        </td></tr>
        <tr><td align="center" style="padding:16px 6px;text-align:center;color:#435361;font-size:12px;line-height:1.65">
          The Nooky team · <a href="${privacy}" style="color:#075fc4;text-decoration:underline">Privacy Policy</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}
