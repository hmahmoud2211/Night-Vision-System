# Night Vision System

A real-time night vision and motion detection security system built with React Native (Expo) and Python FastAPI. Features advanced image enhancement algorithms for low-light conditions and intelligent motion detection with audio alerts.

## 🌟 Features

### Image Enhancement
- **4 Enhancement Modes:**
  - **Log Transform**: Logarithmic brightness enhancement with contrast stretching
  - **CLAHE**: Contrast Limited Adaptive Histogram Equalization for local contrast enhancement
  - **Multi-Scale Retinex (MSR)**: Advanced illumination-invariant enhancement using gaussian filtering
  - **All Combined**: Sequential application of all three algorithms for maximum enhancement

### Motion Detection
- **Frame Differencing Algorithm**: Real-time motion detection by comparing consecutive camera frames
- **Configurable Sensitivity**: Adjustable threshold and motion ratio parameters
- **Audio Alerts**: Automatic sound playback when motion is detected
- **Haptic Feedback**: Vibration alerts on motion detection

### User Interface
- **5 Visual Modes**: None, Gamma, Contrast, CLAHE, Full - each with distinct visual overlays
- **Mode-Specific Overlays**: Color-coded scan lines and overlays for each enhancement mode
- **Real-Time Camera Feed**: Live camera preview with enhancement processing
- **Responsive Controls**: Easy mode switching and settings adjustment
- **Animated Intro & HUD**: Polished introduction and live telemetry overlays
- **Enhanced Preview**: Periodic enhanced frame preview for validation

## 🏗️ Architecture

### Frontend (React Native + Expo)
- **Framework**: Expo SDK ~54.0.25
- **Language**: TypeScript ~5.9.2
- **State Management**: Zustand
- **API Layer**: TRPC v11 with React Query v5
- **Camera**: expo-camera v17
- **Audio**: expo-av for alert sounds
- **Navigation**: expo-router v6

### Backend (Python + FastAPI)
- **Framework**: FastAPI 0.115.5
- **Server**: Uvicorn 0.32.1 with auto-reload
- **Image Processing**: 
  - NumPy 2.1.3 for array operations
  - Pillow 10.4.0 for image I/O
  - SciPy 1.14.1 for gaussian filtering
- **API**: RESTful endpoints with multipart/form-data support
- **Telemetry Analysis**: Live image quality metrics and recommended enhancement modes
- **Adaptive Motion Modeling**: Background modeling with confidence scoring and object clustering

## 📋 Prerequisites

- **Node.js**: v18+ with npm
- **Python**: 3.13.2 or compatible
- **Mobile Device**: iOS/Android device with Expo Go app (for testing)
- **Operating System**: Windows, macOS, or Linux

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/hmahmoud2211/Night-Vision-System.git
cd Night_Vision_System
```

### 2. Frontend Setup
```bash
# Install dependencies (use --legacy-peer-deps for React 19 compatibility)
npm install --legacy-peer-deps

# Install additional required packages
npm install --legacy-peer-deps expo-av expo-camera expo-haptics
```

### 3. Backend Setup
```bash
# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Windows CMD:
.\.venv\Scripts\activate.bat
# macOS/Linux:
source .venv/bin/activate

# Install Python dependencies
cd backend/python
pip install -r requirements.txt
```

## 🎮 Usage

### Backend AI Key (.env)
Create a `.env` file in backend/python with your Groq API key:
```bash
GROQ_API_KEY=your_groq_api_key_here
```
Do not commit this file.

### Start the Backend Server
```bash
# Navigate to backend directory
cd backend/python

# Run with auto-reload (development)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Server will be available at http://localhost:8000
# API documentation at http://localhost:8000/docs
```

### Start the Frontend App
```bash
# From project root directory
npx expo start

