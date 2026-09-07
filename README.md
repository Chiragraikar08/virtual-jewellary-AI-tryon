<p align="center">
  <img src="static/images/logo.jpg" alt="Vinayaka Jewellary Logo" width="120" style="border-radius: 50%;" />
</p>

<h1 align="center">💎 VINAYAKA JEWELLARY — Virtual Jewelry AI Try-On</h1>

<p align="center">
  <em>Where Tradition Meets Technology — Experience Jewelry Like Never Before</em>
</p>

<p align="center">
  <a href="#-features"><img src="https://img.shields.io/badge/✨_Features-Gold?style=for-the-badge&color=d4a847&labelColor=0c0e18" alt="Features" /></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/🛠_Tech_Stack-Silver?style=for-the-badge&color=9a94a8&labelColor=0c0e18" alt="Tech Stack" /></a>
  <a href="#-quick-start"><img src="https://img.shields.io/badge/🚀_Quick_Start-Emerald?style=for-the-badge&color=2d8a4e&labelColor=0c0e18" alt="Quick Start" /></a>
  <a href="#-live-demo"><img src="https://img.shields.io/badge/🌐_Live_Demo-Ruby?style=for-the-badge&color=cc2233&labelColor=0c0e18" alt="Live Demo" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Three.js-000000?style=flat-square&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/MediaPipe-4285F4?style=flat-square&logo=google&logoColor=white" alt="MediaPipe" />
  <img src="https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/OpenCV-5C3EE8?style=flat-square&logo=opencv&logoColor=white" alt="OpenCV" />
  <img src="https://img.shields.io/badge/WebGL-990000?style=flat-square&logo=webgl&logoColor=white" alt="WebGL" />
</p>

---

## 🌟 Overview

**Vinayaka Jewellary** is a premium, AI-powered virtual jewelry try-on platform that lets customers explore, visualize, and virtually wear jewelry — all from their browser. Built with a stunning dark-gold luxury UI, it combines **real-time face tracking**, **interactive 3D rendering**, and a **curated 2D catalog** into one seamless experience.

> 🪙 *"Try before you buy — from the comfort of your home."*

Whether you're a jewelry store looking to go digital or a developer building the next-gen e-commerce experience, this project delivers a **production-ready**, feature-rich foundation.

---

## ✨ Features

### 🛒 **Mode 1 — 2D Premium Catalog**
> Browse a curated collection of high-resolution jewelry images

- 📸 Beautiful grid layout with card hover animations
- 🏷️ Filter by category: **Earrings** · **Necklaces** · **Rings** · **Nosepins**
- 💰 Real-time pricing with **Live Gold Rate Widget** (auto-updated daily)
- ⭐ Product ratings, material specs, weight & purity details
- 🛍️ Full shopping cart with localStorage persistence
- 🔐 User authentication (Sign Up / Sign In / Guest mode)

### ✦ **Mode 2 — Interactive 3D Viewer**
> Rotate, zoom, and inspect jewelry in photorealistic 3D

- 🔮 **48+ GLB 3D models** — rings, earrings, necklaces rendered in real-time
- 🌟 **PBR (Physically Based Rendering)** with ACES Filmic tone mapping
- 💡 HDR environment mapping for realistic gold reflections
- 🔄 Auto-rotation with orbit controls (zoom, pan, rotate)
- 🎨 Dynamic material properties — metalness, roughness, gem colors
- ⚡ Shadow mapping & anti-aliased rendering via Three.js

### ◉ **Mode 3 — AI-Powered Virtual Try-On**
> See how jewelry looks on you in real-time using your webcam

- 🤖 **MediaPipe FaceLandmarker** — 478-point face mesh tracking
- 📐 Precise landmark-based positioning for ears, neck, nose, and face
- 🔧 **EMA Smoothing** — eliminates jitter for stable, fluid overlays
- 📷 Webcam capture, upload photo, and download try-on snapshots
- 🎯 Supports: **Earrings** · **Necklaces** · **Nosepins** · **Maang Tikka**
- 🖥️ Also available as a **Desktop Python app** (OpenCV + MediaPipe)

---

## 🏗️ Architecture

