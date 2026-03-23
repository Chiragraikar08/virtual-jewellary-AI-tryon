import cv2  # type: ignore # pyright: ignore
import mediapipe as mp  # type: ignore # pyright: ignore
import numpy as np  # type: ignore # pyright: ignore
import os  # type: ignore # pyright: ignore
import time  # type: ignore # pyright: ignore
import subprocess  # type: ignore # pyright: ignore
from typing import Any, Optional, Dict, List  # type: ignore # pyright: ignore

# ══════════════════════════════════════
#  LANDMARK SMOOTHER (EMA)
# ══════════════════════════════════════

class LandmarkSmoother:
    """Exponential Moving Average smoother – prevents jittery jewellery."""
    def __init__(self, alpha=0.3):
        self.alpha = alpha
        self._prev = {}

    def smooth(self, key, value):
        if key not in self._prev:
            self._prev[key] = value
            return value
        s = self._prev[key] * (1 - self.alpha) + value * self.alpha
        self._prev[key] = s
        return s

    def reset(self):
        self._prev.clear()

smoother = LandmarkSmoother(alpha=0.3)

# ══════════════════════════════════════
#  ASSET LOADING
# ══════════════════════════════════════

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def load_assets(folder):
    """Load images with alpha channel from a folder and generate fake product info."""
    items = []
    full_path = os.path.join(SCRIPT_DIR, folder)
    if not os.path.exists(full_path):
        return items
    for f in sorted(os.listdir(full_path)):
        if f.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')):
            try:
                img = cv2.imread(os.path.join(full_path, f), cv2.IMREAD_UNCHANGED)
                if img is None: continue
                if len(img.shape) == 2:
                    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
                elif img.shape[2] == 3:
                    alpha = np.ones((img.shape[0], img.shape[1], 1), dtype=img.dtype) * 255
                    img = np.concatenate([img, alpha], axis=2)
                
                # Generate stable pseudo-random price and rating based on filename
                hash_val = sum(ord(c) for c in f)
                base_price = sum(ord(c)*11 for c in f) % 50000 + 15000
                price_str = f"Rs. {base_price:,}"
                rating = 4.0 + (hash_val % 10) / 10.0
                name = os.path.splitext(f)[0].replace("-", " ").replace("_", " ").title()

                items.append({
                    "img": img,
                    "name": name,
                    "price": price_str,
                    "material": "18K/22K Gold Default",
                    "rating": rating
                })
            except Exception: pass
    return items

print("Loading jewellery assets...")
assets = {"Necklace": [], "Nosepin": [], "Earring": []}
_LOAD_PATHS = {
    "Necklace": ["necklace", os.path.join("..", "static", "images", "necklace")],
    "Nosepin":  ["nosepin",  os.path.join("..", "static", "images", "nosepin")],
    "Earring":  ["earring",  os.path.join("..", "static", "images", "earring")],
}
for cat, paths in _LOAD_PATHS.items():
    for p in paths:
        loaded = load_assets(p)
        if loaded:
            assets[cat] = loaded
            break

categories: List[str] = ["Necklace", "Nosepin", "Earring"]
current_category: str = "Earring"
selected_assets: Dict[str, Any] = {"Necklace": None, "Nosepin": None, "Earring": None}
enabled_categories: Dict[str, bool] = {"Necklace": True, "Nosepin": True, "Earring": True}
gallery_scroll: Dict[str, int] = {"Necklace": 0, "Nosepin": 0, "Earring": 0}

for cat in categories:
    if len(assets[cat]) > 0:
        selected_assets[cat] = assets[cat][0]

# ══════════════════════════════════════
#  UI CONSTANTS & CONFIG
# ══════════════════════════════════════
WIN_W, WIN_H  = 1280, 720  # Professional Widescreen
LEFT_PANEL_W  = 220        # Collection List
RIGHT_PANEL_W = 300        # Details & Gallery
SIDE_GALLERY_ITEM_H = 65   # Vertical gallery items

COL_CYAN      = (255, 230, 0)
COL_WHITE     = (255, 255, 255)
COL_GREY      = (200, 200, 200)
COL_GOLD      = (110, 190, 255)
COL_STAR      = (0, 215, 255)

feedback_msg = "Align your face to begin"
feedback_type = "neutral"  # neutral, success, warn

