# Email deliverability — sign-in OTP codes

## The problem (2026-08-07)

Sign-in codes showed as **sent and "Delivered"** in Resend, but recipients never received
them — not in the inbox, not in spam.

## Root cause

Resend's `delivered` status only means the receiving mail server returned SMTP `250` at the
edge. For Microsoft 365 tenants, Exchange Online Protection (EOP) accepts at the edge and
*then* applies tenant policy. **Quarantined mail never reaches the user's Junk folder** — it
sits in the tenant quarantine portal, invisible to the recipient. That is why it appeared
nowhere.

Evidence gathered:

| Check | Finding |
| --- | --- |
| Resend verified domains | one only: `updates.inskyphoto.com`, created 2026-08-05 |
| Production `From` header | `onboarding@updates.inskyphoto.com` |
| Failing recipients | `david@rmtpstudio.com`, `david@dcooke.com` — both MX → `*.mail.protection.outlook.com` (Microsoft 365) |
| Recipient that worked | `apostopher@gmail.com` (Gmail — far more tolerant of cold domains) |
| SPF / DKIM on sender | present and passing via `send.updates.inskyphoto.com` |
| DMARC on sender | **absent** at both `_dmarc.updates.inskyphoto.com` and `_dmarc.inskyphoto.com` |

Why EOP scores this as phishing: a sending domain two days old with no reputation, carrying
**no DMARC record**, whose `From` domain (`inskyphoto.com` — an unrelated photography brand)
matches neither the product nor the links in the message body, delivering a **one-time
sign-in code**. Every one of those is a phishing indicator; together they are decisive.

The application code was never at fault. `src/lib/email/send-otp-email.ts` throws on any
Resend API error, so nothing failed silently on our side.

## The fix

### 1. Send from the product's own domain

Move the `From` address to a subdomain of the live product domain: `mail.rmtpstudio.com`.

A subdomain rather than the root because `rmtpstudio.com` already carries the Microsoft 365
SPF record (`v=spf1 include:secureserver.net -all`, hard fail) for human mail. A subdomain
gets its own independent SPF and keeps transactional reputation isolated from staff email.

Then set `EMAIL_FROM` in the production environment, **with a display name**:

```
EMAIL_FROM=RMTP Studio <no-reply@mail.rmtpstudio.com>
```

### 2. DMARC is already in place — and that is why this works

`rmtpstudio.com` already publishes:

```
_dmarc.rmtpstudio.com  TXT  "v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;"
```

There is no `sp=` tag, so subdomains inherit `p=quarantine`. Because alignment is **relaxed**
(`adkim=r; aspf=r`), mail sent from `mail.rmtpstudio.com` with Resend's DKIM and SPF records
in place aligns against the organisational domain `rmtpstudio.com` and **passes DMARC**.

This is the single biggest difference from the current setup, which has no DMARC at all.

DNS is hosted at GoDaddy (`ns75/ns76.domaincontrol.com`).

### 3. DNS records to add at GoDaddy

