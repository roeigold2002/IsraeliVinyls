#!/usr/bin/env python3
"""
WSGI entry point - explicitly uses the correct app.py from project root
"""
import sys
import os

# Force using the project root app.py, not the bundled dist version
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

# Now import the correct app
from app import app

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False, threaded=True)