PRODUCT_INFO = {
    "Earring": {"name": "Golden Teardrop", "price": "Rs. 24,999", "material": "22K Gold", "rating": 4.8},
    "Necklace": {"name": "Solitaire Pendant", "price": "Rs. 44,999", "material": "18K Gold", "rating": 4.9},
    "Nosepin": {"name": "Diamond Stud", "price": "Rs. 12,500", "material": "Platinum", "rating": 4.7}
}

last_captured_frame: Optional[Any] = None
last_saved_path: Optional[str] = None
is_frozen: bool = False
uploaded_image: Optional[Any] = None

# ══════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════

def adjust_vis(img):
    """Sharpen and enhance contrast for premium feel."""
    if img is None: return img
    # 1. Noise Reduction (Gaussian Blur or FastNlMeans - using blur for speed)
    img = cv2.GaussianBlur(img, (3,3), 0)
    # 2. Contrast & Brightness Enhancement
    img = cv2.convertScaleAbs(img, alpha=1.2, beta=15)
    # 3. Sharpening
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    img = cv2.filter2D(img, -1, kernel)
    return img

def draw_panel(frame, x1, y1, x2, y2, alpha=0.85):
    """Semi-transparent dark panel."""
    sub = frame[y1:y2, x1:x2]
    overlay = np.full_like(sub, 20)
    cv2.addWeighted(overlay, alpha, sub, 1 - alpha, 0, sub)

def overlay_png(bg, fg, x, y, target_width, min_x=0, max_x=None):
    if fg is None: return bg
    h_o, w_o = fg.shape[:2]
    if w_o == 0 or h_o == 0 or target_width <= 0: return bg
    scale = target_width / w_o
    nw, nh = int(w_o * scale), int(h_o * scale)
    if nw <= 0 or nh <= 0: return bg
    fg_r = cv2.resize(fg, (nw, nh), interpolation=cv2.INTER_AREA)
    bh, bw = bg.shape[:2]
    if max_x is None: max_x = bw
    x1b, y1b = max(x, min_x), max(y, 0)
    x2b, y2b = min(x + nw, max_x), min(y + nh, bh)
    x1f, y1f = x1b - x, y1b - y
    x2f, y2f = x1f + (x2b - x1b), y1f + (y2b - y1b)
    if x1b >= x2b or y1b >= y2b: return bg
    fg_c = fg_r[y1f:y2f, x1f:x2f]
    if fg_c.shape[2] == 4:
        a = fg_c[:, :, 3:4] / 255.0
        bg[y1b:y2b, x1b:x2b] = (a * fg_c[:, :, :3] + (1 - a) * bg[y1b:y2b, x1b:x2b]).astype(np.uint8)
    else:
        bg[y1b:y2b, x1b:x2b] = fg_c[:, :, :3]
    return bg