```
virtual-jewellary-AI-tryon/
│
├── 🌐 Frontend (Pure HTML/CSS/JS)
│   ├── index.html              # Main SPA — all three modes
│   ├── style.css               # 4200+ lines of premium dark UI
│   ├── app.js                  # Orchestration layer (mode switching, catalog, 3D)
│   ├── tryon.js                # AI Try-On engine (MediaPipe + Canvas 2D)
│   ├── viewer3d.js             # Three.js 3D jewelry viewer (GLB loader)
│   ├── cart.js                 # Shopping cart with localStorage
│   ├── jewelry-data.js         # Full catalog dataset (100+ items)
│   └── add_new_items.js        # Utility to add items dynamically
│
├── 🖼️ Static Assets
│   ├── static/images/          # High-res product images (earrings, necklaces, catalog)
│   └── static/models/          # 48 GLB 3D models (rings, earrings, necklaces)
│
├── 🐍 Backend (Flask + SQLite)
│   ├── replit_backend/
│   │   ├── app.py              # REST API server (CORS-enabled)
│   │   ├── database.py         # SQLite ORM & CRUD operations
│   │   ├── desktop_tryon.py    # Desktop try-on (OpenCV + MediaPipe)
│   │   ├── jewelry.db          # SQLite database
│   │   ├── requirements.txt    # Python dependencies
│   │   └── render.yaml         # Render.com deployment config
│   └── initial_catalog.json    # Seed data for database
│
└── 📄 Config & Docs
    ├── .gitignore
    ├── favicon.ico
    └── README.md               # You are here ✨
```

---

## 🧬 Tech Stack

<table>
<tr>
<td align="center" width="150">

### 🎨 Frontend
</td>
<td>

| Technology | Purpose |
|:---|:---|
| **HTML5 / CSS3** | Semantic markup + 4200-line premium dark UI |
| **Vanilla JavaScript** | Zero-framework SPA with mode switching |
| **Three.js** | WebGL-based 3D jewelry rendering (PBR) |
| **GLTFLoader** | Loading `.glb` 3D jewelry models |
| **OrbitControls** | Interactive 3D camera controls |
| **MediaPipe** | Real-time 478-point face mesh detection |
| **Canvas 2D API** | Alpha-composited jewelry overlays |
| **Google Fonts** | Inter + Playfair Display typography |

</td>
</tr>
<tr>
<td align="center" width="150">

### ⚙️ Backend
</td>
<td>

| Technology | Purpose |
|:---|:---|
| **Flask** | Lightweight Python REST API |
| **Flask-CORS** | Cross-origin resource sharing |
| **SQLite** | Persistent jewelry database |
| **Gunicorn** | Production WSGI server |
| **Render** | Cloud deployment platform |

</td>
</tr>
<tr>
<td align="center" width="150">

### 🧠 AI / CV
</td>
<td>

| Technology | Purpose |
|:---|:---|
| **MediaPipe FaceLandmarker** | Browser-based face mesh detection |
| **OpenCV (Python)** | Desktop try-on with webcam |
| **NumPy** | Numerical computations for positioning |
| **EMA Smoothing** | Jitter-free landmark tracking |
| **Alpha Compositing** | Realistic jewelry overlay blending |

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.8+** — for the backend server
- **Modern browser** — Chrome, Edge, or Firefox (WebGL + WebRTC support)
- A **webcam** — for the AI Try-On feature (optional)

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/Chiragraikar08/virtual-jewellary-AI-tryon.git
cd virtual-jewellary-AI-tryon
```

### 2️⃣ Set Up the Backend

```bash
cd replit_backend
pip install -r requirements.txt
python app.py
```

The backend API will start on `http://127.0.0.1:5000`

### 3️⃣ Launch the Frontend

Simply open `index.html` in your browser, or use a local server:

```bash
# Using Python's built-in server (from project root)
python -m http.server 8000
```

Then visit **http://localhost:8000** 🎉

### 4️⃣ (Optional) Desktop Try-On

```bash
cd replit_backend
pip install opencv-python mediapipe numpy
python desktop_tryon.py
```

---

## 🔌 API Endpoints

The Flask backend provides a RESTful API:

| Method | Endpoint | Description |
|:---:|:---|:---|
| `GET` | `/api/catalog` | Retrieve all jewelry items (with filters) |
| `POST` | `/api/catalog` | Add a new jewelry item |
| `GET` | `/api/catalog/<id>` | Get a specific item by ID |
| `PUT` | `/api/catalog/<id>` | Update an existing item |
| `DELETE` | `/api/catalog/<id>` | Delete an item |
| `GET` | `/api/gold-rate` | Get live gold rate |
| `POST` | `/api/gold-rate` | Update gold rate |
| `GET` | `/api/get_models` | List available 3D GLB models |
| `GET` | `/api/ping` | Health check / wake server |

---

## 🎨 Design Philosophy

<table>
<tr>
<td width="50%">

### 🌙 Premium Dark Theme
- Deep dark backgrounds (`#060810`, `#0c0e18`)
- Luxurious gold accents (`#d4a847`, `#f0c96a`)
- Glassmorphism with `backdrop-filter: blur()`
- Subtle gold border glows and shadows

</td>
<td width="50%">

