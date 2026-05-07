"""
backend/utils/gdpr_generator.py
Stateless GDPR request template generator.
Produces properly formatted legal letters for:
  - Subject Access Request  (Article 15)
  - Right to Erasure        (Article 17)
  - Data Portability        (Article 20)
"""

from datetime import datetime


def generate_request(company: str, email: str, request_type: str,
                     user_name: str = "The Data Subject",
                     additional_info: str = "") -> dict:
    """
    Generate a GDPR request letter.

    Args:
        company:         Target company/organisation name
        email:           Data subject's email address
        request_type:    "access" | "deletion" | "export"
        user_name:       Data subject's full name (optional)
        additional_info: Extra context to include (optional)

    Returns:
        { type, subject, template, generated_at }
    """
    company   = (company or "The Organisation").strip()
    email     = (email or "").strip()
    user_name = (user_name or "The Data Subject").strip()
    today     = datetime.utcnow().strftime("%d %B %Y")
    extra     = f"\n\nAdditional context: {additional_info.strip()}" if additional_info.strip() else ""

    generators = {
        "access":   _access_request,
        "deletion": _deletion_request,
        "export":   _export_request,
    }

    gen_fn = generators.get(request_type)
    if not gen_fn:
        raise ValueError(f"Unknown request type '{request_type}'. Use: access, deletion, export.")

    subject, body = gen_fn(company, email, user_name, today, extra)

    return {
        "type":         request_type,
        "subject":      subject,
        "template":     body,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Template builders ─────────────────────────────────────────────────────────

def _access_request(company, email, name, today, extra):
    subject = f"Subject Access Request – GDPR Article 15 – {email}"
    body = f"""Date: {today}

To: Data Protection Officer / Privacy Team
Organisation: {company}

Subject: Subject Access Request under GDPR Article 15

Dear Data Protection Officer,

I am writing to exercise my right of access under Article 15 of the General Data
Protection Regulation (GDPR) (EU) 2016/679.

I hereby request a copy of all personal data you hold about me, along with the
following information:

  1. The purposes for which my personal data is being processed.
  2. The categories of personal data concerned.
  3. The recipients or categories of recipients to whom my data has been or will
     be disclosed, including recipients in third countries or international
     organisations.
  4. The envisaged retention period, or the criteria used to determine that period.
  5. My rights to rectification, erasure, restriction of processing, and the right
     to object.
  6. The right to lodge a complaint with a supervisory authority.
  7. Any available information about the source of the data, where it was not
     collected directly from me.
  8. The existence of any automated decision-making, including profiling, and
     meaningful information about the logic involved and its significance.
{extra}
Please provide this information within one calendar month of receiving this request
as required by Article 12(3) GDPR.

My contact details:
  Name:  {name}
  Email: {email}

I look forward to your prompt response.

Yours faithfully,

{name}
{email}

---
This letter was generated using the Personal Data Privacy Manager extension.
Reference: GDPR Article 15 – Right of Access by the Data Subject
"""
    return subject, body


def _deletion_request(company, email, name, today, extra):
    subject = f"Right to Erasure Request – GDPR Article 17 – {email}"
    body = f"""Date: {today}

To: Data Protection Officer / Privacy Team
Organisation: {company}

Subject: Right to Erasure ("Right to be Forgotten") – GDPR Article 17

Dear Data Protection Officer,

I am writing to exercise my right to erasure under Article 17 of the General Data
Protection Regulation (GDPR) (EU) 2016/679.

I request the immediate and permanent deletion of all personal data you hold about
me, including but not limited to:

  • Account information (name, email address, username)
  • Behavioural and usage data
  • Device identifiers and IP address logs
  • Cookie and tracking data
  • Any data shared with or obtained from third parties

I believe one or more of the following grounds apply (Article 17(1)):

  (a) My personal data is no longer necessary for the purposes for which it was
      collected or processed.
  (b) I withdraw my consent on which processing is based and there is no other
      legal ground for processing.
  (c) I object to the processing under Article 21 and there are no overriding
      legitimate grounds.
  (d) My personal data has been unlawfully processed.
{extra}
Please also notify any third parties to whom my data has been disclosed, as required
by Article 19 GDPR.

I expect confirmation of erasure within one calendar month as required by
Article 12(3) GDPR.

My contact details:
  Name:  {name}
  Email: {email}

Yours faithfully,

{name}
{email}

---
This letter was generated using the Personal Data Privacy Manager extension.
Reference: GDPR Article 17 – Right to Erasure
"""
    return subject, body


def _export_request(company, email, name, today, extra):
    subject = f"Data Portability Request – GDPR Article 20 – {email}"
    body = f"""Date: {today}

To: Data Protection Officer / Privacy Team
Organisation: {company}

Subject: Right to Data Portability – GDPR Article 20

Dear Data Protection Officer,

I am writing to exercise my right to data portability under Article 20 of the
General Data Protection Regulation (GDPR) (EU) 2016/679.

I request a complete copy of all personal data I have provided to your organisation,
in a structured, commonly used, and machine-readable format (e.g. JSON, CSV, or XML).

This should include, but not be limited to:

  • Profile and account information
  • Preferences, settings, and history
  • Content I have created or uploaded
  • Transaction and usage history
  • Any other data processed on the basis of my consent or a contract
{extra}
Where technically feasible, I also request that my personal data be transmitted
directly to another controller of my choosing (Article 20(2)).

Please fulfil this request within one calendar month of receipt as required by
Article 12(3) GDPR.

My contact details:
  Name:  {name}
  Email: {email}

Yours faithfully,

{name}
{email}

---
This letter was generated using the Personal Data Privacy Manager extension.
Reference: GDPR Article 20 – Right to Data Portability
"""
    return subject, body