`updates.inskyphoto.com` was deleted from the Resend account to free the free-plan single
domain slot. This was safe: the account's entire send history was 5 RMTP Studio sign-in
codes and no inskyphoto mail ever flowed through it. (Its now-orphaned DKIM/SPF records in
inskyphoto's own DNS are harmless, but can be cleaned up.)

`mail.rmtpstudio.com` is registered in Resend — domain id `bc829b26-93e3-46f9-894c-3bf767d30386`.
Nothing existed at that subdomain, so there are no conflicts.

Add these three records in the GoDaddy DNS panel for **rmtpstudio.com**. GoDaddy's *Name*
field is relative to the root domain, so paste the names exactly as given:

| Type | Name | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDiCuyW0NwXxgqgjG7ASK7oXAXSIBN+w4aqvNY1OXjZZBfX9qvWaeQ2IzbC9Kr0iGYmUBZ7084YFDZsXAo2ABgAGPQqQjsVRftnVWT5y6wVhSosQpDUr6F3s80tveBE8KCcVE3FTo7X+YBcvn6nDwMQsP6NIiqZo9DbDTT9A560aQIDAQAB` | — |
| MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | — |

Then trigger verification in the Resend dashboard (or `POST /domains/{id}/verify`) and confirm
with:

```sh
dig +short TXT resend._domainkey.mail.rmtpstudio.com
dig +short TXT send.mail.rmtpstudio.com
dig +short MX  send.mail.rmtpstudio.com
```

#### Gotcha: GoDaddy rewrites the SPF record

GoDaddy's SPF management does not publish the literal string Resend asks for. It replaces the
value with a pointer into its own managed include:

```
asked for:  v=spf1 include:amazonses.com ~all
published:  v=spf1 include:dc-fd741b8612._spfm.send.mail.rmtpstudio.com ~all
```

This is **functionally correct** — the chain resolves through to the real SES ranges:

```sh
dig +short TXT dc-fd741b8612._spfm.send.mail.rmtpstudio.com
#=> "v=spf1 include:amazonses.com ~all"
```

It costs one extra DNS lookup, which is comfortably inside SPF's 10-lookup limit (this chain
uses 2). Don't "fix" it by fighting GoDaddy. Do verify the chain still resolves if
deliverability regresses later — a broken `_spfm` pointer would silently fail SPF. The same
rewrite was present on the old `updates.inskyphoto.com` setup, with the identical
account-level `dc-fd741b8612` hash.

### 4. Code changes already made

- `.env.local` — `EMAIL_FROM` was `school@rmtp.studio` (a domain with no nameservers); now
  `RMTP Studio <no-reply@mail.rmtpstudio.com>`.
- `src/env.ts` — `EMAIL_FROM` was validated with `z.string().email()`, which **rejects** the
  `Display Name <addr>` form. Widened to accept both. Without this the display-name address
  would have failed env validation at boot.

Set the same `EMAIL_FROM` value in the Vercel production environment.

## Gotcha: `rmtp.studio` is not a working domain

`.env.local` contains `EMAIL_FROM=school@rmtp.studio`. **`rmtp.studio` has no nameservers at
all** — it does not resolve. If that value ever reached production, Resend would reject the
send outright (domain not in the account). The product domain is `rmtpstudio.com`.

Note also that `src/env.ts` defaults `EMAIL_FROM` to `noreply@example.com` when unset, which
would fail the same way rather than loudly.

---

## For the Microsoft 365 tenant admin

Someone with Defender portal access to the **rmtpstudio.com** tenant
(`NETORG20354566.onmicrosoft.com`) needs to do the following. This both confirms the
diagnosis and releases the messages already being held.

### a. Check quarantine

1. Go to <https://security.microsoft.com> → **Review** → **Quarantine**.
2. Filter for sender `onboarding@updates.inskyphoto.com`, or subject **"Your sign-in code"**.
3. The missing sign-in codes should be listed there.
4. Select them → **Release** → tick *Report messages to Microsoft as false positives*.

### b. Run a message trace (confirms the verdict)

1. **Exchange admin center** → **Mail flow** → **Message trace**, or
   <https://security.microsoft.com> → **Mail flow** → **Message trace**.
2. Search the last 7 days for sender `onboarding@updates.inskyphoto.com`.
3. Open a result and read the detail — it will show the policy that acted on the message and
   the spam/phish confidence verdict (look for `SFV:` and `CAT:` values in the headers).

Please send back what the trace says. It tells us exactly which filter fired, which confirms
whether the domain change alone is sufficient.

### c. After the new domain is live — allow-list it

Once `mail.rmtpstudio.com` is verified in Resend and sending:

1. <https://security.microsoft.com> → **Policies & rules** → **Threat policies** →
   **Tenant Allow/Block Lists** → **Domains & addresses** → **Allow**.
2. Add `mail.rmtpstudio.com`.

This is a safety net while the new domain builds reputation. It is not a substitute for the
DKIM/SPF/DMARC setup above — do both.
