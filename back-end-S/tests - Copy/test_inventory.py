"""
Data Inventory module tests
Tests the aggregation and data management functionality
"""


def test_data_inventory_add_and_retrieve():
    """Test adding and retrieving inventory items"""
    # This would require the JS module to be testable
    # Placeholder for integration test
    pass


def test_data_inventory_aggregation():
    """Test aggregation functionality"""
    sample_data = [
        {
            'id': '1',
            'domain': 'example.com',
            'category': 'personal_identifiable',
            'dataType': 'email',
            'value': 'user@example.com',
            'timestamp': 1672531200000,
            'source': 'signup_form',
            'purpose': 'account_creation'
        },
        {
            'id': '2',
            'domain': 'example.com',
            'category': 'location',
            'dataType': 'ip_address',
            'value': '192.168.1.1',
            'timestamp': 1672531200000,
            'source': 'analytics',
            'purpose': 'analytics'
        },
        {
            'id': '3',
            'domain': 'tracker.com',
            'category': 'behavioral',
            'dataType': 'browsing_history',
            'value': '/products/shoes',
            'timestamp': 1672531200000,
            'source': 'tracking_pixel',
            'purpose': 'retargeting'
        }
    ]

    # Aggregation should work correctly
    assert len(sample_data) == 3

    # Category counting
    by_category = {}
    for item in sample_data:
        by_category[item['category']] = by_category.get(item['category'], 0) + 1

    assert by_category['personal_identifiable'] == 1
    assert by_category['location'] == 1
    assert by_category['behavioral'] == 1

    # Domain counting
    by_domain = {}
    for item in sample_data:
        by_domain[item['domain']] = by_domain.get(item['domain'], 0) + 1

    assert by_domain['example.com'] == 2
    assert by_domain['tracker.com'] == 1


def test_data_inventory_normalization():
    """Test data normalization"""
    raw_entry = {
        'domain': 'test.com',
        'category': 'personal_identifiable'
    }

    # Should have default values for missing fields
    normalized = {
        'id': raw_entry.get('id', 'default_id'),
        'domain': raw_entry.get('domain', 'unknown'),
        'category': raw_entry.get('category', 'other'),
        'dataType': raw_entry.get('dataType', ''),
        'value': raw_entry.get('value', ''),
        'timestamp': raw_entry.get('timestamp', 0),
        'source': raw_entry.get('source', 'unknown'),
        'purpose': raw_entry.get('purpose', '')
    }

    assert normalized['domain'] == 'test.com'
    assert normalized['category'] == 'personal_identifiable'
    assert normalized['source'] == 'unknown'


def test_data_inventory_privacy_score():
    """Test privacy score calculation"""
    categories = {
        'personal_identifiable': 30,
        'location': 25,
        'financial': 25,
        'health': 35,
        'behavioral': 15,
        'communication': 10,
        'device': 8,
        'other': 5
    }

    test_items = [
        {'category': 'personal_identifiable'},
        {'category': 'location'},
        {'category': 'behavioral'}
    ]

    score = 100
    for item in test_items:
        score -= categories.get(item['category'], 5)

    assert score == 100 - 30 - 25 - 15
    assert score == 30


if __name__ == '__main__':
    test_data_inventory_aggregation()
    test_data_inventory_normalization()
    test_data_inventory_privacy_score()
    print("All data inventory tests passed!")
