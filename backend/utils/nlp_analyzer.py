"""
backend/utils/nlp_analyzer.py
Lightweight, stateless privacy policy NLP analyzer.
Uses regex heuristics + textstat readability. No heavy ML models.
"""

import re

try:
    import textstat
    _TEXTSTAT = True
except ImportError:
    _TEXTSTAT = False

# ── Red flags (pattern, label, weight 1-30) ──────────────────────────────────
_RED_FLAGS = [
    (r"\bsell\b.{0,30}\bdata\b|\bdata\b.{0,30}\bsold\b",          "Data may be sold to third parties",              30),
    (r"\bdata broker",                                              "Data brokers mentioned",                         25),
    (r"\bindefinitely\b",                                          "Data retained indefinitely",                     25),
    (r"\bforever\b|\bpermanently retain",                          "Permanent data retention",                       22),
    (r"\bwithout.{0,15}consent\b",                                 "Processing without explicit consent",            20),
    (r"\bbiometric\b",                                             "Biometric data collected",                       20),
    (r"\bfingerprint(ing)?\b",                                     "Browser fingerprinting detected",                20),
    (r"\bshare\b.{0,40}\bthird.part",                              "Data shared with third parties",                 18),
    (r"\badvertis\w+.{0,40}\bpartner",                             "Data shared with advertising partners",          18),
    (r"\bfacial recognition\b",                                    "Facial recognition used",                        22),
    (r"\blocation\b.{0,20}\b(track|collect|monitor)",              "Location tracking",                              15),
    (r"\bhealth (data|information)\b",                             "Health data collected",                          18),
    (r"\bbehavioral (track|target|profil)",                        "Behavioral tracking/profiling",                  15),
    (r"\bcross.site tracking\b",                                   "Cross-site tracking",                            18),
    (r"\bwe may (collect|share|use|disclose)\b",                   "Vague data usage language",                       8),
    (r"\bat our (sole )?discretion\b",                             "Discretionary data use",                         12),
    (r"\bsubject to change without notice\b",                      "Policy may change without notice",               10),
    (r"\blaw enforcement\b.{0,40}\bshare\b|\bshare\b.{0,40}\blaw enforcement\b",
                                                                   "Data shared with law enforcement",               12),
]

# ── Positive signals (reduce score; weights are negative) ────────────────────
_POSITIVE = [
    (r"\bright to (access|erase|delete|erasure|portab)",           "User rights (GDPR) mentioned",                  -10),
    (r"\bdo not sell\b",                                           "Explicit no-sell policy",                       -15),
    (r"\bopt.out at any time\b",                                   "Easy opt-out",                                   -8),
    (r"\bencrypt(ed|ion)\b",                                       "Encryption mentioned",                           -5),
    (r"\bGDPR\b|\bCCPA\b|\bHIPAA\b",                               "Regulatory compliance",                          -8),
    (r"\bdata minimization\b",                                     "Data minimization principle",                    -8),
    (r"\bprivacy by design\b",                                     "Privacy by design",                              -7),
    (r"\bdelete.{0,30}(30|60|90) days\b",                          "Clear deletion timeframe",                       -6),
]

# ── Key data terms ────────────────────────────────────────────────────────────
_KEY_TERMS = [
    (r"\bpersonal (data|information)\b",  "Personal data"),
    (r"\bcookies?\b",                     "Cookies"),
    (r"\blocation (data|services?)\b",    "Location data"),
    (r"\bemail address(es)?\b",           "Email addresses"),
    (r"\bIP address(es)?\b",              "IP addresses"),
    (r"\bdevice (data|information)\b",    "Device information"),
    (r"\bbrowsing (history|behavior)\b",  "Browsing history"),
    (r"\badvertis\w+\b",                  "Advertising"),
    (r"\banalytics\b",                    "Analytics"),
    (r"\bpayment (data|information)\b",   "Payment data"),
    (r"\bsocial media\b",                 "Social media data"),
    (r"\bbiometric\b",                    "Biometric data"),
    (r"\bfingerprint",                    "Fingerprinting"),
]


