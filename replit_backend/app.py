from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import datetime
import random
import os
import glob

app = Flask(__name__)
# Enable CORS for all domains, so GitHub Pages can access this API
CORS(app)

# ── Path to static/models (relative to the project root, not replit_backend) ──
# When running from replit_backend/, models are one level up at ../static/models/
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'models')

@app.route('/')
def home():
    return jsonify({
        "status": "success",
        "message": "Welcome to the Vinayaka Jewellers Backend API on Render!",
        "endpoints": ["/api/gold-rate", "/api/ping", "/api/get_models"]
    })

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
            # Prettify filename → display name:  "diamond_ring.glb" → "Diamond Ring"
            name = os.path.splitext(filename)[0]
            name = name.replace('_', ' ').replace('-', ' ').replace('(', ' ').replace(')', ' ')
            # Collapse multiple spaces and title-case
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
    # Silent wake-up endpoint for Render cold starts
    return jsonify({"status": "ok"}), 200

@app.route('/api/gold-rate', methods=['GET'])
def get_gold_rate():
    # In a real app, you would fetch this from a live gold rate API
    # Since this is a demo, we are generating realistic static/mock data
    return jsonify({
        "rate_22k_per_gram": 14000,
        "rate_24k_per_gram": 15200,
        "usd_to_inr": 83.5,
        "date": datetime.datetime.now().strftime("%Y-%m-%d")
    })

import subprocess
import os

@app.route('/api/start-tryon', methods=['GET'])
def start_tryon():
    try:
        # Launch the local Desktop OpenCV app safely
        script_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(script_dir, 'desktop_tryon.py')
        
        # We explicitly set cwd to script_dir so it finds models/assets relative to itself
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

if __name__ == '__main__':
    # host='0.0.0.0' is required for Replit/Render to expose the server to the web!
    app.run(host='0.0.0.0', port=5000, debug=True)
