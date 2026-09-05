# database.py — SQLite Database Layer for Vinayaka Virtual Jewelry Platform
import sqlite3
import json
import os
import datetime
import hashlib

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jewelry.db')
INITIAL_DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'initial_catalog.json')

def get_db_connection():
    """Establish connection to SQLite database with Row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables and seed initial curated jewelry items if empty."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Create jewelry_items table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS jewelry_items (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            type TEXT NOT NULL,
            glbFile TEXT,
            image TEXT,
            is3D INTEGER DEFAULT 0,
            is2DCatalog INTEGER DEFAULT 0,
            color TEXT,
            gemColor TEXT,
            metalness REAL DEFAULT 0.9,
            roughness REAL DEFAULT 0.1,
            price TEXT,
            rating REAL DEFAULT 5.0,
            ratingCount INTEGER DEFAULT 0,
            material TEXT,
            description TEXT,
            tags TEXT,
            weight REAL,
            touch REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 2. Create gold_rates table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS gold_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rate_22k_per_gram REAL NOT NULL,
            rate_24k_per_gram REAL NOT NULL,
            usd_to_inr REAL NOT NULL,
            date TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 3. Create users table for authentication
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 4. Create indexes for fast lookup
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_jewelry_category ON jewelry_items(category)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_jewelry_3d ON jewelry_items(is3D)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_jewelry_2d ON jewelry_items(is2DCatalog)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_email ON users(email)')

    # Check if jewelry_items is empty, seed with initial catalog
    cursor.execute('SELECT COUNT(*) AS cnt FROM jewelry_items')
    count = cursor.fetchone()['cnt']
    if count == 0 and os.path.exists(INITIAL_DATA_PATH):
        try:
            with open(INITIAL_DATA_PATH, 'r', encoding='utf-8') as f:
                items = json.load(f)
            
            for item in items:
                cursor.execute('''
                    INSERT INTO jewelry_items (
                        id, name, category, type, glbFile, image,
                        is3D, is2DCatalog, color, gemColor, metalness, roughness,
                        price, rating, ratingCount, material, description, tags,
                        weight, touch
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    item.get('id'),
                    item.get('name'),
                    item.get('category'),
                    item.get('type'),
                    item.get('glbFile'),
                    item.get('image'),
                    1 if item.get('is3D') else 0,
                    1 if item.get('is2DCatalog') else 0,
                    item.get('color'),
                    item.get('gemColor'),
                    item.get('metalness', 0.9),
                    item.get('roughness', 0.1),
                    item.get('price'),
                    item.get('rating', 5.0),
                    item.get('ratingCount', 0),
                    item.get('material'),
                    item.get('description'),
                    json.dumps(item.get('tags', [])),
                    item.get('weight'),
                    item.get('touch')
                ))
            conn.commit()
            print(f"[Database] Successfully initialized and seeded {len(items)} items into SQLite.")
        except Exception as e:
            print(f"[Database] Error seeding initial catalog: {e}")

    # Check if gold_rates is empty
    cursor.execute('SELECT COUNT(*) AS cnt FROM gold_rates')
    if cursor.fetchone()['cnt'] == 0:
        cursor.execute('''
            INSERT INTO gold_rates (rate_22k_per_gram, rate_24k_per_gram, usd_to_inr, date)
            VALUES (?, ?, ?, ?)
        ''', (14000.0, 15200.0, 83.5, datetime.date.today().isoformat()))
        conn.commit()

    conn.close()

def row_to_dict(row):
    """Convert an SQLite Row into a frontend-compatible jewelry dictionary."""
    if not row:
        return None
    d = dict(row)
    # Convert integer flags to booleans
    d['is3D'] = bool(d.get('is3D'))
    d['is2DCatalog'] = bool(d.get('is2DCatalog'))
    # Parse tags JSON string
    if d.get('tags'):
        try:
            d['tags'] = json.loads(d['tags'])
        except Exception:
            d['tags'] = []
    else:
        d['tags'] = []
    return d

def get_all_jewelry(category=None, is_3d=None, is_2d=None):
    """Fetch all jewelry items with optional category, 3D, and 2D filters."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM jewelry_items WHERE 1=1'
    params = []

    if category and category != 'all':
        query += ' AND category = ?'
        params.append(category)

    if is_3d is not None:
        query += ' AND is3D = ?'
        params.append(1 if is_3d else 0)

    if is_2d is not None:
        query += ' AND is2DCatalog = ?'
        params.append(1 if is_2d else 0)

    query += ' ORDER BY rowid ASC'
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]