def analyze_policy(text: str) -> dict:
    """Analyze privacy policy text. Returns full risk assessment dict."""
    if not text or not text.strip():
        return _empty_result("No text provided.")

    text_lower = text.lower()
    words = text.split()
    word_count = len(words)

    # Score from red flags
    raw_score = 0
    found_flags = []
    for pattern, label, weight in _RED_FLAGS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            raw_score += weight
            found_flags.append({"label": label, "severity": _severity(weight)})

    # Positive offsets
    for pattern, label, weight in _POSITIVE:
        if re.search(pattern, text_lower, re.IGNORECASE):
            raw_score += weight  # weight is negative

    # Readability complexity bump
    readability = _readability(text, word_count)
    if readability["score"] < 30 and word_count > 2000:
        raw_score += 5

    risk_score = max(0, min(100, raw_score))

    # Key terms
    key_terms = [
        label for pattern, label in _KEY_TERMS
        if re.search(pattern, text_lower, re.IGNORECASE)
    ]

    # Classification
    if risk_score <= 30:
        classification = "safe"
    elif risk_score <= 60:
        classification = "medium"
    else:
        classification = "dangerous"

    return {
        "risk_score":      risk_score,
        "classification":  classification,
        "red_flags":       found_flags,
        "key_terms":       key_terms,
        "readability":     readability,
        "word_count":      word_count,
        "summary":         _summary(risk_score, classification, found_flags, key_terms, word_count),
        "recommendations": _recommendations(found_flags, classification),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _severity(weight: int) -> str:
    if weight >= 25: return "critical"
    if weight >= 18: return "high"
    if weight >= 12: return "medium"
    return "low"


def _readability(text: str, word_count: int) -> dict:
    if not _TEXTSTAT or word_count < 50:
        return {"score": 50, "grade": "N/A", "label": "Unknown"}
    try:
        score = textstat.flesch_reading_ease(text)
        grade = textstat.text_standard(text, float_output=False)
        label = ("Easy" if score >= 70 else
                 "Moderate" if score >= 50 else
                 "Difficult" if score >= 30 else "Very Difficult")
        return {"score": round(score, 1), "grade": grade, "label": label}
    except Exception:
        return {"score": 50, "grade": "N/A", "label": "Unknown"}


def _summary(risk_score, cls, flags, terms, wc) -> str:
    intros = {"safe": "appears relatively privacy-friendly",
              "medium": "has moderate privacy risks",
              "dangerous": "has significant privacy risks"}
    s = f"This policy {intros[cls]} (risk score: {risk_score}/100). "
    s += f"{len(flags)} red flag{'s' if len(flags) != 1 else ''} detected"
    if terms:
        s += f"; covers {', '.join(terms[:3])}"
    s += f". Policy length: {wc} words."
    return s


def _recommendations(flags, cls) -> list:
    labels = {f["label"] for f in flags}
    recs = []
    if "Data may be sold to third parties" in labels:
        recs.append("Look for an opt-out from data selling (required under CCPA).")
    if "Data retained indefinitely" in labels or "Permanent data retention" in labels:
        recs.append("Exercise your right to erasure under GDPR Article 17.")
    if "Location tracking" in labels:
        recs.append("Disable location permissions for this service if possible.")
    if "Biometric data collected" in labels:
        recs.append("Biometric data is irreversible — exercise extreme caution.")
    if "Browser fingerprinting detected" in labels:
        recs.append("Use a fingerprinting-blocking extension on this site.")
    if "Behavioral tracking/profiling" in labels:
        recs.append("Request your behavioral profile under GDPR Article 15.")
    if cls == "dangerous":
        recs.append("Consider sending a GDPR Subject Access Request.")
        recs.append("Minimize use of this service or use a privacy alternative.")
    if not recs:
        recs.append("Review retention periods and opt-out options in the policy.")
        recs.append("Check whether the service allows data portability.")
    return recs[:5]


def _empty_result(msg: str) -> dict:
    return {
        "risk_score": 0, "classification": "safe",
        "red_flags": [], "key_terms": [], "word_count": 0,
        "readability": {"score": 0, "grade": "N/A", "label": "N/A"},
        "summary": msg, "recommendations": [],
    }
