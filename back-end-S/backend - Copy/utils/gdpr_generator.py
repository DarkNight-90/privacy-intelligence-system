from datetime import datetime

def generate_gdpr_letter(request_type, company_name, requester_name, requester_email, reason=''):
    """
    Generate a GDPR compliant letter for various request types.
    """
    today = datetime.now().strftime('%B %d, %Y')

    templates = {
        'access': f"""Dear {company_name},

I am writing to exercise my right of access to my personal data in accordance with Article 15 of the General Data Protection Regulation (GDPR).

I request that you provide me with a copy of all personal data you hold about me, including:
- All information collected directly from me
- Information collected from third parties
- The purposes for which you process my data
- Categories of recipients with whom you share my data
- The retention period for my data

Please provide this information in a structured, commonly used, and machine-readable format as required by the GDPR.

Requester Name: {requester_name}
Email: {requester_email}
Date: {today}

Regards,
{requester_name}
""",

        'deletion': f"""Dear {company_name},

I am writing to exercise my right to erasure (the right to be forgotten) in accordance with Article 17 of the General Data Protection Regulation (GDPR).

I request that you erase all personal data you hold about me, including any copies held by third parties with whom you have shared my data.

Legal basis for this request: The data is no longer necessary for the purposes it was collected.

Requester Name: {requester_name}
Email: {requester_email}
Date: {today}

Regards,
{requester_name}
""",

        'export': f"""Dear {company_name},

I am writing to exercise my right to data portability in accordance with Article 20 of the General Data Protection Regulation (GDPR).

I request that you provide all personal data you hold about me in a structured, commonly used, and machine-readable format.

Please transmit this data directly to me or, if technically feasible, to another controller as designated by me.

Requester Name: {requester_name}
Email: {requester_email}
Date: {today}

Regards,
{requester_name}
""",

        'rectification': f"""Dear {company_name},

I am writing to exercise my right to rectification in accordance with Article 16 of the General Data Protection Regulation (GDPR).

I request that you correct any inaccurate or incomplete personal data you hold about me.

Reason for rectification: {reason if reason else 'The data is inaccurate or incomplete'}

Requester Name: {requester_name}
Email: {requester_email}
Date: {today}

Regards,
{requester_name}
""",

        'objection': f"""Dear {company_name},

I am writing to exercise my right to object to the processing of my personal data in accordance with Article 21 of the General Data Protection Regulation (GDPR).

I object to the processing of my personal data for the following purposes:
- Marketing communications
- Profiling or automated decision-making
- Any processing not strictly necessary for contractual obligations

Please cease processing my personal data for these purposes and confirm receipt of this objection.

Requester Name: {requester_name}
Email: {requester_email}
Date: {today}

Regards,
{requester_name}
"""
    }

    return templates.get(request_type, '')
