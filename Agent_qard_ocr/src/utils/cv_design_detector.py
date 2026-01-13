import cv2
import numpy as np
import sys
import json
import os

def detect_design(image_path, x0, y0, x1, y1):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return {"error": "Could not read image"}

        h_img, w_img = img.shape[:2]
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(w_img, int(x1)), min(h_img, int(y1))

        if x1 <= x0 or y1 <= y0:
            return {"error": "Invalid bbox dimensions"}

        crop = img[y0:y1, x0:x1]
        h, w = crop.shape[:2]
        
        # Sources tracking
        sources = {}
        
        # 1. Grayscale for masking
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        
        # 2. Strict Adaptive Thresholding
        mask = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY, 11, 5)
        
        if np.mean(mask) < 127:
            mask = cv2.bitwise_not(mask)
            
        bg_mask = mask
        text_mask = cv2.bitwise_not(mask)
        
        # 3. BACKGROUND CALCULATION
        # Sample corners very conservatively
        corner_pixels = []
        c_p = 3 # 3 pixel margin
        corner_pixels.append(crop[0:c_p, 0:c_p])
        corner_pixels.append(crop[0:c_p, w-c_p:w])
        corner_pixels.append(crop[h-c_p:h, 0:c_p])
        corner_pixels.append(crop[h-c_p:h, w-c_p:w])
        
        flat_corners = np.concatenate([c.reshape(-1, 3) for c in corner_pixels])
        bg_color_bgr = np.median(flat_corners, axis=0)
        sources["bgColor"] = "detected"
        
        # Whiteness snap
        if all(val > 245 for val in bg_color_bgr):
            bg_color_bgr = [255, 255, 255]
            sources["bgColor"] = "snapped_to_white"
            
        bg_color = f"rgb({int(bg_color_bgr[2])},{int(bg_color_bgr[1])},{int(bg_color_bgr[0])})"
        
        # 4. TEXT COLOR CALCULATION
        inner_text_mask = cv2.erode(text_mask, np.ones((2,2), np.uint8), iterations=1)
        if cv2.countNonZero(inner_text_mask) < 5:
            inner_text_mask = text_mask
            
        text_color_bgr = cv2.mean(crop, mask=inner_text_mask)[:3]
        text_color = f"rgb({int(text_color_bgr[2])},{int(text_color_bgr[1])},{int(text_color_bgr[0])})"
        sources["textColor"] = "detected"

        # 5. GRADIENT DETECTION
        top_color_bgr = cv2.mean(crop[0:2, :], mask=bg_mask[0:2, :])[:3]
        bot_color_bgr = cv2.mean(crop[h-2:h, :], mask=bg_mask[h-2:h, :])[:3]
        
        sources["bgTop"] = "detected"
        sources["bgBottom"] = "detected"

        # If mean failed (empty mask), use bg_color
        if any(np.isnan(v) for v in top_color_bgr): 
            top_color_bgr = bg_color_bgr
            sources["bgTop"] = "fallback_to_bg"
        if any(np.isnan(v) for v in bot_color_bgr): 
            bot_color_bgr = bg_color_bgr
            sources["bgBottom"] = "fallback_to_bg"
        
        # Whiteness snap for gradient points
        if all(v > 250 for v in top_color_bgr): 
            top_color_bgr = [255,255,255]
            sources["bgTop"] = "snapped_to_white"
        if all(v > 250 for v in bot_color_bgr): 
            bot_color_bgr = [255,255,255]
            sources["bgBottom"] = "snapped_to_white"
        
        bg_top = f"rgb({int(top_color_bgr[2])},{int(top_color_bgr[1])},{int(top_color_bgr[0])})"
        bg_bottom = f"rgb({int(bot_color_bgr[2])},{int(bot_color_bgr[1])},{int(bot_color_bgr[0])})"
        
        diff = np.abs(np.array(top_color_bgr) - np.array(bot_color_bgr))
        is_gradient = bool(np.any(diff > 5))

        # Other heuristics
        sources["fontSize"] = "heuristic_0.75h"
        sources["weight"] = "heuristic_density"
        sources["isItalic"] = "default_false"

        total_area = h * w
        text_count = cv2.countNonZero(text_mask)
        
        return {
            "textColor": text_color,
            "bgColor": bg_color,
            "fontSize": int((y1 - y0) * 0.75),
            "weight": "700" if (text_count / total_area) > 0.25 else "500",
            "isItalic": False,
            "isGradient": is_gradient,
            "bgTop": bg_top,
            "bgBottom": bg_bottom,
            "textArea": int(text_count),
            "pixelDensity": f"{(text_count / total_area):.3f}",
            "sources": sources
        }

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print(json.dumps({"error": "Usage: script.py img_path x0 y0 x1 y1"}))
        sys.exit(1)
        
    path = sys.argv[1]
    _x0, _y0, _x1, _y1 = map(float, sys.argv[2:6])
    
    result = detect_design(path, _x0, _y0, _x1, _y1)
    print(json.dumps(result))
