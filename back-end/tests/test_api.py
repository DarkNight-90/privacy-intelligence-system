import pytest
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestHealthEndpoint:
    def test_health_success(self, client):
        response = client.get('/health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'healthy'
        assert 'service' in data

    def test_health_json_response(self, client):
        response = client.get('/health')
        assert response.content_type == 'application/json'


class TestAnalyzePolicy:
    def test_analyze_policy_success(self, client):
        payload = {
            'policy_text': 'We collect personal data including name, email, and address. We use cookies for analytics.'
        }
        response = client.post(
            '/api/analyze-policy',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'success'
        assert 'analysis' in data
        assert 'risk_score' in data['analysis']
        assert 'categories_found' in data['analysis']

    def test_analyze_policy_missing_text(self, client):
        payload = {'policy_text': ''}
        response = client.post(
            '/api/analyze-policy',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data

    def test_analyze_policy_no_json(self, client):
        response = client.post('/api/analyze-policy')
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data

    def test_analyze_policy_exceeds_max_length(self, client):
        payload = {'policy_text': 'a' * 100001}
        response = client.post(
            '/api/analyze-policy',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'exceeds maximum' in data['error']

    def test_analyze_policy_detects_categories(self, client):
        payload = {
            'policy_text': 'We collect cookies, third party data, and track retention periods.'
        }
        response = client.post(
            '/api/analyze-policy',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data['analysis']['categories_found']) > 0


class TestGenerateGDPRRequest:
    def test_generate_access_request_success(self, client):
        payload = {
            'request_type': 'access',
            'company_name': 'Acme Corp',
            'requester_name': 'John Doe',
            'requester_email': 'john@example.com'
        }
        response = client.post(
            '/api/generate-gdpr-request',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'success'
        assert 'letter' in data
        assert 'Acme Corp' in data['letter']
        assert 'Article 15' in data['letter']

    def test_generate_deletion_request_success(self, client):
        payload = {
            'request_type': 'deletion',
            'company_name': 'Tech Inc',
            'requester_name': 'Jane Smith',
            'requester_email': 'jane@example.com'
        }
        response = client.post(
            '/api/generate-gdpr-request',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'Article 17' in data['letter']

    def test_generate_export_request_success(self, client):
        payload = {
            'request_type': 'export',
            'company_name': 'Data Services',
            'requester_name': 'Bob Johnson',
            'requester_email': 'bob@example.com'
        }
        response = client.post(
            '/api/generate-gdpr-request',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'Article 20' in data['letter']

    def test_generate_request_missing_type(self, client):
        payload = {
            'company_name': 'Acme Corp',
            'requester_name': 'John Doe',
            'requester_email': 'john@example.com'
        }
        response = client.post(
            '/api/generate-gdpr-request',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_generate_request_invalid_type(self, client):
        payload = {
            'request_type': 'invalid_type',
            'company_name': 'Acme Corp',
            'requester_name': 'John Doe',
            'requester_email': 'john@example.com'
        }
        response = client.post(
            '/api/generate-gdpr-request',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_generate_request_missing_company(self, client):
        payload = {
            'request_type': 'access',
            'requester_name': 'John Doe',
            'requester_email': 'john@example.com'
        }
        response = client.post(
            '/api/generate-gdpr-request',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_generate_request_with_reason(self, client):
        payload = {
            'request_type': 'rectification',
            'company_name': 'Acme Corp',
            'requester_name': 'John Doe',
            'requester_email': 'john@example.com',
            'reason': 'Address is outdated'
        }
        response = client.post(
            '/api/generate-gdpr-request',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'Article 16' in data['letter']
