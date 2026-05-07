import re
from collections import Counter

def analyze_privacy_policy(policy_text):
    """
    Analyze a privacy policy for key privacy concerns and data practices.
    """
    analysis = {
        'risk_score': 0,
        'categories_found': [],
        'keywords_detected': {},
        'sections': []
    }

    text_lower = policy_text.lower()

    # Privacy categories
    categories = {
        'personal_data': ['personal data', 'personal information', 'name', 'email', 'address', 'phone'],
        'tracking': ['cookies', 'tracking', 'pixel', 'beacon', 'analytics', 'analytics cookies'],
        'third_party': ['third party', 'third-party', 'partners', 'advertisers', 'vendors'],
        'retention': ['retention', 'retain', 'delete', 'deletion', 'period', 'duration'],
        'rights': ['right', 'access', 'delete', 'rectification', 'portability', 'objection'],
        'children': ['children', 'minors', 'gdpr', 'coppa', 'age verification'],
        'international': ['international', 'cross-border', 'transfer', 'adequacy', 'standard'],
        'security': ['security', 'encrypted', 'protection', 'secure', 'safeguard']
    }

    for category, keywords in categories.items():
        found = [kw for kw in keywords if kw in text_lower]
        if found:
            analysis['categories_found'].append(category)
            analysis['keywords_detected'][category] = found

    # Risk scoring
    if 'third party' in text_lower or 'third-party' in text_lower:
        analysis['risk_score'] += 2
    if 'sale' in text_lower and 'data' in text_lower:
        analysis['risk_score'] += 3
    if 'retention' not in text_lower and 'delete' not in text_lower:
        analysis['risk_score'] += 2
    if 'security' not in text_lower:
        analysis['risk_score'] += 1

    # Cap risk score
    analysis['risk_score'] = min(analysis['risk_score'], 10)

    # Detect sections
    section_markers = [
        'what information', 'how we use', 'sharing', 'third party',
        'security', 'retention', 'rights', 'contact'
    ]
    for marker in section_markers:
        if marker in text_lower:
            analysis['sections'].append(marker)

    analysis['total_words'] = len(policy_text.split())
    analysis['detected_sections'] = len(set(analysis['sections']))

    return analysis
