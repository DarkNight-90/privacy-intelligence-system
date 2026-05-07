from flask import Blueprint, request, jsonify
from utils.gdpr_generator import generate_gdpr_letter

gdpr_bp = Blueprint('gdpr', __name__, url_prefix='/api')

@gdpr_bp.route('/generate-gdpr-request', methods=['POST'])
def generate_gdpr_request():
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        request_type = data.get('request_type', '').strip().lower()
        company_name = data.get('company_name', '').strip()
        requester_name = data.get('requester_name', '').strip()
        requester_email = data.get('requester_email', '').strip()
        reason = data.get('reason', '')

        if not request_type:
            return jsonify({'error': 'request_type is required'}), 400
        if request_type not in ['access', 'deletion', 'export', 'rectification', 'objection']:
            return jsonify({'error': f'Invalid request_type: {request_type}'}), 400
        if not company_name:
            return jsonify({'error': 'company_name is required'}), 400
        if not requester_name:
            return jsonify({'error': 'requester_name is required'}), 400
        if not requester_email:
            return jsonify({'error': 'requester_email is required'}), 400

        letter = generate_gdpr_letter(
            request_type=request_type,
            company_name=company_name,
            requester_name=requester_name,
            requester_email=requester_email,
            reason=reason
        )

        return jsonify({
            'status': 'success',
            'letter': letter
        }), 200

    except Exception as e:
        return jsonify({'error': 'GDPR request generation failed', 'message': str(e)}), 500
