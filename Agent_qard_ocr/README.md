# Agent_qard_ocr - Intelligent OCR Keyword Detector

An automated tool to scan image batches for specific keywords using Tesseract OCR. It generates a detailed JSON report with keyword matches, bounding boxes, and confidence scores.

## 🚀 Getting Started

### 1. Installation
The agent is located in the `Agent_qard_ocr` folder.
```bash
cd Agent_qard_ocr
npm install
```

### 2. Usage
1.  **Configure**: Update `config.json` with your target image folder and the keywords you want to detect.
2.  **Run the Batch**:
    ```bash
    npm start
    ```

## ⚙️ Architecture
- `src/runOcr.js`: Main entry point for batch processing.
- `src/agent/ocrAgent.js`: Orchestrates OCR and formats results.
- `src/services/ocrService.js`: Core Tesseract interaction logic.
- `src/utils/normalizationUtils.js`: The "brain" that cleans OCR text for high-precision matching.
- `src/utils/indexStore.js`: Organizes results into a nested AppId -> VariantId structure.

## 🧠 Core Features & Logic

### 1. Deep Normalization
Handles noisy OCR data by translating visual character errors (e.g., `0` -> `o`) and stripping special characters. This ensures "mobbin" is detected even if the OCR reads it as `M0bb1n!`.

### 2. Nested App/Variant Indexing
Automatically parses folder names into a structured hierarchy:
- **AppId**: Parent application name (e.g., "7-Eleven").
- **VariantId**: Device/Date/Platform details (e.g., "ios Sep 2025").

### 3. Pure Index Workflow
Zero intermediate reports or sidecar files. The `keyword_index.json` is the single source of truth, optimized for direct database intake or frontend display.

## ⚖️ Pros & Cons

### ✅ Benefits
- **Zero Storage Bloat**: No massive text reports or hidden tracking files.
- **Search Optimization**: Instant lookup by keyword, app, or variant without parsing images.
- **High Recall**: Normalization finds matches that standard string-matching would miss.
- **Clean Project**: A very small footprint in your workspace.

### ❌ Considerations (Cons)
- **Full Scans**: Without tracking, the agent re-analyzes every image in the source folder on every run.
- **No Full-Text Backup**: If you remove a keyword, you cannot "search later" without re-running the OCR, as we don't save the raw OCR text.