# Options:
# - Press 'a' for Android emulator
# - Press 'i' for iOS simulator
# - Scan QR code with Expo Go app on physical device
```

### Configure API Endpoint (Optional)
Set the backend URL in your environment:
```bash
# Create .env file in project root
EXPO_PUBLIC_RORK_API_BASE_URL=http://YOUR_IP_ADDRESS:8000
```
Replace `YOUR_IP_ADDRESS` with your machine's local IP (use `ipconfig` on Windows or `ifconfig` on macOS/Linux).

## 🔌 API Endpoints

### Health Check
```http
GET /health
```
Returns server status.

### Status
```http
GET /status
```
Returns server version and background model frames.

**Response:**
```json
{
  "status": "ok"
}
```

### Image Enhancement
```http
POST /enhance
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): Image file to enhance
- `luminance_threshold` (optional, default: 70.0): Only enhance if mean brightness < threshold
- `log_gain` (optional, default: 3.0): Brightness multiplier for log mode
- `mode` (optional, default: "log"): Enhancement algorithm
  - `"log"`: Log transform with contrast stretching
  - `"clahe"`: Adaptive histogram equalization
  - `"retinex"`: Multi-Scale Retinex
  - `"all"`: Combined enhancement (log → CLAHE → MSR)

**Response:**
```json
{
  "applied": true,
  "luminance": 45.3,
  "mode": "retinex",
  "image_base64": "iVBORw0KGgoAAAANSUhEUg..."
}
```

### Telemetry Analysis
```http
POST /analyze
Content-Type: multipart/form-data
```
Returns luminance, noise, contrast, sharpness, dynamic range, and recommended mode.

### Motion Detection
```http
POST /motion
Content-Type: multipart/form-data
```

**Parameters:**
- `current` (required): Current frame image file
- `previous` (required): Previous frame image file
- `diff_threshold` (optional, default: 25.0): Pixel difference threshold (0-255)
- `motion_ratio` (optional, default: 0.02): Minimum fraction of changed pixels (0.02 = 2%)

**Response:**
```json
{
  "motion": true,
  "diff_ratio": 0.0453,
  "diff_threshold": 25.0,
  "motion_ratio": 0.02
}
```

### Calibrate Background Model
```http
POST /calibrate
```
Resets the adaptive background model for motion detection.

## 🧪 Enhancement Algorithms Explained

### 1. Log Transform
Logarithmic transformation compresses the dynamic range, brightening dark regions while preserving highlights.

**Formula:** `enhanced = c × log(1 + pixel_value)`

**Use Case:** General low-light enhancement, good for moderately dark scenes.

### 2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
Divides image into tiles and equalizes histogram within each tile independently.

**Process:**
1. Split image into 8×8 grid
2. Compute histogram for each tile
3. Redistribute pixel values to spread across full range
4. Apply clip limit to prevent over-amplification

**Use Case:** Uneven lighting conditions, enhances local contrast.

### 3. Multi-Scale Retinex (MSR)
Separates illumination from reflectance using multiple gaussian blur scales.

**Process:**
1. Apply gaussian blur at scales [15, 80, 250] pixels
2. Compute `log(original) - log(blurred)` for each scale
3. Average the three scales
4. Normalize to 0-255 range

**Use Case:** Extreme low-light, shadow removal, color preservation.

### 4. Combined Mode ("all")
Sequentially applies: Log Transform → CLAHE → Multi-Scale Retinex

**Use Case:** Maximum enhancement for very dark images.

## 🎯 Motion Detection Algorithm

### Frame Differencing
Compares two consecutive frames to detect motion:

1. **Convert to Grayscale**: `gray = 0.299×R + 0.587×G + 0.114×B`
2. **Compute Difference**: `diff = |current_gray - previous_gray|`
3. **Threshold**: Flag pixels where `diff > diff_threshold`
4. **Motion Ratio**: Motion detected if `(flagged_pixels / total_pixels) >= motion_ratio`

**Parameters:**
- `diff_threshold`: 25.0 (out of 255) - filters camera noise
- `motion_ratio`: 0.02 (2%) - minimum area change to trigger alert

## 📱 Frontend Features

### Camera Integration
- Live camera feed using `expo-camera`
- Automatic frame capture every 1 second
- Base64 encoding for API transmission

### Mode-Specific Visual Overlays
| Mode | Color | Effect |
|------|-------|--------|
| None | - | No overlay |
| Gamma | Green | Green tint with scan lines |
| Contrast | Cyan | Cyan overlay, high opacity |
| CLAHE | Purple | Purple tint with animated scan |
| Full | Blue-Green | Multi-layer gradient overlay |

### Alert System
- **Sound**: Plays alert audio via expo-av when motion detected
- **Haptics**: Vibration feedback on motion events
- **Visual**: Mode-specific color overlays indicate enhancement status

## 🛠️ Development

