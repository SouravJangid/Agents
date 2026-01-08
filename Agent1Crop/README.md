# Agent1Crop - Intelligent Image Batch Cropper

An automated tool to process image batches, intelligently distinguishing between mobile and desktop screenshots to apply optimized bottom-crops (removing UI bars/footers) and converting them to high-performance WebP format.

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` (comes with Node.js)

### 2. Installation
```bash
# Clone the repository (if downloading from GitHub)
git clone <repository-url>
cd Agent1Crop

# Install dependencies
npm install
```

### 3. Usage
1.  **Prepare Inputs**: Place your images or `.zip` archives containing images into the `uploads` folder.
2.  **Run the Batch**:
    ```bash
    npm start
    ```
3.  **Check Results**: Your processed `.webp` files will be available in the `outputs` folder, maintaining the original directory structure.

## ⚙️ Configuration
You can customize the behavior of the tool via `config.json` in the root directory.

```json
{
  "paths": {
    "uploadDir": "./uploads",
    "outputDir": "./outputs"
  },
  "processing": {
    "validExtensions": [".jpg", ".jpeg", ".png", ".webp"],
    "outputFormat": "png",
    "quality": 80,
    "effort": 4,
    "compressionLevel": 9
  },
  "profiles": {
    "mobile": {
      "aspectRatioThreshold": 1.6,
      "bottomCropPercent": 0.05
    },
    "desktop": {
      "bottomCropPercent": 0.09
    }
  }
}
```

- **uploadDir**: Where the script looks for files.
- **outputDir**: Where processed files are saved.
- **outputFormat**: The desired output format (`png`, `webp`, `jpg`).
- **quality**: Compression quality for `webp`/`jpg` (0-100).
- **compressionLevel**: zlib compression level for `png` (0-9).
- **effort**: CPU effort for compression (0-6).
- **aspectRatioThreshold**: Images with height/width ratio above this are treated as "Mobile".
- **bottomCropPercent**: Percentage of the image height to remove from the bottom.

## 🧠 How it Works
1.  **Traversal**: Recursively scans the `uploads` folder.
2.  **ZIP Handling**: Automatically extracts `.zip` files, processes the images inside, and re-compresses them into the output folder.
3.  **Agent Logic**: For each image, an "Agent" checks the aspect ratio.
    - **Mobile Profile**: Smaller crop (5%) to remove software buttons/dock.
    - **Desktop Profile**: Larger crop (9%) to remove browser footers and site-specific bars.
4.  **Optimization**: Uses the high-performance `sharp` library for lightning-fast processing and converting to the chosen format (PNG, WebP, etc.).

## 🛠 Project Structure
- `src/runBatch.js`: Entry point.
- `src/agent/`: Intelligence layer deciding crop strategies.
- `src/batch/`: Logic for folder traversal and zip processing.
- `src/services/`: Core image manipulation using `sharp`.
- `src/utils/`: Helper functions for ZIP operations.
