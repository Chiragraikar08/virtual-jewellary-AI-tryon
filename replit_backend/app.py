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

@app.route('/api/start-tryon', methods=['GET'])
def start_tryon():
    # EXTREMELY IMPORTANT CONCEPT FOR REPLIT:
    # A cloud server (like Replit) CANNOT access the user's local web camera 
    # using OpenCV's cv2.VideoCapture(0). Replit runs in a data center, 
    # it has no camera attached to it.
    # 
    # Therefore, the "Desktop Try-On" feature that opens a desktop window 
    # with OpenCV will NOT work on Replit or any cloud server.
    # 
    # If users want to use Try-On from a website, they MUST use the 
    # "Enable Browser Camera" feature we built in tryon.js which runs purely in the browser.
    return jsonify({
        "status": "error",
        "message": "Desktop AI Try-On cannot run on a cloud server. Please tell users to use the 'Enable Browser Camera' button on the website!"
    }), 400

if __name__ == '__main__':
    # host='0.0.0.0' is required for Replit/Render to expose the server to the web!
    app.run(host='0.0.0.0', port=5000, debug=True)
