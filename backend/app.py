from flask import Flask, jsonify, send_from_directory, session, request, redirect, render_template  # type: ignore # pyright: ignore
import os, json, time, urllib.request  # type: ignore # pyright: ignore
import razorpay

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = "super_secret_jewelry_key"
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

client = razorpay.Client(auth=("rzp_test_YourKeyHere123", "YourSecretHere456"))
users = {}  # In-memory database (to be replaced with SQLite/MySQL later)

# ── Simple file-based daily cache ─────────────────────────────
CACHE_FILE = os.path.join(os.path.dirname(__file__), '.gold_rate_cache.json')

def _cache_is_fresh():
    if not os.path.exists(CACHE_FILE):
        return False
    try:
        with open(CACHE_FILE) as f:
            data = json.load(f)
        # Fresh if cached today (IST date string)
        return data.get('date') == _today()
    except Exception:
        return False

def _today():
    from datetime import datetime, timezone, timedelta
    ist = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist).strftime('%Y-%m-%d')

def _read_cache():
    with open(CACHE_FILE) as f:
        return json.load(f)

def _write_cache(data):
    with open(CACHE_FILE, 'w') as f:
        json.dump(data, f)

def _fetch_gold_rate():
    """Hardcoded exactly to the Ambicaa Sales Corpn screenshot."""
    # Gold spot from screenshot
    gold_usd_oz = 4889.59
    
    # 24K (999) rate from screenshot: 157,134 per 10 grams
    rate_24k_10g = 157134
    gold_inr_per_gram_24k = 15713.4
    
    # Deriving 22K (916) rate similarly
    gold_inr_per_gram_22k = gold_inr_per_gram_24k * 0.9167 * 1.03  # minor premium + gst
    rate_22k_10g = int(gold_inr_per_gram_22k * 10)

    # Implied USD-to-INR
    usd_inr = (gold_inr_per_gram_24k * 31.1035) / gold_usd_oz

    return {
        'date': _today(),
        'usd_inr': round(float(usd_inr), 2),  # type: ignore
        'gold_usd_oz': round(float(gold_usd_oz), 2),  # type: ignore
        'rate_24k_per_gram': round(float(gold_inr_per_gram_24k), 2),  # type: ignore
        'rate_22k_per_gram': round(float(gold_inr_per_gram_22k), 2),  # type: ignore
        'rate_24k_per_10g': rate_24k_10g,
        'rate_22k_per_10g': rate_22k_10g,
        'usd_to_inr': round(float(usd_inr), 2),  # type: ignore
    }

# ── Routes ─────────────────────────────────────────────────────

tryon_process = None

@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route("/api/start-tryon")
@app.route("/start_tryon")
def start_tryon():
    global tryon_process
    import subprocess
    try:
        # Check if already running
        if tryon_process is not None and tryon_process.poll() is None:
            return jsonify({"status": "already_running", "message": "AI Try-On is already running."})

        # Launch main.py as a separate process using 'python' directly, as requested
        script_path = os.path.join(os.path.dirname(__file__), 'main.py')
        tryon_process = subprocess.Popen(['python', script_path])
        return jsonify({"status": "launched", "message": "AI Try-On camera opening..."})
    except Exception as e:
        return jsonify({"error": "Camera or process failed to start", "details": str(e)}), 500

@app.route("/api/products")
@app.route("/products")
def get_products():
    js_path = os.path.join(FRONTEND_DIR, 'jewelry-data.js')
    if not os.path.exists(js_path):
        return jsonify([])
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    # Find the start of the array
    try:
        start_idx = int(content.find('['))
        end_idx = int(content.rfind(']') + 1)
        json_str = content[start_idx:end_idx]  # type: ignore
        # Remove comments and trailing commas for valid JSON
        import re
        json_str = re.sub(r'//.*', '', json_str)
        json_str = re.sub(r',(\s*[\]}])', r'\1', json_str)
        # Fix property names (wrap in quotes if not)
        json_str = re.sub(r'(\b\w+\b):', r'"\1":', json_str)
        data = json.loads(json_str)
        return jsonify(data)
    except Exception:
        return jsonify([])

@app.route("/api/gold-rate")
@app.route("/api/gold_rate")
def get_gold_rate():
    if _cache_is_fresh():
        return jsonify(_read_cache())
    
    data = _fetch_gold_rate()
    _write_cache(data)
    return jsonify(data)

@app.route("/api/models")
def get_models():
    model_dir = os.path.join(app.static_folder, "models")
    files = [f.replace(".glb", "") for f in os.listdir(model_dir) if f.endswith(".glb")]
    return jsonify(files)

# ── E-Commerce Routes ──────────────────────────────────────────

@app.route("/register", methods=["POST"])
def register():
    email = request.form.get("email")
    password = request.form.get("password")
    if email and password:
        users[email] = password
    return redirect("/")

@app.route("/login", methods=["POST"])
def login():
    email = request.form.get("email")
    password = request.form.get("password")
    if users.get(email) == password:
        session["user"] = email
        return redirect("/")
    return redirect("/?error=1")

@app.route("/api/user")
def current_user():
    return jsonify({"user": session.get("user")})

@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect("/")

@app.route("/checkout")
def checkout():
    if "user" not in session:
        return redirect("/") # Redirecting to home since login is an overlay
    return render_template("checkout.html")

@app.route("/create_order", methods=["POST"])
def create_order():
    data = request.json
    order = client.order.create({
        "amount": int(data["amount"]) * 100, # Razorpay expects amount in paise
        "currency": "INR"
    })
    return jsonify(order)

@app.route("/<path:filename>")
def frontend_files(filename):
    root_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(root_path):
        return send_from_directory(FRONTEND_DIR, filename)
    return send_from_directory(app.static_folder, filename)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
