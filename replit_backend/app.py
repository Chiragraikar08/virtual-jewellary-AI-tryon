from flask import Flask, jsonify, request
from flask_cors import CORS
import datetime
import random

app = Flask(__name__)
# Enable CORS for all domains, so GitHub Pages can access this API
CORS(app)

@app.route('/')
def home():
    return jsonify({
        "status": "success",
        "message": "Welcome to the Vinayaka Jewellers Backend API on Replit!",
        "endpoints": ["/api/gold-rate"]
    })

@app.route('/api/gold-rate', methods=['GET'])
def get_gold_rate():
    # In a real app, you would fetch this from a live gold rate API
    # Since this is a demo, we are generating realistic static/mock data
    return jsonify({
        "rate_22k_per_gram": 6800,
        "rate_24k_per_gram": 7400,
        "usd_to_inr": 83.5,
        "date": datetime.datetime.now().strftime("%Y-%m-%d")
    })

import subprocess

@app.route('/api/start-tryon', methods=['GET'])
def start_tryon():
    try:
        # Launch the local Desktop OpenCV app in a non-blocking way
        subprocess.Popen(['python', 'desktop_tryon.py'])
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
