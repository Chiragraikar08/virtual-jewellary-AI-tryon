from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import datetime
import random
import os
import glob
import subprocess
import database

app = Flask(__name__)
# Enable CORS for all domains, so web clients and GitHub Pages can access this API
CORS(app)

# Initialize SQLite database on module import
database.init_db()

# ── Path to static/models (relative to project root) ──
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'models')

@app.route('/')
def home():
    return jsonify({
        "status": "success",
        "message": "Welcome to the Vinayaka Jewellers Backend API with SQLite Database!",
        "database": "SQLite (jewelry.db)",
        "endpoints": [
            "/api/catalog (GET, POST)",
            "/api/catalog/<id> (GET, PUT, DELETE)",
            "/api/gold-rate (GET, POST)",
            "/api/ping",
            "/api/get_models"
        ]
    })

# ── REST API: Jewelry Catalog (SQLite Powered) ────────────────────────────────
@app.route('/api/catalog', methods=['GET'])
def get_catalog():
    """Retrieve all jewelry items from SQLite database with optional filters."""
    category = request.args.get('category')
    is_3d = request.args.get('is_3d')
    is_2d = request.args.get('is_2d')

    is_3d_bool = None
    if is_3d is not None:
        is_3d_bool = is_3d.lower() in ['1', 'true', 'yes']

    is_2d_bool = None
    if is_2d is not None:
        is_2d_bool = is_2d.lower() in ['1', 'true', 'yes']

    items = database.get_all_jewelry(category=category, is_3d=is_3d_bool, is_2d=is_2d_bool)
    return jsonify({
        "status": "success",
        "count": len(items),
        "items": items
    })

@app.route('/api/catalog/<item_id>', methods=['GET'])
def get_catalog_item(item_id):
    """Retrieve a single jewelry item from SQLite database by ID."""
    item = database.get_jewelry_by_id(item_id)
    if not item:
        return jsonify({"status": "error", "message": f"Item '{item_id}' not found"}), 404
    return jsonify({
        "status": "success",
        "item": item
    })

@app.route('/api/catalog', methods=['POST'])
def add_catalog_item():
    """Insert a new jewelry item into SQLite database."""
    data = request.get_json()
    if not data or not data.get('id') or not data.get('name') or not data.get('category'):
        return jsonify({"status": "error", "message": "Missing required fields: id, name, category"}), 400

    existing = database.get_jewelry_by_id(data['id'])
    if existing:
        return jsonify({"status": "error", "message": f"Item '{data['id']}' already exists"}), 409

    try:
        new_item = database.create_jewelry(data)
        return jsonify({
            "status": "success",
            "message": f"Item '{data['name']}' created successfully",
            "item": new_item
        }), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/catalog/<item_id>', methods=['PUT'])
