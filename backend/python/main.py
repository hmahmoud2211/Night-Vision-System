import base64
import io
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

app = FastAPI(title="Night Vision Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"]
    ,
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


def to_numpy(image: Image.Image) -> np.ndarray:
    if image.mode != "RGB":
        image = image.convert("RGB")
    return np.asarray(image).astype(np.float32)


def stretch_contrast(rgb: np.ndarray, low_pct: float = 1.0, high_pct: float = 99.0) -> np.ndarray:
    # Per-channel contrast stretch based on percentiles to avoid blowing highlights.
    result = np.empty_like(rgb)
    for ch in range(3):
        channel = rgb[..., ch]
        lo = np.percentile(channel, low_pct)
        hi = np.percentile(channel, high_pct)
        if hi <= lo:
            result[..., ch] = channel
            continue
        stretched = (channel - lo) / (hi - lo)
        stretched = np.clip(stretched, 0, 1) * 255.0
        result[..., ch] = stretched
    return result


def adaptive_histogram_equalization(rgb: np.ndarray, clip_limit: float = 3.0, intensity: float = 1.0) -> np.ndarray:
    # Per-channel CLAHE (Contrast Limited Adaptive Histogram Equalization)
    # intensity: 0.0 = no effect, 1.0 = normal, 2.0 = double strength
    result = np.empty_like(rgb)
    for ch in range(3):
        channel = rgb[..., ch].astype(np.uint8)
        # Simple tile-based adaptive equalization
        h, w = channel.shape
        tile_h, tile_w = h // 8, w // 8
        
        equalized = np.zeros_like(channel, dtype=np.float32)
        for i in range(8):
            for j in range(8):
                y1, y2 = i * tile_h, (i + 1) * tile_h if i < 7 else h
                x1, x2 = j * tile_w, (j + 1) * tile_w if j < 7 else w
                tile = channel[y1:y2, x1:x2]
                
                # Histogram equalization on tile
                hist, bins = np.histogram(tile.flatten(), 256, [0, 256])
                cdf = hist.cumsum()
                cdf_normalized = cdf * 255 / cdf[-1] if cdf[-1] > 0 else cdf
                equalized[y1:y2, x1:x2] = cdf_normalized[tile]
        
        result[..., ch] = equalized
    
    # Blend with original based on intensity
    if intensity < 1.0:
        result = rgb * (1.0 - intensity) + result * intensity
    elif intensity > 1.0:
        # Amplify the effect
        result = rgb + (result - rgb) * intensity
    
    return np.clip(result, 0, 255)


def multi_scale_retinex(rgb: np.ndarray, sigmas: list = [15, 80, 250], intensity: float = 1.0) -> np.ndarray:
    # Multi-Scale Retinex for low-light enhancement
    # intensity: 0.0 = no effect, 1.0 = normal, 2.0 = double strength
    def single_scale_retinex(channel, sigma):
        from scipy.ndimage import gaussian_filter
        blurred = gaussian_filter(channel.astype(np.float32), sigma=sigma)
        # Avoid log(0)
        safe_channel = np.maximum(channel, 1.0)
        safe_blurred = np.maximum(blurred, 1.0)
        return np.log(safe_channel) - np.log(safe_blurred)
    
    result = np.zeros_like(rgb, dtype=np.float32)
    for ch in range(3):
        channel = rgb[..., ch]
        msr = np.zeros_like(channel, dtype=np.float32)
        for sigma in sigmas:
            msr += single_scale_retinex(channel, sigma)
        msr /= len(sigmas)
        result[..., ch] = msr
    
    # Normalize to 0-255
    result = (result - result.min()) / (result.max() - result.min() + 1e-8) * 255.0
    
    # Blend with original based on intensity
    if intensity < 1.0:
        result = rgb * (1.0 - intensity) + result * intensity
    elif intensity > 1.0:
        # Amplify the effect
        result = rgb + (result - rgb) * intensity
    
    return np.clip(result, 0, 255)


def log_enhance(rgb: np.ndarray, c: float = 2.8, intensity: float = 1.0) -> np.ndarray:
    # Stronger log transform, then contrast stretch for a cleaner appearance.
    # intensity: 0.0 = no effect, 1.0 = normal, 2.0 = double strength
    safe = np.maximum(rgb, 1.0)
    enhanced = c * intensity * np.log1p(safe)
    enhanced = enhanced / enhanced.max() * 255.0
    enhanced = stretch_contrast(enhanced, low_pct=1.5, high_pct=98.5)
    
    # Blend with original based on intensity
    if intensity < 1.0:
        enhanced = rgb * (1.0 - intensity) + enhanced * intensity
    
    return np.clip(enhanced, 0, 255)


def mean_luminance(rgb: np.ndarray) -> float:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return float(np.mean(0.299 * r + 0.587 * g + 0.114 * b))


