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
        "message": "Welcome to the Vinayaka Jewellers Backend API on Render!",
        "endpoints": ["/api/gold-rate", "/api/ping"]
    })

@app.route('/api/ping', methods=['GET', 'OPTIONS'])
def ping():
    # Silent wake-up endpoint for Render cold starts
    return jsonify({"status": "ok"}), 200

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

@app.route('/api/start-tryon', methods=['GET', 'OPTIONS'])
def start_tryon():
    # On Render, we cannot run a desktop GUI app (OpenCV cv2.imshow).
    # Return a 200 OK with a helpful message instead of crashing or silently failing.
    return jsonify({
        "status": "info",
        "message": "The system is running on a cloud server (Render). Please use the Browser Try-On option to use your webcam directly in the browser!"
    }), 200

if __name__ == '__main__':
    # host='0.0.0.0' is required for Replit/Render to expose the server to the web!
    app.run(host='0.0.0.0', port=5000, debug=True)
