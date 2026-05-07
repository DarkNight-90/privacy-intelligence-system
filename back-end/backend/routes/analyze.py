from flask import Blueprint, request, jsonify
from utils.nlp_analyzer import analyze_privacy_policy

analyze_bp = Blueprint('analyze', __name__, url_prefix='/api')

@analyze_bp.route('/analyze-policy', methods=['POST'])
def analyze_policy():
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        policy_text = data.get('policy_text', '').strip()
        if not policy_text:
            return jsonify({'error': 'policy_text is required'}), 400

        if len(policy_text) > 100000:
            return jsonify({'error': 'policy_text exceeds maximum length'}), 400

        analysis = analyze_privacy_policy(policy_text)

        return jsonify({
            'status': 'success',
            'analysis': analysis
        }), 200

    except Exception as e:
        return jsonify({'error': 'Analysis failed', 'message': str(e)}), 500