def numpy_to_image(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(arr.astype(np.uint8))


def to_gray(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return 0.299 * r + 0.587 * g + 0.114 * b


def frame_difference(prev: np.ndarray, curr: np.ndarray, diff_threshold: float, motion_ratio: float) -> dict:
    # Resize to match if shapes differ
    if prev.shape != curr.shape:
        h = min(prev.shape[0], curr.shape[0])
        w = min(prev.shape[1], curr.shape[1])
        prev = prev[:h, :w]
        curr = curr[:h, :w]

    prev_gray = to_gray(prev)
    curr_gray = to_gray(curr)
    
    # Adaptive threshold based on image brightness
    avg_brightness = np.mean(curr_gray)
    adaptive_threshold = diff_threshold
    if avg_brightness < 50:  # Dark scene
        adaptive_threshold *= 0.7  # More sensitive in dark
    elif avg_brightness > 150:  # Bright scene
        adaptive_threshold *= 1.3  # Less sensitive in bright
    
    # Calculate frame difference
    diff = np.abs(curr_gray - prev_gray)
    
    # Apply Gaussian blur to reduce noise sensitivity
    from scipy.ndimage import gaussian_filter
    diff_smoothed = gaussian_filter(diff, sigma=2.0)
    
    # Create region of interest mask (center 60% of image gets higher weight)
    h, w = diff.shape
    roi_mask = np.zeros_like(diff)
    y1, y2 = int(h * 0.2), int(h * 0.8)
    x1, x2 = int(w * 0.2), int(w * 0.8)
    roi_mask[y1:y2, x1:x2] = 2.0  # Center region weighted 2x
    roi_mask[roi_mask == 0] = 1.0  # Edges weighted 1x
    
    # Apply ROI weighting
    weighted_diff = diff_smoothed * roi_mask
    
    # Detect motion with adaptive threshold
    moving = weighted_diff > adaptive_threshold
    motion_pixels = np.count_nonzero(moving)
    total_pixels = moving.size
    ratio = motion_pixels / total_pixels if total_pixels else 0.0
    
    # Calculate motion magnitude (average difference in moving regions)
    motion_magnitude = np.mean(diff[moving]) if motion_pixels > 0 else 0.0
    
    # Smart detection: require both sufficient pixel ratio AND motion magnitude
    significant_motion = ratio >= motion_ratio and motion_magnitude > (adaptive_threshold * 0.5)
    
    # Calculate center of motion for tracking
    if motion_pixels > 0:
        y_coords, x_coords = np.where(moving)
        center_x = int(np.mean(x_coords))
        center_y = int(np.mean(y_coords))
        motion_center = {"x": center_x / w, "y": center_y / h}  # Normalized coordinates
    else:
        motion_center = None

    return {
        "motion": bool(significant_motion),
        "diff_ratio": ratio,
        "motion_magnitude": float(motion_magnitude),
        "adaptive_threshold": float(adaptive_threshold),
        "motion_ratio": motion_ratio,
        "avg_brightness": float(avg_brightness),
        "motion_center": motion_center,
        "confidence": float(min(1.0, (ratio / motion_ratio) * (motion_magnitude / adaptive_threshold))) if significant_motion else 0.0,
    }


@app.post("/enhance")
async def enhance_image(
    file: UploadFile = File(...),
    luminance_threshold: float = 70.0,
    log_gain: float = 3.0,
    mode: str = "log",
    intensity: float = 1.0,
):
    """Enhancement modes: log, clahe, retinex, all
    intensity: 0.0 (no effect) to 2.0 (double strength), default 1.0"""
    content = await file.read()
    image = Image.open(io.BytesIO(content))
    data = to_numpy(image)

    lum = mean_luminance(data)
    enhanced_data = data
    
    if lum < luminance_threshold:
        if mode == "log":
            enhanced_data = log_enhance(data, c=log_gain, intensity=intensity)
        elif mode == "clahe":
            enhanced_data = adaptive_histogram_equalization(data, clip_limit=3.0, intensity=intensity)
        elif mode == "retinex":
            enhanced_data = multi_scale_retinex(data, sigmas=[15, 80, 250], intensity=intensity)
        elif mode == "all":
            # Combine all three for maximum enhancement
            temp = log_enhance(data, c=log_gain, intensity=intensity)
            temp = adaptive_histogram_equalization(temp, clip_limit=2.5, intensity=intensity)
            enhanced_data = multi_scale_retinex(temp, sigmas=[10, 50, 150], intensity=intensity)
        else:
            enhanced_data = log_enhance(data, c=log_gain, intensity=intensity)

    enhanced = numpy_to_image(enhanced_data)
    buf = io.BytesIO()
    enhanced.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")

    return {
        "applied": lum < luminance_threshold,
        "luminance": lum,
        "mode": mode,
        "intensity": intensity,
        "image_base64": encoded,
    }


@app.post("/motion")
async def detect_motion(
    current: UploadFile = File(...),
    previous: UploadFile = File(...),
    diff_threshold: float = Form(25.0),
    motion_ratio: float = Form(0.02),
):
    """Frame differencing motion detection.

    - diff_threshold: per-pixel intensity difference (0-255) to consider a pixel as changed
    - motion_ratio: fraction of pixels that must exceed diff_threshold to flag motion
    """

    curr_bytes = await current.read()
    prev_bytes = await previous.read()

    curr_img = Image.open(io.BytesIO(curr_bytes))
    prev_img = Image.open(io.BytesIO(prev_bytes))

    curr_np = to_numpy(curr_img)
    prev_np = to_numpy(prev_img)

    result = frame_difference(prev_np, curr_np, diff_threshold, motion_ratio)
    return result
