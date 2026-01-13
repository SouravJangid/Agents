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

        # Clamp and convert to int
        h_img, w_img = img.shape[:2]
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(w_img, int(x1)), min(h_img, int(y1))

        if x1 <= x0 or y1 <= y0:
            return {"error": "Invalid bbox dimensions"}

        # Crop
        crop = img[y0:y1, x0:x1]
        
        # 1. Grayscale
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        
        # 2. Adaptive Thresholding to mask text pixels
        # Using Gaussian adaptive thresholding
        mask = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY, 11, 2)
        
        # Heuristic to check if mask needs inversion (assume background is more frequent)
        if np.mean(mask) < 127:
            mask = cv2.bitwise_not(mask)
            
        # Background is usually white in the mask (255), Text is black (0)
        # But we want Text as the foreground. Let's make Text=255 for calculation.
        text_mask = cv2.bitwise_not(mask)
        bg_mask = mask
        
        # 3. Calculate Colors
        # Mean background color
        bg_color_bgr = cv2.mean(crop, mask=bg_mask)[:3]
        bg_color = f"rgb({int(bg_color_bgr[2])},{int(bg_color_bgr[1])},{int(bg_color_bgr[0])})"
        
        # Mean text color
        text_color_bgr = cv2.mean(crop, mask=text_mask)[:3]
        text_count = cv2.countNonZero(text_mask)
        
        if text_count > 0:
            text_color = f"rgb({int(text_color_bgr[2])},{int(text_color_bgr[1])},{int(text_color_bgr[0])})"
        else:
            text_color = bg_color

        # 4. Gradient Detection
        # Sample top and bottom rows of background
        top_slice = crop[0:max(1, int(crop.shape[0]*0.2)), :]
        bot_slice = crop[min(crop.shape[0]-1, int(crop.shape[0]*0.8)):, :]
        
        bg_top_bgr = cv2.mean(top_slice)[:3]
        bg_bot_bgr = cv2.mean(bot_slice)[:3]
        
        bg_top = f"rgb({int(bg_top_bgr[2])},{int(bg_top_bgr[1])},{int(bg_top_bgr[0])})"
        bg_bottom = f"rgb({int(bg_bot_bgr[2])},{int(bg_bot_bgr[1])},{int(bg_bot_bgr[0])})"
        
        is_gradient = any(abs(bg_top_bgr[i] - bg_bot_bgr[i]) > 15 for i in range(3))

        total_area = (x1 - x0) * (y1 - y0)
        
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
            "pixelDensity": f"{(text_count / total_area):.3f}"
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
