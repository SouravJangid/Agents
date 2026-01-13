# Eduqard AI Agents 🤖

A powerful, 3-stage automated pipeline designed for batch image processing. This system can take a collection of screenshots (or ZIP files), crop them, detect specific keywords (like "mobbin"), extract their exact design style using Computer Vision, and replace them with new text (like "eduqard") while perfectly matching the original background and font.

---

## 🚀 The 3-Stage Workflow

### 1. Agent1Crop (Pre-processing)
*   **Purpose**: Recursively scans the `uploads` folder for images and ZIP files.
*   **Action**: Unzips content, applies intelligent cropping profiles (Mobile/Desktop), and saves results to `OutputsDuringWorking/Agent1Crop`.
*   **Key Feature**: Automatic timestamping in **Indian Standard Time (IST)**.

### 2. Agent_qard_ocr (Detection & Style Extraction)
*   **Purpose**: Uses **Tesseract.js** for text location and **OpenCV (Python)** for design analysis.
*   **Action**: Locates keywords and extracts:
    *   `textColor` & `bgColor` (using bitwise masking).
    *   `isGradient` (detects vertical background gradients).
    *   `fontSize` & `weight` (heuristic analysis).
    *   `sources` (metadata showing if values were detected or snapped to pure white).
*   **Output**: Generates a detailed `indexing.json` file.

### 3. Agent3 (Inpainting & Replacement)
*   **Purpose**: Final image manipulation.
*   **Action**: 
    1.  **Remove**: Expands the bounding box by 5px and "paints out" the old text using the detected background/gradient.
    2.  **Replace**: Renders new text in the exact same position using the extracted style.
*   **Output**: Stores final images in the root `outputs/` folder.

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed:
*   **Node.js** (v18 or higher)
*   **Python 3.9+**
*   **OpenCV** & **NumPy** (for Design Detection):
    ```bash
    pip3 install opencv-python numpy
    ```

---

## 📦 Setup & Installation

Clone the repository and install dependencies for each agent:

### 1. Setup Crop Agent
```bash
cd Agent1Crop
npm install
```

### 2. Setup OCR Agent
```bash
cd ../Agent_qard_ocr
npm install
```

### 3. Setup Agent3
```bash
cd ../Agent3
npm install
```

---

## 📖 Usage Guide

### Step 1: Prepare your data
Place your images or ZIP files into the root `uploads/` folder.

### Step 2: Run the Crop Agent
This will prepare the images for OCR.
```bash
cd Agent1Crop
npm start
```
*Output: `OutputsDuringWorking/Agent1Crop/<timestamp>-IST/`*

### Step 3: Run the OCR Agent
This will detect the text design. It automatically finds the latest folder from Step 2.
```bash
cd ../Agent_qard_ocr
npm start
```
*Output: `OutputsDuringWorking/Agent_qard_ocr/<timestamp>-IST/indexing.json`*

### Step 4: Run Agent3 (The Final Stage)
This will perform the text replacement. It automatically finds the latest data from Step 3.
```bash
cd ../Agent3
npm start
```
*Output: Check the root `outputs/` folder for your final images.*

---

## 📂 Folder Structure
*   `/uploads`: Input folder for raw images/ZIPs.
*   `/outputs`: Final destination for processed images (delivery only).
*   `/OutputsDuringWorking`: Transparent history of every run.
    *   `Agent1Crop/`: Historical crops.
    *   `Agent_qard_ocr/`: OCR metadata and indexing.
    *   `Agent3/`: Intermediate blocks (images with text removed vs replaced).

---

## 📍 Configuration
You can change the target keywords or replacement text in the respective `config.json` files:
*   **Keywords to find**: `Agent_qard_ocr/config.json`
*   **Words to replace**: `Agent3/config.json` (e.g., change `targetWord` from "mobbin" to "eduqard")

---

## ⚖️ License
Internal Use - Eduqard Project.