def get_design_params(img):
    """Compute dynamic scale/offset based on true visible pixels in the image.
    Returns: (scale_factor, y_offset_factor, center_offset, top_padding_ratio)
    """
    h_img, w_img = img.shape[:2]
    if h_img == 0 or w_img == 0:
        return 1.15, 0.10, 0, 0.0

    # Default to image dimensions if no alpha channel
    true_w, true_h = w_img, h_img
    top_pad_px = 0
    center_offset = 0

    # Find the true bounding box of the non-transparent pixels
    if len(img.shape) == 3 and img.shape[2] == 4:
        alpha = img[:, :, 3]
        ret, thresh = cv2.threshold(alpha, 20, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            # Get bounding box of all contours combined
            x_min = w_img
            y_min = h_img
            x_max = 0
            y_max = 0
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                x_min = min(x_min, x)
                y_min = min(y_min, y)
                x_max = max(x_max, x + w)
                y_max = max(y_max, y + h)
            
            true_w = x_max - x_min
            true_h = y_max - y_min
            top_pad_px = y_min
            
            # How far off-center is the actual jewelry bounding box?
            bbox_center_x = x_min + (true_w / 2)
            img_center_x = w_img / 2
            center_offset = img_center_x - bbox_center_x
            
            # Avoid division by zero
            if true_h == 0: true_h = 1

    aspect_ratio = true_w / true_h

    if aspect_ratio >= 0.95:
        # Wide designs (chokers, broad necklaces)
        # Scaled larger to wrap around the neck, placed higher up
        scale_factor = 1.42
        y_offset_factor = -0.05
    elif aspect_ratio <= 0.8:
        # Long/hanging designs (chains, pendants)
        # Scaled narrower, placed lower
        scale_factor = 1.10
        y_offset_factor = 0.15
    else:
        # Normal proportioned designs
        scale_factor = 1.22
        y_offset_factor = 0.05

    top_padding_ratio = top_pad_px / h_img if h_img > 0 else 0.0
    return scale_factor, y_offset_factor, center_offset, top_padding_ratio

def draw_stars(frame, x, y, rating):
    for i in range(5):
        sx = x + i * 18
        color = COL_GOLD if i < int(rating) else (60, 60, 60)
        cv2.putText(frame, "*", (sx, y), cv2.FONT_HERSHEY_PLAIN, 1.2, color, 2)

# ══════════════════════════════════════
#  UI CORE
# ══════════════════════════════════════

def draw_ui(frame):
    h, w = frame.shape[:2]
    cam_x = LEFT_PANEL_W
    cam_w = w - LEFT_PANEL_W - RIGHT_PANEL_W
    
    # 1. LEFT PANEL - Collection
    draw_panel(frame, 0, 0, LEFT_PANEL_W, h, alpha=0.9)
    cv2.putText(frame, "COLLECTION", (30, 60), cv2.FONT_HERSHEY_DUPLEX, 0.6, COL_WHITE, 1)
    cv2.line(frame, (30, 75), (80, 75), COL_GOLD, 2)
    
    for i, cat in enumerate(categories):
        y = 130 + i * 55
        is_active = (cat == current_category)
        if is_active:
            cv2.rectangle(frame, (15, y-30), (LEFT_PANEL_W-15, y+15), (40, 40, 40), -1)
            cv2.rectangle(frame, (15, y-30), (19, y+15), COL_GOLD, -1)
        color = COL_WHITE if is_active else COL_GREY
        cv2.putText(frame, cat.upper(), (45, y), cv2.FONT_HERSHEY_DUPLEX, 0.5, color, 1)

    # 2. RIGHT PANEL - Details
    draw_panel(frame, w - RIGHT_PANEL_W, 0, w, h, alpha=0.9)
    # Pull details from the currently selected item in this category
    sel_item = selected_assets.get(current_category)
    if sel_item:
        info = sel_item
    else:
        info = PRODUCT_INFO.get(current_category, {})

    rx = w - RIGHT_PANEL_W + 30
    cv2.putText(frame, info.get("name", "").upper(), (rx, 60), cv2.FONT_HERSHEY_DUPLEX, 0.6, COL_WHITE, 1)
    cv2.putText(frame, info.get("price", ""), (rx, 95), cv2.FONT_HERSHEY_DUPLEX, 0.8, COL_GOLD, 2)
    cv2.putText(frame, info.get("material", ""), (rx, 125), cv2.FONT_HERSHEY_PLAIN, 0.9, COL_GREY, 1)
    draw_stars(frame, rx, 160, info.get("rating", 0))

    # Gallery with Scrollbar
    cv2.putText(frame, "DESIGNS", (rx, 220), cv2.FONT_HERSHEY_DUPLEX, 0.5, COL_GREY, 1)
    items = assets.get(current_category, [])
    scroll_y = gallery_scroll[current_category]
    gallery_h = h - 240
    
    for i in range(len(items)):
        thumb = items[i]
        ty = 235 + i * (SIDE_GALLERY_ITEM_H + 8) - scroll_y
        
        # Clip to sub-viewport
        if ty + SIDE_GALLERY_ITEM_H < 230 or ty > h:
            continue
            
        selected = (selected_assets[current_category] is thumb)
        cv2.rectangle(frame, (w - RIGHT_PANEL_W + 20, max(230, ty)), (w - 20, min(h, ty + SIDE_GALLERY_ITEM_H)), (30,30,30), -1)
        if selected: cv2.rectangle(frame, (w - RIGHT_PANEL_W + 20, max(230, ty)), (w - 20, min(h, ty + SIDE_GALLERY_ITEM_H)), COL_GOLD, 1)
        
        if ty >= 220:
            overlay_png(frame, thumb["img"], w - RIGHT_PANEL_W + 110, ty + 10, target_width=60)

    # Scrollbar Track & Thumb
    total_h = len(items) * (SIDE_GALLERY_ITEM_H + 8)
    if total_h > gallery_h:
        cv2.rectangle(frame, (w - 12, 235), (w - 4, h - 10), (50,50,50), -1)
        max_scroll = total_h - gallery_h
        if max_scroll > 0:
            thumb_h = max(20, int(gallery_h * (gallery_h / total_h)))
            thumb_y = 235 + int((scroll_y / max_scroll) * (gallery_h - thumb_h - 10))
            cv2.rectangle(frame, (w - 12, thumb_y), (w - 4, thumb_y + thumb_h), COL_GOLD, -1)

    # 3. FLOATING TYPES
    cb_x = cam_x + 30
    cb_y = 60
    draw_panel(frame, cb_x - 15, cb_y - 35, cb_x + 180, cb_y + 110, alpha=0.7)
    cv2.putText(frame, "TRY-ON TYPES", (cb_x, cb_y - 10), cv2.FONT_HERSHEY_DUPLEX, 0.45, COL_GOLD, 1)
    for i, cat in enumerate(categories):
        cy = cb_y + 25 + i * 28
        enabled = enabled_categories[cat]
        cv2.rectangle(frame, (cb_x, cy-12), (cb_x+12, cy), COL_WHITE, 1)
        if enabled: cv2.rectangle(frame, (cb_x+3, cy-9), (cb_x+9, cy-3), COL_GOLD, -1)
        cv2.putText(frame, cat, (cb_x + 25, cy), cv2.FONT_HERSHEY_PLAIN, 0.9, COL_WHITE, 1)

    # 4. HUD
    hud_w = 260
    hud_x = cam_x + (cam_w - hud_w)//2
    draw_panel(frame, hud_x, 25, hud_x + hud_w, 65, alpha=0.8)
    msg_col = COL_WHITE
    if feedback_type == "success": msg_col = (50, 255, 100)
    elif feedback_type == "warn": msg_col = (100, 100, 255)
    (tw, th), _ = cv2.getTextSize(feedback_msg, cv2.FONT_HERSHEY_PLAIN, 0.9, 1)
    cv2.putText(frame, feedback_msg, (hud_x + (hud_w - tw)//2, 50), cv2.FONT_HERSHEY_PLAIN, 0.9, msg_col, 1)

    # 5. BUTTONS
    btn_y = h - 80
    btn_w, btn_h = 130, 48
    btns = [("UPLOAD", (200,200,200)), ("RETAKE", (200,200,200)), ("CAPTURE", COL_GOLD), ("DOWNLOAD", (200,200,200))]
    total_w = len(btns)*(btn_w+20)-20
    start_x = cam_x + (cam_w - total_w)//2
    for i, (label, col) in enumerate(btns):
        bx = start_x + i*(btn_w+20)
        cv2.rectangle(frame, (bx, btn_y), (bx+btn_w, btn_y+btn_h), (35,35,35), -1)
        cv2.rectangle(frame, (bx, btn_y), (bx+btn_w, btn_y+btn_h), col, 1)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.5, 1)
        cv2.putText(frame, label, (bx+(btn_w-tw)//2, btn_y+30), cv2.FONT_HERSHEY_DUPLEX, 0.5, col, 1)

    # 6. WATERMARK
    cv2.putText(frame, "VINAYAKA JEWELLARY TRY ON", (cam_x + 15, h - 15), cv2.FONT_HERSHEY_DUPLEX, 0.45, (150, 150, 150), 1)

def mouse_click(event, x, y, flags, param):
    global current_category, feedback_msg, feedback_type, last_captured_frame, last_saved_path, is_frozen, uploaded_image, gallery_scroll
    
    # Handle Mouse Wheel Scroll
    if event == 10:  # cv2.EVENT_MOUSEWHEEL on Windows
        if x > WIN_W - RIGHT_PANEL_W:
            items = assets.get(current_category, [])
            total_h = len(items) * (SIDE_GALLERY_ITEM_H + 8)
            available_h = WIN_H - 240
            max_scroll = max(0, total_h - available_h)
            if flags > 0:
                gallery_scroll[current_category] = max(0, gallery_scroll[current_category] - 40)
            else:
                gallery_scroll[current_category] = min(max_scroll, gallery_scroll[current_category] + 40)
        return

    if event == cv2.EVENT_LBUTTONDOWN:
        # Left Panel
        if x < LEFT_PANEL_W:
            for i, cat in enumerate(categories):
                yy = 130 + i * 55
                if yy - 30 < y < yy + 15:
                    current_category = cat
                    if assets[cat]: selected_assets[cat] = assets[cat][0]
                    return
        # Right Panel
        if x > WIN_W - RIGHT_PANEL_W:
            items = assets.get(current_category, [])
            scroll_y = gallery_scroll[current_category]
            for i in range(len(items)):
                ty = 235 + i * (SIDE_GALLERY_ITEM_H + 8) - scroll_y
                if ty < y < ty + SIDE_GALLERY_ITEM_H and ty >= 230:
                    selected_assets[current_category] = items[i]
                    feedback_msg = f"Changed to Design {i+1}"
                    feedback_type = "success"
                    return
        # Checkboxes
        cam_x = LEFT_PANEL_W
        cb_x = cam_x + 30
        cb_y = 60
        for i, cat in enumerate(categories):
            cy = cb_y + 25 + i * 28
            if cb_x < x < cb_x + 120 and cy - 20 < y < cy + 5:
                enabled_categories[cat] = not enabled_categories[cat]
                return
        # Buttons
        cam_w = WIN_W - LEFT_PANEL_W - RIGHT_PANEL_W
        btn_y = WIN_H - 80
        btn_w = 130
        total_w = 4*(btn_w+20)-20
        start_x = cam_x + (cam_w - total_w)//2
        for i in range(4):
            bx = start_x + i*(btn_w+20)
            if bx < x < bx + btn_w and btn_y < y < btn_y + 48:
                if i == 0:
                    try:
                        import tkinter as tk  # type: ignore # pyright: ignore
                        from tkinter import filedialog  # type: ignore # pyright: ignore
                        
                        root = tk.Tk()
                        root.withdraw()
                        root.attributes('-topmost', True)
                        
                        filepath = filedialog.askopenfilename(
                            filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp"), ("All files", "*.*")],
                            title="Select a photo to Try-On"
                        )
                        root.destroy()
                        
                        if filepath:
                            img = cv2.imread(filepath)
                            if img is not None:
                                uploaded_image = img
                                is_frozen = True # Lock to the uploaded image immediately
                                last_captured_frame = img
                                feedback_msg = "✓ Uploaded photo loaded!"
                                feedback_type = "success"
                            else:
                                feedback_msg = "Failed to load image"
                                feedback_type = "warn"
                    except Exception as e:
                        print("Upload Exception:", e)
                elif i == 1: 
                    is_frozen = False
                    uploaded_image = None # Reset webcam mode
                    last_saved_path = None
                    feedback_msg = "Ready for new capture"
                    feedback_type = "neutral"
                elif i == 2: 
                    if last_captured_frame is not None:
                        is_frozen = True
                        feedback_msg = "✓ Captured! Click DOWNLOAD to save."
                        feedback_type = "success"
                elif i == 3:
                    if last_captured_frame is not None:
                        try:
                            import tkinter as tk  # type: ignore # pyright: ignore
                            from tkinter import filedialog  # type: ignore # pyright: ignore
                            
                            root = tk.Tk()
                            root.withdraw()
                            root.attributes('-topmost', True)
                            
                            filepath = filedialog.asksaveasfilename(
                                defaultextension=".jpg",
                                filetypes=[("JPEG files", "*.jpg"), ("PNG files", "*.png"), ("All files", "*.*")],
                                initialfile=f"tryon_{int(time.time())}.jpg",
                                title="Save your AI Try-On photo"
                            )
                            
                            root.destroy()
                            
                            if filepath:
                                cv2.imwrite(filepath, last_captured_frame)
                                feedback_msg = f"Saved to your PC!"
                                feedback_type = "success"
                        except Exception as e:
                            feedback_msg = "Save cancelled or failed"
                            feedback_type = "warn"
                            print("Save Exception:", e)
                    else:
                        feedback_msg = "Please CAPTURE first"
                        feedback_type = "warn"
                return

# ══════════════════════════════════════
#  MAIN LOOP
# ══════════════════════════════════════

print("Starting AI Try-On System...")
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
cv2.namedWindow("Virtual Try-On", cv2.WINDOW_NORMAL)
cv2.resizeWindow("Virtual Try-On", WIN_W, WIN_H)
cv2.setMouseCallback("Virtual Try-On", mouse_click)

face_mesh = mp.solutions.face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True)

# Custom Necklace Stabilization State
prev_nk_x = 0
prev_nk_y = 0
prev_nk_width = 100

while True:
    if not is_frozen and uploaded_image is None:
        ret, frame = cap.read()  # type: ignore
        if not ret or frame is None:
            print("\n[ERROR] Camera could not be opened. It might be in use by another application (like your browser tab!). Please close other camera apps and try again.")
            break
        
        # Assert frame is not None for type checkers
        assert frame is not None
        frame = cv2.flip(frame, 1)  # type: ignore
    elif uploaded_image is not None:
        frame = uploaded_image.copy()  # type: ignore
    else:
        # Camera logic is paused, we just want to reuse the last_captured_frame
        assert last_captured_frame is not None
        frame = last_captured_frame.copy()  # type: ignore
    # Resize ALL frames (webcam, uploaded, or frozen) to fit the UI properly
    frame = cv2.resize(frame, (WIN_W, WIN_H))  # type: ignore
    h, w = frame.shape[:2]
    
    # Pre-process frame
    frame = adjust_vis(frame)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # type: ignore
    res = face_mesh.process(rgb)
    
    face_detected = False
    if res.multi_face_landmarks:
        face_detected = True
        lm = res.multi_face_landmarks[0].landmark
        
        # Scaling landmarks
        le_x = int(smoother.smooth("le", lm[234].x * w))
        le_y = int(smoother.smooth("ley", lm[234].y * h))
        re_x = int(smoother.smooth("re", lm[454].x * w))
        re_y = int(smoother.smooth("rey", lm[454].y * h))
        ch_x = int(smoother.smooth("ch", lm[152].x * w))
        ch_y = int(smoother.smooth("chy", lm[152].y * h))
        ns_x = int(smoother.smooth("ns", lm[1].x * w))
        ns_y = int(smoother.smooth("nsy", lm[1].y * h))
        
        fw = abs(re_x - le_x)
        fh = abs(ch_y - ns_y)
        
        # Calculate horizontal face direction for earring visibility
        face_center = (le_x + re_x) / 2.0
        raw_offset = ns_x - face_center
        # Smooth offset to prevent flickering
        smooth_offset = smoother.smooth("head_offset", raw_offset)
        turn_threshold = fw * 0.05
        
        show_left_earring = True
        show_right_earring = True
        
        if smooth_offset > turn_threshold:
            # Looking RIGHT
            show_right_earring = False
        elif smooth_offset < -turn_threshold:
            # Looking LEFT
            show_left_earring = False
            
        feedback_msg = "Perfect Alignment"
        feedback_type = "success"
        
        # Overlay Logic
        if enabled_categories["Necklace"] and selected_assets["Necklace"] is not None:
            nk_img = selected_assets["Necklace"]["img"]
            scale_factor, y_offset_factor, center_offset, top_pad = get_design_params(nk_img)

            # Dynamic width based on design type
            necklace_width = int(fw * scale_factor)

            # Width Limit (Avoid oversize clamp)
            max_width = int(fw * (scale_factor + 0.1))
            if necklace_width > max_width:
                necklace_width = max_width

            # Fake 3D Rotation Effect
            scale_x = max(0.1, 1.0 - (abs(smooth_offset) / max(fw, 1)))
            target_width = int(necklace_width * scale_x)

            # Calculate rendered height for content-aware offset
            nk_h, nk_w = nk_img.shape[:2]
            rendered_height = int(target_width * nk_h / max(nk_w, 1))

            # Dynamic vertical placement based on design type
            neck_x = ch_x
            neck_y = int(ch_y + (fw * y_offset_factor))

            # Content-aware: shift up to compensate for transparent padding at top
            # This makes the actual visible content start at the neck position
            neck_y -= int(rendered_height * top_pad)

            # Auto Center Correction
            target_x = neck_x - target_width // 2 - int(center_offset)
            target_y = neck_y

            # Tilt Effect
            if smooth_offset > turn_threshold:
                target_x += int(fw * 0.05)
            elif smooth_offset < -turn_threshold:
                target_x -= int(fw * 0.05)

            # Custom Exponential Smoothing
            smooth_factor = 0.85
            smooth_nk_x = int(prev_nk_x * smooth_factor + target_x * (1 - smooth_factor))
            smooth_nk_y = int(prev_nk_y * smooth_factor + target_y * (1 - smooth_factor))
            smooth_nk_width = int(prev_nk_width * smooth_factor + target_width * (1 - smooth_factor))

            # Dead Zone (Anti-shake) ignores micro-movements of target
            if abs(target_x - prev_nk_x) < 5:
                smooth_nk_x = prev_nk_x
            if abs(target_y - prev_nk_y) < 5:
                smooth_nk_y = prev_nk_y

            # Max step limit to prevent leaps
            max_move = 20
            dx = smooth_nk_x - prev_nk_x
            dy = smooth_nk_y - prev_nk_y
            if abs(dx) > max_move:
                smooth_nk_x = int(prev_nk_x + max_move * (dx / abs(dx)))
            if abs(dy) > max_move:
                smooth_nk_y = int(prev_nk_y + max_move * (dy / abs(dy)))

            # Final Overlay
            overlay_png(frame, nk_img, smooth_nk_x, smooth_nk_y, smooth_nk_width, LEFT_PANEL_W, w-RIGHT_PANEL_W)

            # Update history
            prev_nk_x = smooth_nk_x
            prev_nk_y = smooth_nk_y
            prev_nk_width = smooth_nk_width
            
        if enabled_categories["Earring"] and selected_assets["Earring"] is not None:
            ear_img = selected_assets["Earring"]["img"]
            ear_scale, ear_y_off, _, _ = get_design_params(ear_img)
            # Dynamic earring width: base 0.12 adjusted by design type
            ear_h, ear_w = ear_img.shape[:2]
            ear_ar = ear_w / max(ear_h, 1)
            if ear_ar < 0.8:
                ew = int(fw * 0.10)  # Tall/drop earrings → narrower
                ear_drop = int(fw * 0.08)
            elif ear_ar > 1.5:
                ew = int(fw * 0.15)  # Wide/hoop earrings → wider
                ear_drop = int(fw * 0.12)
            else:
                ew = int(fw * 0.12)  # Normal studs
                ear_drop = int(fw * 0.1)
            # Adjusting earring position relative to face width for better fit
            if show_left_earring:
                overlay_png(frame, ear_img, le_x - ew//2 - int(fw*0.05), le_y + ear_drop, ew, LEFT_PANEL_W, w-RIGHT_PANEL_W)
            if show_right_earring:
                overlay_png(frame, ear_img, re_x - ew//2 + int(fw*0.05), re_y + ear_drop, ew, LEFT_PANEL_W, w-RIGHT_PANEL_W)
            
        if enabled_categories["Nosepin"] and selected_assets["Nosepin"] is not None:
            np_img = selected_assets["Nosepin"]["img"]
            np_h, np_w = np_img.shape[:2]
            np_ar = np_w / max(np_h, 1)
            # Dynamic nosepin sizing based on proportions
            if np_ar > 1.5:
                nw = int(fw * 0.14)  # Wider nosepin designs
            elif np_ar < 0.7:
                nw = int(fw * 0.10)  # Tall/dangling nosepins
            else:
                nw = int(fw * 0.12)  # Standard studs
            overlay_png(frame, np_img, ns_x - nw//2, ns_y - nw//4, nw, LEFT_PANEL_W, w-RIGHT_PANEL_W)
    else:
        smoother.reset()
        feedback_msg = "Align your face to begin"
        feedback_type = "neutral"

    # Save a clean copy of the frame before drawing the UI (if we aren't already frozen)
    if not is_frozen and frame is not None and uploaded_image is None:
        last_captured_frame = frame.copy()

    draw_ui(frame)
    cv2.imshow("Virtual Try-On", frame)
    key = cv2.waitKey(1)
    if key == 27: break
    if ord('1') <= key <= ord('3'):
        current_category = categories[key - ord('1')]

cap.release()  # type: ignore
cv2.destroyAllWindows()  # type: ignore