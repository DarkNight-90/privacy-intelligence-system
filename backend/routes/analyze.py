"""
backend/routes/analyze.py
Flask Blueprint: privacy analysis and GDPR generation routes.
All handlers are stateless — no session, no DB.
"""

from flask import Blueprint, request, jsonify, abort
from utils.nlp_analyzer import analyze_policy
from utils.gdpr_generator import generate_request

analyze_bp = Blueprint("analyze", __name__)


# ── Health ────────────────────────────────────────────────────────────────────

@analyze_bp.get("/health")
def health():
    return jsonify({"status": "ok", "service": "Privacy Manager Backend"})


# ── Policy Analysis ───────────────────────────────────────────────────────────

@analyze_bp.post("/analyze-policy")
def analyze_policy_route():
    if not request.is_json:
        abort(400, "Content-Type must be application/json.")

    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()

    if not text:
        abort(400, "Field 'text' is required and must not be empty.")

    if len(text) > 200_000:
        abort(400, "Policy text exceeds maximum length of 200,000 characters.")

    try:
        result = analyze_policy(text)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500


# ── GDPR Request Generation ───────────────────────────────────────────────────

@analyze_bp.post("/generate-gdpr-request")
def generate_gdpr_request_route():
    if not request.is_json:
        abort(400, "Content-Type must be application/json.")

    body = request.get_json(silent=True) or {}

    company      = (body.get("company")      or "").strip()
    email        = (body.get("email")        or "").strip()
    request_type = (body.get("type")         or "").strip().lower()
    user_name    = (body.get("name")         or "The Data Subject").strip()
    extra        = (body.get("additional_info") or "").strip()

    if not company:
        abort(400, "Field 'company' is required.")
    if not email:
        abort(400, "Field 'email' is required.")
    if request_type not in ("access", "deletion", "export"):
        abort(400, "Field 'type' must be one of: access, deletion, export.")

    try:
        result = generate_request(company, email, request_type, user_name, extra)
        return jsonify(result)
    except ValueError as e:
        abort(400, str(e))
    except Exception as e:
        return jsonify({"error": f"Generation failed: {str(e)}"}), 500