### ✨ Micro-Interactions
- Smooth card hover transitions (scale + glow)
- Animated loading spinners with gold accents
- Mode-switching with panel slide animations
- 3D auto-rotate with damped orbit controls

</td>
</tr>
<tr>
<td width="50%">

### 🖋️ Typography
- **Inter** — Clean, modern UI text
- **Playfair Display** — Elegant serif headings
- Carefully tuned letter-spacing & font weights
- Responsive font sizing across breakpoints

</td>
<td width="50%">

### 📱 Responsive Design
- Mobile-first approach with fluid layouts
- Adaptive sidebar behavior
- Touch-optimized controls for mobile try-on
- Full-screen 3D viewer toggle

</td>
</tr>
</table>

---

## 📸 How the AI Try-On Works

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   Webcam     │────▶│  MediaPipe Face   │────▶│  Landmark          │
│   Stream     │     │  Landmarker       │     │  Extraction        │
└──────────────┘     │  (478 points)     │     │  (ears, jaw, nose) │
                     └──────────────────┘     └────────┬───────────┘
                                                       │
                     ┌──────────────────┐              │
                     │  EMA Smoother    │◀─────────────┘
                     │  (α = 0.3)       │
                     └────────┬─────────┘
                              │
                     ┌────────▼─────────┐     ┌────────────────────┐
                     │  Design Params   │────▶│  Canvas 2D         │
                     │  Analyzer        │     │  Alpha Compositing │
                     │  (scale, offset) │     │  (final render)    │
                     └──────────────────┘     └────────────────────┘
```

**Key innovations:**
- **Design Params Analyzer** — Reads PNG alpha channel to dynamically compute scale/offset per jewelry piece
- **EMA (Exponential Moving Average)** smoothing for stable, jitter-free rendering
- **Multi-category support** — Different placement logic for earrings, necklaces, nosepins, and tikka

---

## 🗂️ Jewelry Collection

| Category | 2D Images | 3D Models | Try-On Support |
|:---|:---:|:---:|:---:|
| 💍 **Rings** | ✅ | ✅ (20+ GLB) | — |
| ✨ **Earrings** | ✅ | ✅ (5 GLB) | ✅ |
| 📿 **Necklaces** | ✅ | ✅ (15+ GLB) | ✅ |
| ✦ **Nosepins** | ✅ | — | ✅ |
| 👑 **Maang Tikka** | ✅ | — | ✅ |

> 🔢 **Total:** 100+ catalog items • 48 GLB 3D models • Full try-on for face jewelry

---

## 🚢 Deployment

### Deploy Backend to Render

The project includes a `render.yaml` for one-click deployment:

```yaml
services:
  - type: web
    name: virtual-jewellary-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
```

1. Push `replit_backend/` to a Git repo
2. Connect to [Render.com](https://render.com)
3. Deploy as a **Web Service**
4. Update `BACKEND_URL` in `app.js` with your Render URL

### Deploy Frontend to GitHub Pages

```bash
# The frontend is static HTML — just push to GitHub and enable Pages
git push origin main
# Settings → Pages → Source: main branch → / (root)
```

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. 🍴 **Fork** the repository
2. 🌿 **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. 💾 **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. 📤 **Push** to the branch (`git push origin feature/amazing-feature`)
5. 🔃 **Open** a Pull Request

### Ideas for Contributions
- 🆕 Add more 3D jewelry models
- 🌍 Multi-language support
- 📱 Progressive Web App (PWA) conversion
- 🤖 AI-based jewelry recommendation engine
- 💳 Payment gateway integration

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👨‍💻 Author

<p align="center">
  <strong>Chirag Raikar</strong><br/>
  <em>Built with ❤️ and a passion for blending AI with traditional craftsmanship</em>
</p>

<p align="center">
  <a href="https://github.com/Chiragraikar08">
    <img src="https://img.shields.io/badge/GitHub-Chiragraikar08-181717?style=for-the-badge&logo=github" alt="GitHub" />
  </a>
</p>

---

<p align="center">
  <img src="https://img.shields.io/badge/Made_with-❤️_&_JavaScript-d4a847?style=for-the-badge&labelColor=0c0e18" alt="Made with Love" />
  <img src="https://img.shields.io/badge/AI_Powered-MediaPipe-4285F4?style=for-the-badge&logo=google&labelColor=0c0e18" alt="AI Powered" />
  <img src="https://img.shields.io/badge/3D_Engine-Three.js-000000?style=for-the-badge&logo=three.js&labelColor=0c0e18" alt="Three.js" />
</p>

<p align="center">
  <sub>⭐ If you found this project helpful, please give it a star on GitHub! ⭐</sub>
</p>