def update_catalog_item(item_id):
    """Update fields of an existing jewelry item in SQLite database."""
    existing = database.get_jewelry_by_id(item_id)
    if not existing:
        return jsonify({"status": "error", "message": f"Item '{item_id}' not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "No update data provided"}), 400

    try:
        updated = database.update_jewelry(item_id, data)
        return jsonify({
            "status": "success",
            "message": f"Item '{item_id}' updated successfully",
            "item": updated
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/catalog/<item_id>', methods=['DELETE'])
def delete_catalog_item(item_id):
    """Delete a jewelry item from SQLite database."""
    existing = database.get_jewelry_by_id(item_id)
    if not existing:
        return jsonify({"status": "error", "message": f"Item '{item_id}' not found"}), 404

    try:
        database.delete_jewelry(item_id)
        return jsonify({
            "status": "success",
            "message": f"Item '{item_id}' deleted successfully"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ── Dynamic GLB Model Scanner ────────────────────────────────────────────────
@app.route('/get_models', methods=['GET'])
@app.route('/api/get_models', methods=['GET'])
def get_models():
    """Scan static/models/ folder and return all .glb files with name + path."""
    try:
        models_path = os.path.normpath(MODELS_DIR)
        if not os.path.isdir(models_path):
            return jsonify({"status": "error", "message": "Models directory not found", "models": []}), 404

        glb_files = sorted([
            f for f in os.listdir(models_path)
            if f.lower().endswith('.glb')
        ])

        models = []
        for filename in glb_files:
            name = os.path.splitext(filename)[0]
            name = name.replace('_', ' ').replace('-', ' ').replace('(', ' ').replace(')', ' ')
            name = ' '.join(name.split()).title()
            file_size = os.path.getsize(os.path.join(models_path, filename))

            models.append({
                "name": name,
                "filename": filename,
                "path": f"static/models/{filename}",
                "size_bytes": file_size,
            })

        return jsonify({
            "status": "success",
            "count": len(models),
            "models": models,
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e), "models": []}), 500

@app.route('/api/ping', methods=['GET', 'OPTIONS'])
def ping():
    """Silent wake-up endpoint for backend cold starts."""
    return jsonify({
        "status": "ok",
        "database": "connected",
        "timestamp": datetime.datetime.now().isoformat()
    }), 200

@app.route('/api/gold-rate', methods=['GET', 'POST'])
def handle_gold_rate():
    """Get latest gold rate from SQLite, or update rates via POST."""
    if request.method == 'POST':
        data = request.get_json() or {}
        rate_22k = float(data.get('rate_22k_per_gram', 14000.0))
        rate_24k = float(data.get('rate_24k_per_gram', 15200.0))
        usd_inr = float(data.get('usd_to_inr', 83.5))
        date_str = data.get('date', datetime.date.today().isoformat())
        database.set_gold_rate(rate_22k, rate_24k, usd_inr, date_str)
        return jsonify({
            "status": "success",
            "message": "Gold rate recorded in SQLite database",
            "data": {
                "rate_22k_per_gram": rate_22k,
                "rate_24k_per_gram": rate_24k,
                "usd_to_inr": usd_inr,
                "date": date_str
            }
        })

    rate = database.get_latest_gold_rate()
    if not rate:
        rate = {
            "rate_22k_per_gram": 14000,
            "rate_24k_per_gram": 15200,
            "usd_to_inr": 83.5,
            "date": datetime.date.today().isoformat()
        }
    return jsonify(rate)

@app.route('/api/start-tryon', methods=['GET'])
def start_tryon():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(script_dir, 'desktop_tryon.py')
        subprocess.Popen(['python', script_path], cwd=script_dir)
        return jsonify({
            "status": "success",
            "message": "Desktop AI Try-On launched successfully! Please check your taskbar for the new window."
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to launch desktop try-on: {str(e)}"
        }), 500

# ── User Authentication REST API (SQLite Backed) ──────────────
@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user account in SQLite database."""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()

    if not name or not email or not password:
        return jsonify({"status": "error", "message": "Full Name, Email, and Password are all required."}), 400

    if len(password) < 4:
        return jsonify({"status": "error", "message": "Password must be at least 4 characters long."}), 400

    user, err = database.create_user(name, email, password)
    if err:
        return jsonify({"status": "error", "message": err}), 409

    return jsonify({
        "status": "success",
        "message": f"Welcome to Vinayaka Jewellers, {user['name']}!",
        "user": user
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate user with email and password from SQLite database."""
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return jsonify({"status": "error", "message": "Email and Password are required."}), 400

    user, err = database.authenticate_user(email, password)
    if err:
        return jsonify({"status": "error", "message": err}), 401

    return jsonify({
        "status": "success",
        "message": f"Welcome back, {user['name']}!",
        "user": user
    })

@app.route('/api/auth/profile/<int:user_id>', methods=['GET'])
def get_profile(user_id):
    """Retrieve user profile by ID."""
    user = database.get_user_by_id(user_id)
    if not user:
        return jsonify({"status": "error", "message": "User not found."}), 404
    return jsonify({
        "status": "success",
        "user": user
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