def get_jewelry_by_id(item_id):
    """Fetch a single jewelry item by its unique ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM jewelry_items WHERE id = ?', (item_id,))
    row = cursor.fetchone()
    conn.close()
    return row_to_dict(row)

def create_jewelry(item):
    """Insert a new jewelry item into SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO jewelry_items (
            id, name, category, type, glbFile, image,
            is3D, is2DCatalog, color, gemColor, metalness, roughness,
            price, rating, ratingCount, material, description, tags,
            weight, touch
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        item.get('id'),
        item.get('name'),
        item.get('category'),
        item.get('type', 'ring'),
        item.get('glbFile'),
        item.get('image', ''),
        1 if item.get('is3D') else 0,
        1 if item.get('is2DCatalog') else 0,
        item.get('color', '#d4a847'),
        item.get('gemColor'),
        item.get('metalness', 0.9),
        item.get('roughness', 0.1),
        item.get('price', '—'),
        item.get('rating', 5.0),
        item.get('ratingCount', 0),
        item.get('material', 'Gold'),
        item.get('description', ''),
        json.dumps(item.get('tags', [])),
        item.get('weight', 15.0),
        item.get('touch', 91.6)
    ))
    conn.commit()
    conn.close()
    return get_jewelry_by_id(item.get('id'))

def update_jewelry(item_id, updates):
    """Update existing jewelry item fields."""
    conn = get_db_connection()
    cursor = conn.cursor()

    valid_fields = [
        'name', 'category', 'type', 'glbFile', 'image', 'is3D', 'is2DCatalog',
        'color', 'gemColor', 'metalness', 'roughness', 'price', 'rating',
        'ratingCount', 'material', 'description', 'weight', 'touch'
    ]
    set_clauses = []
    params = []

    for k, v in updates.items():
        if k in valid_fields:
            if k in ['is3D', 'is2DCatalog']:
                v = 1 if v else 0
            set_clauses.append(f"{k} = ?")
            params.append(v)
        elif k == 'tags':
            set_clauses.append("tags = ?")
            params.append(json.dumps(v))

    if not set_clauses:
        conn.close()
        return get_jewelry_by_id(item_id)

    params.append(item_id)
    query = f"UPDATE jewelry_items SET {', '.join(set_clauses)} WHERE id = ?"
    cursor.execute(query, params)
    conn.commit()
    conn.close()
    return get_jewelry_by_id(item_id)

def delete_jewelry(item_id):
    """Delete a jewelry item by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM jewelry_items WHERE id = ?', (item_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def get_latest_gold_rate():
    """Retrieve the most recent gold rate recorded in SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM gold_rates ORDER BY id DESC LIMIT 1')
    row = cursor.fetchone()
    conn.close()
    if row:
        return {
            "rate_22k_per_gram": row['rate_22k_per_gram'],
            "rate_24k_per_gram": row['rate_24k_per_gram'],
            "usd_to_inr": row['usd_to_inr'],
            "date": row['date']
        }
    return None

def set_gold_rate(rate_22k, rate_24k, usd_to_inr, date_str):
    """Store or update gold rate in SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO gold_rates (rate_22k_per_gram, rate_24k_per_gram, usd_to_inr, date)
        VALUES (?, ?, ?, ?)
    ''', (rate_22k, rate_24k, usd_to_inr, date_str))
    conn.commit()
    conn.close()

# ── User Authentication & Profile Functions ───────────────────
def hash_password(password):
    """Hash password with secure salt using SHA-256."""
    salt = "vinayaka_luxury_auth_salt_2026"
    return hashlib.sha256((str(password) + salt).encode('utf-8')).hexdigest()

def create_user(name, email, password):
    """Register a new user in SQLite with duplicate email protection."""
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()
    cursor.execute('SELECT id FROM users WHERE LOWER(email) = ?', (email_clean,))
    if cursor.fetchone():
        conn.close()
        return None, "An account with this email already exists."

    pwd_hash = hash_password(password)
    cursor.execute('''
        INSERT INTO users (name, email, password_hash)
        VALUES (?, ?, ?)
    ''', (name.strip(), email_clean, pwd_hash))
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_user_by_id(user_id), None

def authenticate_user(email, password):
    """Verify email and password against SQLite records."""
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.strip().lower()
    pwd_hash = hash_password(password)
    cursor.execute('''
        SELECT id, name, email, avatar, created_at
        FROM users
        WHERE LOWER(email) = ? AND password_hash = ?
    ''', (email_clean, pwd_hash))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row), None
    return None, "Invalid email or password. Please try again."

def get_user_by_id(user_id):
    """Retrieve user profile by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, email, avatar, created_at FROM users WHERE id = ?', (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