### Project Structure
```
Night_Vision_System/
├── app/                      # Expo Router pages
│   ├── (tabs)/              # Tab navigation
│   │   ├── index.tsx        # Main camera screen
│   │   ├── settings.tsx     # Settings page
│   │   └── _layout.tsx      # Tab layout
│   ├── _layout.tsx          # Root layout with TRPC provider
│   └── modal.tsx            # Modal screen
├── backend/
│   ├── python/              # FastAPI backend
│   │   ├── main.py          # API endpoints and algorithms
│   │   └── requirements.txt # Python dependencies
│   └── trpc/                # TRPC router (optional)
│       └── app-router.ts    # Type-safe API definitions
├── components/              # Reusable React components
├── constants/               # App constants (colors, etc.)
├── lib/                     # Utilities
│   └── trpc.ts             # TRPC client configuration
├── assets/                  # Images, fonts, sounds
├── package.json            # Node dependencies
└── tsconfig.json           # TypeScript configuration
```

### Running in Development
Both servers support hot-reload:
- **Backend**: Auto-reloads on Python file changes (uvicorn --reload)
- **Frontend**: Fast refresh on component changes (Expo)

### TypeScript Configuration
The project uses strict TypeScript with:
- `strict: true` for type safety
- Path mapping for clean imports
- Expo type definitions

## 🐛 Troubleshooting

### Common Issues

**1. Scipy Import Error**
```bash
# Ensure scipy is installed in virtual environment
pip install scipy==1.14.1
```

**2. React 19 Peer Dependency Warnings**
```bash
# Use --legacy-peer-deps flag
npm install --legacy-peer-deps
```

**3. Backend Connection Failed**
- Verify backend is running on port 8000
- Check firewall settings
- Use correct IP address (not localhost if testing on physical device)
- Set `EXPO_PUBLIC_RORK_API_BASE_URL` environment variable

**4. Camera Permission Denied**
- Grant camera permissions in device settings
- Expo Go app requires camera access

**5. Motion Detection 422 Errors**
- Ensure FormData uses File objects, not Blobs
- Verify MIME types are set correctly (image/png)

### Debug Mode
Enable backend logging:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
```

## 📊 Performance Considerations

### Enhancement Processing Time
- **Log Transform**: ~50ms (fastest)
- **CLAHE**: ~200ms (moderate)
- **Multi-Scale Retinex**: ~500ms (slowest, requires gaussian filtering)
- **Combined Mode**: ~750ms (sequential processing)

### Optimization Tips
- Use lower resolution images for faster processing
- Reduce `sigmas` count in Retinex for speed
- Adjust `luminance_threshold` to skip unnecessary enhancements
- Use `"log"` mode for real-time applications

### Motion Detection Performance
- Frame differencing: ~30ms per comparison
- Recommended capture interval: 1 second (balances detection accuracy and performance)

## 📄 Dependencies

### Frontend
```json
{
  "expo": "~54.0.25",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo-router": "~6.0.15",
  "@tanstack/react-query": "^5.90.12",
  "@trpc/client": "^11.7.2",
  "expo-camera": "~17.0.10",
  "expo-av": "~16.0.14",
  "expo-haptics": "~15.0.1"
}
```

### Backend
```txt
fastapi==0.115.5
uvicorn==0.32.1
pillow==10.4.0
numpy==2.1.3
scipy==1.14.1
python-multipart==0.0.20
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is open source and available under the MIT License.

## 👥 Authors

- **hmahmoud2211** - [GitHub Profile](https://github.com/hmahmoud2211)

## 🙏 Acknowledgments

- Image enhancement algorithms based on computer vision research
- FastAPI for the excellent Python web framework
- Expo team for the React Native development platform
- NumPy and SciPy communities for scientific computing tools

## 📧 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Contact: [Repository Issues](https://github.com/hmahmoud2211/Night-Vision-System/issues)

## 🔮 Future Enhancements

- [ ] Real-time video streaming instead of frame capture
- [ ] Object detection integration (YOLO)
- [ ] Cloud storage for motion events
- [ ] Push notifications for motion alerts
- [ ] Recording and playback functionality
- [ ] Multiple camera support
- [ ] AI-based false positive reduction
- [ ] Web dashboard for monitoring

---

**Built with ❤️ for enhanced security and low-light visibility**
