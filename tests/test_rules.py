import pytest
import json
import os


def load_json_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


class TestTrackerRules:
    def test_tracker_rules_valid_json(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'tracker-rules.json')
        data = load_json_file(path)
        assert isinstance(data, dict)
        assert 'version' in data
        assert 'trackers' in data

    def test_tracker_rules_no_duplicates(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'tracker-rules.json')
        data = load_json_file(path)
        ids = [tracker['id'] for tracker in data['trackers']]
        assert len(ids) == len(set(ids)), "Duplicate tracker IDs found"

    def test_tracker_rules_required_fields(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'tracker-rules.json')
        data = load_json_file(path)
        required_fields = ['id', 'name', 'category', 'domain', 'risk_level', 'signatures']
        for tracker in data['trackers']:
            for field in required_fields:
                assert field in tracker, f"Missing {field} in tracker {tracker.get('id')}"

    def test_tracker_rules_valid_risk_levels(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'tracker-rules.json')
        data = load_json_file(path)
        valid_levels = ['low', 'medium', 'high', 'critical']
        for tracker in data['trackers']:
            assert tracker['risk_level'] in valid_levels


class TestCookieCategories:
    def test_cookie_categories_valid_json(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'cookie-categories.json')
        data = load_json_file(path)
        assert isinstance(data, dict)
        assert 'version' in data
        assert 'categories' in data

    def test_cookie_categories_no_duplicates(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'cookie-categories.json')
        data = load_json_file(path)
        ids = [cat['id'] for cat in data['categories']]
        assert len(ids) == len(set(ids)), "Duplicate category IDs found"

    def test_cookie_categories_required_fields(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'cookie-categories.json')
        data = load_json_file(path)
        required_fields = ['id', 'name', 'description', 'required', 'retention_days']
        for category in data['categories']:
            for field in required_fields:
                assert field in category, f"Missing {field} in category {category.get('id')}"


class TestDNRRules:
    def test_dnr_rules_valid_json(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'dnr_rules.json')
        data = load_json_file(path)
        assert isinstance(data, dict)
        assert 'version' in data
        assert 'rules' in data

    def test_dnr_rules_no_duplicates(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'dnr_rules.json')
        data = load_json_file(path)
        ids = [rule['id'] for rule in data['rules']]
        assert len(ids) == len(set(ids)), "Duplicate rule IDs found"

    def test_dnr_rules_required_fields(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'extension', 'rules', 'dnr_rules.json')
        data = load_json_file(path)
        for rule in data['rules']:
            assert 'id' in rule
            assert 'priority' in rule
            assert 'action' in rule
            assert 'condition' in rule
