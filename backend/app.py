"""
backend/app.py — Flask AI Engine
Personal Data Privacy Manager

Stateless REST API:
  GET  /health
  POST /analyze-policy
  POST /generate-gdpr-request
"""

from flask import Flask
from flask_cors import CORS
from routes.analyze import analyze_bp

def create_app():
    app = Flask(__name__)
    CORS(app, origins=["*"])  # local-only; extension fetches from localhost

    # Register blueprints
    app.register_blueprint(analyze_bp)

    @app.errorhandler(400)
    def bad_request(e):
        return {"error": str(e.description)}, 400

    @app.errorhandler(500)
    def server_error(e):
        return {"error": "Internal server error"}, 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
