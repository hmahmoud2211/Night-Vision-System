import base64
import io
import os
import time
import hashlib
from typing import Optional, List
from pathlib import Path

# Load environment variables from .env file (use absolute path)
from dotenv import load_dotenv
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from scipy.ndimage import gaussian_filter, median_filter, uniform_filter, label

# Groq AI integration
try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    Groq = None

app = FastAPI(title="Night Vision Backend", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global background model for adaptive background subtraction
background_model = {
    "mean": None,
    "variance": None,
    "frame_count": 0,
    "learning_rate": 0.05
}

# Simple cache for analysis results to avoid recomputation on identical frames
analysis_cache = {
    "hash": None,
    "result": None,
}

# Groq client singleton
_groq_client = None

def get_groq_client():
    global _groq_client
    if _groq_client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if api_key and GROQ_AVAILABLE:
            _groq_client = Groq(api_key=api_key)
    return _groq_client


# AI Detection payloads
class AIDetectPayload(BaseModel):
    image_base64: str
    detect_classes: List[str] = ["person", "intruder", "weapon", "vehicle", "animal", "suspicious_activity"]
    confidence_threshold: float = 0.5


class AIEnhancePayload(BaseModel):
    image_base64: str
    enhancement_prompt: str = "Enhance this night vision image for better visibility and clarity"


class AIScenePayload(BaseModel):
    image_base64: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    return {
        "status": "ok",
        "version": app.version,
        "background_frames": background_model["frame_count"],
    }


def to_numpy(image: Image.Image) -> np.ndarray:
    if image.mode != "RGB":
        image = image.convert("RGB")
    return np.asarray(image).astype(np.float32)


def downscale_if_needed(image: Image.Image, max_side: Optional[int]) -> Image.Image:
    if not max_side:
        return image
    w, h = image.size
    longest = max(w, h)
    if longest <= max_side:
        return image
    scale = max_side / float(longest)
    new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
    return image.resize(new_size, Image.BILINEAR)


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


def auto_gamma_correction(rgb: np.ndarray) -> np.ndarray:
    """Automatically calculate optimal gamma based on image histogram"""
    gray = to_gray(rgb)
    mean_brightness = np.mean(gray)
    
    # Calculate optimal gamma: dark images need gamma < 1, bright need gamma > 1
    if mean_brightness < 50:
        gamma = 0.4  # Very dark - strong brightening
    elif mean_brightness < 100:
        gamma = 0.6  # Dark - moderate brightening
    elif mean_brightness > 200:
        gamma = 1.5  # Too bright - darken
    else:
        gamma = 1.0  # Good brightness
    
    # Apply gamma correction
    normalized = rgb / 255.0
    corrected = np.power(normalized, gamma) * 255.0
    return np.clip(corrected, 0, 255)


def denoise_image(rgb: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """Smart denoising that preserves edges while removing noise"""
    result = np.empty_like(rgb)
    
    for ch in range(3):
        channel = rgb[..., ch]
        
        # Estimate noise level using median absolute deviation
        noise_estimate = np.median(np.abs(channel - median_filter(channel, size=3)))
        
        # Adaptive filtering based on noise level
        if noise_estimate > 10 * strength:
            # High noise: use stronger median filter
            result[..., ch] = median_filter(channel, size=5)
        elif noise_estimate > 5 * strength:
            # Medium noise: bilateral-like filtering (simplified)
            blurred = gaussian_filter(channel, sigma=1.5)
            # Edge-preserving blend
            edges = np.abs(channel - uniform_filter(channel, size=5))
            edge_mask = edges / (edges.max() + 1e-8)
            result[..., ch] = channel * edge_mask + blurred * (1 - edge_mask)
        else:
            # Low noise: light gaussian
            result[..., ch] = gaussian_filter(channel, sigma=0.5)
    
    return result


def smart_enhance(rgb: np.ndarray, intensity: float = 1.0) -> np.ndarray:
    """Intelligent enhancement that adapts to image characteristics"""
    # Step 1: Denoise first
    denoised = denoise_image(rgb, strength=intensity)
    
    # Step 2: Auto gamma correction
    gamma_corrected = auto_gamma_correction(denoised)
    
    # Step 3: Local contrast enhancement
    result = np.empty_like(gamma_corrected)
    for ch in range(3):
        channel = gamma_corrected[..., ch]
        local_mean = uniform_filter(channel, size=50)
        local_std = np.sqrt(uniform_filter((channel - local_mean) ** 2, size=50) + 1e-8)
        
        # Enhance local contrast
        enhanced = (channel - local_mean) / (local_std + 1e-8) * 40 * intensity + local_mean
        result[..., ch] = enhanced
    
    # Step 4: Color preservation - maintain original saturation
    original_hsv = rgb_to_hsv(rgb)
    enhanced_hsv = rgb_to_hsv(result)
    enhanced_hsv[..., 1] = original_hsv[..., 1]  # Keep original saturation
    result = hsv_to_rgb(enhanced_hsv)
    
    return np.clip(result, 0, 255)


def rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    """Convert RGB to HSV color space"""
    rgb_normalized = rgb / 255.0
    r, g, b = rgb_normalized[..., 0], rgb_normalized[..., 1], rgb_normalized[..., 2]
    
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    diff = max_c - min_c
    
    # Hue
    h = np.zeros_like(max_c)
    mask = diff > 0
    
    r_max = (max_c == r) & mask
    g_max = (max_c == g) & mask
    b_max = (max_c == b) & mask
    
    h[r_max] = 60 * (((g[r_max] - b[r_max]) / diff[r_max]) % 6)
    h[g_max] = 60 * (((b[g_max] - r[g_max]) / diff[g_max]) + 2)
    h[b_max] = 60 * (((r[b_max] - g[b_max]) / diff[b_max]) + 4)
    
    # Saturation
    s = np.zeros_like(max_c)
    s[max_c > 0] = diff[max_c > 0] / max_c[max_c > 0]
    
    # Value
    v = max_c
    
    return np.stack([h, s, v], axis=-1)


def hsv_to_rgb(hsv: np.ndarray) -> np.ndarray:
    """Convert HSV to RGB color space"""
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    
    c = v * s
    x = c * (1 - np.abs((h / 60) % 2 - 1))
    m = v - c
    
    rgb = np.zeros((*h.shape, 3))
    
    mask0 = (h >= 0) & (h < 60)
    mask1 = (h >= 60) & (h < 120)
    mask2 = (h >= 120) & (h < 180)
    mask3 = (h >= 180) & (h < 240)
    mask4 = (h >= 240) & (h < 300)
    mask5 = (h >= 300) & (h < 360)
    
    rgb[mask0] = np.stack([c[mask0], x[mask0], np.zeros_like(c[mask0])], axis=-1)
    rgb[mask1] = np.stack([x[mask1], c[mask1], np.zeros_like(c[mask1])], axis=-1)
    rgb[mask2] = np.stack([np.zeros_like(c[mask2]), c[mask2], x[mask2]], axis=-1)
    rgb[mask3] = np.stack([np.zeros_like(c[mask3]), x[mask3], c[mask3]], axis=-1)
    rgb[mask4] = np.stack([x[mask4], np.zeros_like(c[mask4]), c[mask4]], axis=-1)
    rgb[mask5] = np.stack([c[mask5], np.zeros_like(c[mask5]), x[mask5]], axis=-1)
    
    rgb = (rgb + m[..., np.newaxis]) * 255.0
    return np.clip(rgb, 0, 255)


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


def compute_image_stats(rgb: np.ndarray) -> dict:
    gray = to_gray(rgb)
    luminance = float(np.mean(gray))
    noise = float(np.std(gray - gaussian_filter(gray, sigma=1.0)))
    contrast = float(np.std(gray))
    p5, p95 = np.percentile(gray, [5, 95])
    dynamic_range = float(p95 - p5)

    # Simple Laplacian-based sharpness
    laplace = (
        -4 * gray
        + np.roll(gray, 1, axis=0)
        + np.roll(gray, -1, axis=0)
        + np.roll(gray, 1, axis=1)
        + np.roll(gray, -1, axis=1)
    )
    sharpness = float(np.var(laplace))

    # Recommend mode based on luminance/noise
    if luminance < 30:
        recommended_mode = "smart"
    elif luminance < 65:
        recommended_mode = "retinex" if noise < 18 else "smart"
    elif noise > 22:
        recommended_mode = "clahe"
    else:
        recommended_mode = "log"

    return {
        "luminance": luminance,
        "noise": noise,
        "contrast": contrast,
        "dynamic_range": dynamic_range,
        "sharpness": sharpness,
        "recommended_mode": recommended_mode,
    }


def numpy_to_image(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(arr.astype(np.uint8))


def to_gray(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return 0.299 * r + 0.587 * g + 0.114 * b


def decode_base64_image(data: str) -> Image.Image:
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    return Image.open(io.BytesIO(raw))


class MotionBase64Payload(BaseModel):
    current_base64: str
    previous_base64: str
    diff_threshold: float = 25.0
    motion_ratio: float = 0.02


class AnalyzeBase64Payload(BaseModel):
    image_base64: str
    max_side: Optional[int] = 640


class EnhanceBase64Payload(BaseModel):
    image_base64: str
    luminance_threshold: float = 70.0
    log_gain: float = 3.0
    mode: str = "log"
    intensity: float = 1.0
    max_side: Optional[int] = 960
    include_stats: bool = False


def frame_difference(prev: np.ndarray, curr: np.ndarray, diff_threshold: float, motion_ratio: float) -> dict:
    global background_model
    
    # Resize to match if shapes differ
    if prev.shape != curr.shape:
        h = min(prev.shape[0], curr.shape[0])
        w = min(prev.shape[1], curr.shape[1])
        prev = prev[:h, :w]
        curr = curr[:h, :w]

    prev_gray = to_gray(prev)
    curr_gray = to_gray(curr)
    h, w = curr_gray.shape
    
    # ============ ADAPTIVE BACKGROUND MODELING ============
    if background_model["mean"] is None or background_model["mean"].shape != curr_gray.shape:
        background_model["mean"] = curr_gray.copy()
        background_model["variance"] = np.ones_like(curr_gray) * 100.0
        background_model["frame_count"] = 1
    else:
        # Update background model using running average
        lr = background_model["learning_rate"]
        background_model["mean"] = (1 - lr) * background_model["mean"] + lr * curr_gray
        diff_from_bg = (curr_gray - background_model["mean"]) ** 2
        background_model["variance"] = (1 - lr) * background_model["variance"] + lr * diff_from_bg
        background_model["frame_count"] += 1
    
    # ============ ADAPTIVE THRESHOLD BASED ON CONDITIONS ============
    avg_brightness = np.mean(curr_gray)
    noise_estimate = np.std(curr_gray - gaussian_filter(curr_gray, sigma=1.0))
    
    # Dynamic threshold based on brightness, noise, and background variance
    base_threshold = diff_threshold
    if avg_brightness < 40:
        base_threshold *= 0.6  # Very dark - more sensitive
    elif avg_brightness < 80:
        base_threshold *= 0.8  # Dark
    elif avg_brightness > 180:
        base_threshold *= 1.4  # Very bright - less sensitive
    
    # Adjust for noise level
    if noise_estimate > 20:
        base_threshold *= 1.3  # Noisy image - less sensitive
    
    adaptive_threshold = base_threshold
    
    # ============ MULTI-METHOD MOTION DETECTION ============
    
    # Method 1: Frame difference
    frame_diff = np.abs(curr_gray - prev_gray)
    
    # Method 2: Background subtraction
    bg_diff = np.abs(curr_gray - background_model["mean"])
    bg_std = np.sqrt(background_model["variance"] + 1e-8)
    bg_motion = bg_diff > (2.5 * bg_std + adaptive_threshold * 0.3)
    
    # Method 3: Temporal gradient (acceleration detection)
    diff_smoothed = gaussian_filter(frame_diff, sigma=1.5)
    
    # ============ MORPHOLOGICAL CLEANING ============
    # Create motion mask
    motion_mask = (diff_smoothed > adaptive_threshold) | bg_motion
    
    # Morphological operations to clean up
    # Erosion to remove noise
    eroded = morphological_erode(motion_mask.astype(np.float32), size=3) > 0.5
    # Dilation to connect nearby regions
    dilated = morphological_dilate(eroded.astype(np.float32), size=5) > 0.5
    
    # ============ REGION OF INTEREST WEIGHTING ============
    roi_mask = np.ones_like(curr_gray)
    y1, y2 = int(h * 0.15), int(h * 0.85)
    x1, x2 = int(w * 0.15), int(w * 0.85)
    roi_mask[y1:y2, x1:x2] = 2.0  # Center region weighted 2x
    
    weighted_motion = dilated.astype(np.float32) * roi_mask
    
    # ============ CONNECTED COMPONENT ANALYSIS ============
    labeled_array, num_features = label(dilated)
    
    objects_detected = []
    significant_objects = 0
    total_motion_area = 0
    
    for i in range(1, num_features + 1):
        component_mask = labeled_array == i
        component_size = np.count_nonzero(component_mask)
        total_pixels = h * w
        size_ratio = component_size / total_pixels
        
        # Filter by size: ignore tiny noise and huge changes (like lighting)
        min_size = 0.001  # 0.1% of image
        max_size = 0.4    # 40% of image (too big = probably lighting change)
        
        if min_size <= size_ratio <= max_size:
            # Calculate object properties
            y_coords, x_coords = np.where(component_mask)
            center_x = np.mean(x_coords) / w
            center_y = np.mean(y_coords) / h
            
            # Bounding box
            bbox = {
                "x1": float(np.min(x_coords) / w),
                "y1": float(np.min(y_coords) / h),
                "x2": float(np.max(x_coords) / w),
                "y2": float(np.max(y_coords) / h)
            }
            
            # Motion intensity in this region
            region_intensity = np.mean(frame_diff[component_mask])
            
            # Calculate aspect ratio (human-like detection)
            bbox_h = bbox["y2"] - bbox["y1"]
            bbox_w = bbox["x2"] - bbox["x1"]
            aspect_ratio = bbox_h / (bbox_w + 1e-8)
            
            # Humans typically have aspect ratio between 1.2 and 4.0
            is_humanlike = 1.0 <= aspect_ratio <= 5.0
            
            objects_detected.append({
                "center": {"x": float(center_x), "y": float(center_y)},
                "bbox": bbox,
                "size_ratio": float(size_ratio),
                "intensity": float(region_intensity),
                "aspect_ratio": float(aspect_ratio),
                "is_humanlike": bool(is_humanlike)
            })
            
            significant_objects += 1
            total_motion_area += component_size
    
    # ============ SMART MOTION DECISION ============
    motion_ratio_actual = total_motion_area / (h * w) if (h * w) > 0 else 0.0
    
    # Calculate overall motion magnitude
    motion_magnitude = np.mean(frame_diff[dilated]) if np.any(dilated) else 0.0
    
    # Confidence calculation based on multiple factors
    confidence_factors = []
    
    if significant_objects > 0:
        confidence_factors.append(min(1.0, significant_objects / 3))  # Number of objects
        confidence_factors.append(min(1.0, motion_magnitude / adaptive_threshold))  # Intensity
        confidence_factors.append(min(1.0, motion_ratio_actual / motion_ratio))  # Coverage
        
        # Bonus for human-like objects
        humanlike_count = sum(1 for obj in objects_detected if obj["is_humanlike"])
        if humanlike_count > 0:
            confidence_factors.append(0.3)  # Bonus confidence
    
    confidence = np.mean(confidence_factors) if confidence_factors else 0.0
    
    # Final decision: significant motion requires confidence > 0.35
    significant_motion = (
        significant_objects > 0 and 
        confidence > 0.35 and 
        motion_ratio_actual >= motion_ratio * 0.5
    )
    
    # Primary motion center (largest object or center of mass)
    if objects_detected:
        largest_obj = max(objects_detected, key=lambda x: x["size_ratio"])
        motion_center = largest_obj["center"]
    else:
        motion_center = None

    return {
        "motion": bool(significant_motion),
        "confidence": float(confidence),
        "objects_count": significant_objects,
        "objects": objects_detected[:5],  # Return top 5 objects
        "motion_center": motion_center,
        "diff_ratio": float(motion_ratio_actual),
        "motion_magnitude": float(motion_magnitude),
        "adaptive_threshold": float(adaptive_threshold),
        "avg_brightness": float(avg_brightness),
        "noise_level": float(noise_estimate),
        "background_frames": background_model["frame_count"],
    }


def morphological_erode(image: np.ndarray, size: int = 3) -> np.ndarray:
    """Simple morphological erosion using minimum filter"""
    return uniform_filter(image, size=size, mode='constant', cval=0) > 0.8


def morphological_dilate(image: np.ndarray, size: int = 3) -> np.ndarray:
    """Simple morphological dilation using maximum filter"""
    return uniform_filter(image, size=size, mode='constant', cval=0) > 0.2


@app.post("/enhance")
async def enhance_image(
    file: UploadFile = File(...),
    luminance_threshold: float = 70.0,
    log_gain: float = 3.0,
    mode: str = "log",
    intensity: float = 1.0,
    max_side: Optional[int] = 960,
    include_stats: bool = False,
):
    """Enhancement modes: log, clahe, retinex, smart, all
    intensity: 0.0 (no effect) to 2.0 (double strength), default 1.0"""
    start_time = time.perf_counter()
    content = await file.read()
    image = Image.open(io.BytesIO(content))
    image = downscale_if_needed(image, max_side)
    data = to_numpy(image)

    lum = mean_luminance(data)
    enhanced_data = data
    enhancement_applied = "none"
    
    # Auto-detect if enhancement is needed based on image analysis
    needs_enhancement = lum < luminance_threshold
    noise_level = np.std(data - gaussian_filter(data, sigma=1.0))
    
    if needs_enhancement or mode == "smart":
        if mode == "log":
            enhanced_data = log_enhance(data, c=log_gain, intensity=intensity)
            enhancement_applied = "log"
        elif mode == "clahe":
            enhanced_data = adaptive_histogram_equalization(data, clip_limit=3.0, intensity=intensity)
            enhancement_applied = "clahe"
        elif mode == "retinex":
            enhanced_data = multi_scale_retinex(data, sigmas=[15, 80, 250], intensity=intensity)
            enhancement_applied = "retinex"
        elif mode == "smart":
            # Intelligent auto-selection based on image characteristics
            if lum < 30:
                # Very dark: use combined approach
                temp = log_enhance(data, c=log_gain * 1.2, intensity=intensity)
                enhanced_data = smart_enhance(temp, intensity=intensity)
                enhancement_applied = "smart_dark"
            elif lum < 60:
                # Dark: retinex works best
                enhanced_data = multi_scale_retinex(data, sigmas=[15, 80, 250], intensity=intensity)
                enhanced_data = denoise_image(enhanced_data, strength=intensity * 0.5)
                enhancement_applied = "smart_retinex"
            elif noise_level > 15:
                # Noisy: denoise first then enhance
                denoised = denoise_image(data, strength=intensity)
                enhanced_data = adaptive_histogram_equalization(denoised, clip_limit=2.5, intensity=intensity)
                enhancement_applied = "smart_denoise"
            else:
                # Moderate: CLAHE with smart enhancement
                enhanced_data = smart_enhance(data, intensity=intensity)
                enhancement_applied = "smart_auto"
        elif mode == "all":
            # Combine all for maximum enhancement
            temp = log_enhance(data, c=log_gain, intensity=intensity)
            temp = adaptive_histogram_equalization(temp, clip_limit=2.5, intensity=intensity)
            enhanced_data = multi_scale_retinex(temp, sigmas=[10, 50, 150], intensity=intensity)
            enhancement_applied = "all"
        else:
            enhanced_data = log_enhance(data, c=log_gain, intensity=intensity)
            enhancement_applied = "log_default"

    enhanced = numpy_to_image(enhanced_data)
    buf = io.BytesIO()
    enhanced.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")

    stats = compute_image_stats(enhanced_data) if include_stats else None
    processing_ms = (time.perf_counter() - start_time) * 1000.0

    return {
        "applied": needs_enhancement or mode == "smart",
        "luminance": float(lum),
        "noise_level": float(noise_level),
        "mode": mode,
        "enhancement_applied": enhancement_applied,
        "intensity": intensity,
        "processing_ms": float(processing_ms),
        "image_size": {"width": enhanced.width, "height": enhanced.height},
        "stats": stats,
        "image_base64": encoded,
    }


@app.post("/enhance-base64")
async def enhance_image_base64(payload: EnhanceBase64Payload):
    start_time = time.perf_counter()
    image = decode_base64_image(payload.image_base64)
    image = downscale_if_needed(image, payload.max_side)
    data = to_numpy(image)

    lum = mean_luminance(data)
    enhanced_data = data
    enhancement_applied = "none"

    needs_enhancement = lum < payload.luminance_threshold
    noise_level = np.std(data - gaussian_filter(data, sigma=1.0))

    if needs_enhancement or payload.mode == "smart":
        if payload.mode == "log":
            enhanced_data = log_enhance(data, c=payload.log_gain, intensity=payload.intensity)
            enhancement_applied = "log"
        elif payload.mode == "clahe":
            enhanced_data = adaptive_histogram_equalization(data, clip_limit=3.0, intensity=payload.intensity)
            enhancement_applied = "clahe"
        elif payload.mode == "retinex":
            enhanced_data = multi_scale_retinex(data, sigmas=[15, 80, 250], intensity=payload.intensity)
            enhancement_applied = "retinex"
        elif payload.mode == "smart":
            if lum < 30:
                temp = log_enhance(data, c=payload.log_gain * 1.2, intensity=payload.intensity)
                enhanced_data = smart_enhance(temp, intensity=payload.intensity)
                enhancement_applied = "smart_dark"
            elif lum < 60:
                enhanced_data = multi_scale_retinex(data, sigmas=[15, 80, 250], intensity=payload.intensity)
                enhanced_data = denoise_image(enhanced_data, strength=payload.intensity * 0.5)
                enhancement_applied = "smart_retinex"
            elif noise_level > 15:
                denoised = denoise_image(data, strength=payload.intensity)
                enhanced_data = adaptive_histogram_equalization(denoised, clip_limit=2.5, intensity=payload.intensity)
                enhancement_applied = "smart_denoise"
            else:
                enhanced_data = smart_enhance(data, intensity=payload.intensity)
                enhancement_applied = "smart_auto"
        elif payload.mode == "all":
            temp = log_enhance(data, c=payload.log_gain, intensity=payload.intensity)
            temp = adaptive_histogram_equalization(temp, clip_limit=2.5, intensity=payload.intensity)
            enhanced_data = multi_scale_retinex(temp, sigmas=[10, 50, 150], intensity=payload.intensity)
            enhancement_applied = "all"
        else:
            enhanced_data = log_enhance(data, c=payload.log_gain, intensity=payload.intensity)
            enhancement_applied = "log_default"

    enhanced = numpy_to_image(enhanced_data)
    buf = io.BytesIO()
    enhanced.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")

    stats = compute_image_stats(enhanced_data) if payload.include_stats else None
    processing_ms = (time.perf_counter() - start_time) * 1000.0

    return {
        "applied": needs_enhancement or payload.mode == "smart",
        "luminance": float(lum),
        "noise_level": float(noise_level),
        "mode": payload.mode,
        "enhancement_applied": enhancement_applied,
        "intensity": payload.intensity,
        "processing_ms": float(processing_ms),
        "image_size": {"width": enhanced.width, "height": enhanced.height},
        "stats": stats,
        "image_base64": encoded,
    }


@app.post("/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    max_side: Optional[int] = 640,
):
    start_time = time.perf_counter()
    content = await file.read()

    frame_hash = hashlib.md5(content).hexdigest()
    if analysis_cache["hash"] == frame_hash:
        cached = analysis_cache["result"]
        if cached:
            return cached

    image = Image.open(io.BytesIO(content))
    image = downscale_if_needed(image, max_side)
    data = to_numpy(image)

    stats = compute_image_stats(data)
    processing_ms = (time.perf_counter() - start_time) * 1000.0

    result = {
        **stats,
        "processing_ms": float(processing_ms),
        "image_size": {"width": image.width, "height": image.height},
    }
    analysis_cache["hash"] = frame_hash
    analysis_cache["result"] = result
    return result


@app.post("/analyze-base64")
async def analyze_image_base64(payload: AnalyzeBase64Payload):
    start_time = time.perf_counter()
    image = decode_base64_image(payload.image_base64)
    image = downscale_if_needed(image, payload.max_side)
    data = to_numpy(image)

    stats = compute_image_stats(data)
    processing_ms = (time.perf_counter() - start_time) * 1000.0

    return {
        **stats,
        "processing_ms": float(processing_ms),
        "image_size": {"width": image.width, "height": image.height},
    }


@app.post("/motion")
async def detect_motion(
    current: UploadFile = File(...),
    previous: UploadFile = File(...),
    diff_threshold: float = Form(25.0),
    motion_ratio: float = Form(0.02),
    max_side: Optional[int] = Form(640),
):
    """Frame differencing motion detection.

    - diff_threshold: per-pixel intensity difference (0-255) to consider a pixel as changed
    - motion_ratio: fraction of pixels that must exceed diff_threshold to flag motion
    """

    curr_bytes = await current.read()
    prev_bytes = await previous.read()

    start_time = time.perf_counter()
    curr_img = Image.open(io.BytesIO(curr_bytes))
    prev_img = Image.open(io.BytesIO(prev_bytes))
    curr_img = downscale_if_needed(curr_img, max_side)
    prev_img = downscale_if_needed(prev_img, max_side)

    curr_np = to_numpy(curr_img)
    prev_np = to_numpy(prev_img)

    result = frame_difference(prev_np, curr_np, diff_threshold, motion_ratio)
    result["processing_ms"] = float((time.perf_counter() - start_time) * 1000.0)
    return result


@app.post("/motion-base64")
async def detect_motion_base64(payload: MotionBase64Payload):
    start_time = time.perf_counter()
    curr_img = decode_base64_image(payload.current_base64)
    prev_img = decode_base64_image(payload.previous_base64)

    curr_np = to_numpy(curr_img)
    prev_np = to_numpy(prev_img)

    result = frame_difference(prev_np, curr_np, payload.diff_threshold, payload.motion_ratio)
    result["processing_ms"] = float((time.perf_counter() - start_time) * 1000.0)
    return result


@app.post("/calibrate")
async def calibrate_background():
    background_model["mean"] = None
    background_model["variance"] = None
    background_model["frame_count"] = 0
    return {"status": "ok", "message": "Background model reset"}


# ============ AI-POWERED ENDPOINTS (GROQ) ============

@app.get("/ai/status")
async def ai_status():
    """Check if AI services are available."""
    client = get_groq_client()
    return {
        "groq_available": GROQ_AVAILABLE,
        "groq_configured": client is not None,
        "api_key_set": bool(os.environ.get("GROQ_API_KEY")),
    }


@app.post("/ai/detect")
async def ai_detect_threats(payload: AIDetectPayload):
    """
    Use Groq AI to detect threats, intruders, and objects in an image.
    Returns detected objects with confidence scores and threat levels.
    """
    import json as json_module
    import re
    
    start_time = time.perf_counter()
    client = get_groq_client()
    
    if not client:
        raise HTTPException(status_code=503, detail="Groq AI not configured. Set GROQ_API_KEY environment variable.")
    
    # Decode and prepare image
    image = decode_base64_image(payload.image_base64)
    
    # Resize for API efficiency
    max_side = 512
    w, h = image.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.BILINEAR)
    
    # Convert RGBA to RGB if needed (JPEG doesn't support alpha)
    if image.mode == 'RGBA':
        image = image.convert('RGB')
    
    # Convert to base64 for API
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=85)
    image_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    
    detect_classes_str = ", ".join(payload.detect_classes)
    
    prompt = f"""Analyze this security camera image for threat detection. 

Look for these specific classes: {detect_classes_str}

For each detected object, provide:
1. Object class (from the list above)
2. Confidence score (0.0 to 1.0)
3. Approximate location in the image (top-left, top-right, center, bottom-left, bottom-right)
4. Threat level (none, low, medium, high, critical)
5. Brief description

If you detect any suspicious activity, intruders, or potential threats, flag them with high priority.

Respond in JSON format:
{{
    "detections": [
        {{
            "class": "person",
            "confidence": 0.95,
            "location": "center",
            "threat_level": "medium",
            "description": "Person wearing dark clothing"
        }}
    ],
    "scene_summary": "Nighttime outdoor scene with one person detected",
    "overall_threat_level": "medium",
    "recommended_action": "Monitor closely",
    "visibility_quality": "low"
}}

If no objects of interest are detected, return empty detections array."""

    try:
        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        
        response_text = completion.choices[0].message.content
        
        # Try to parse JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            result = json_module.loads(json_match.group())
        else:
            result = {
                "detections": [],
                "scene_summary": response_text,
                "overall_threat_level": "unknown",
                "recommended_action": "Manual review required",
                "visibility_quality": "unknown",
                "raw_response": response_text
            }
        
        # Filter by confidence threshold
        if "detections" in result:
            result["detections"] = [
                d for d in result["detections"] 
                if d.get("confidence", 0) >= payload.confidence_threshold
            ]
        
        result["processing_ms"] = float((time.perf_counter() - start_time) * 1000.0)
        result["ai_model"] = "llama-4-scout-17b"
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI detection failed: {str(e)}")


@app.post("/ai/scene")
async def ai_analyze_scene(payload: AIScenePayload):
    """
    Comprehensive scene analysis using Groq AI.
    Provides detailed description of the environment, lighting, and activity.
    """
    import json as json_module
    import re
    
    start_time = time.perf_counter()
    client = get_groq_client()
    
    if not client:
        raise HTTPException(status_code=503, detail="Groq AI not configured. Set GROQ_API_KEY environment variable.")
    
    image = decode_base64_image(payload.image_base64)
    
    # Resize for API
    max_side = 512
    w, h = image.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.BILINEAR)
    
    # Convert RGBA to RGB if needed (JPEG doesn't support alpha)
    if image.mode == 'RGBA':
        image = image.convert('RGB')
    
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=85)
    image_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    
    prompt = """Analyze this security/night vision camera image and provide a comprehensive scene analysis.

Provide:
1. Environment type (indoor, outdoor, parking lot, street, building entrance, etc.)
2. Lighting conditions (bright, dim, dark, night vision, infrared)
3. Weather conditions if visible (clear, rain, fog, snow)
4. Time of day estimate (day, dusk, night)
5. All visible objects and their positions
6. Any movement or activity detected
7. Potential security concerns
8. Image quality assessment

Respond in JSON format:
{
    "environment": "outdoor parking lot",
    "lighting": "low-light night vision",
    "weather": "clear",
    "time_of_day": "night",
    "objects": ["car", "lamppost", "fence"],
    "activity": "no movement detected",
    "security_concerns": [],
    "image_quality": "moderate - some noise present",
    "visibility_score": 0.6,
    "description": "Nighttime view of a parking lot with one parked vehicle..."
}"""

    try:
        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.3,
            max_tokens=1500,
        )
        
        response_text = completion.choices[0].message.content
        
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            result = json_module.loads(json_match.group())
        else:
            result = {
                "description": response_text,
                "raw_response": response_text
            }
        
        result["processing_ms"] = float((time.perf_counter() - start_time) * 1000.0)
        result["ai_model"] = "llama-4-scout-17b"
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scene analysis failed: {str(e)}")


@app.post("/ai/smart-alert")
async def ai_smart_alert(payload: AIDetectPayload):
    """
    Intelligent alert system that combines motion detection with AI analysis.
    Only triggers alerts for genuine security concerns.
    """
    import json as json_module
    import re
    
    start_time = time.perf_counter()
    client = get_groq_client()
    
    if not client:
        # Fallback to basic detection
        return {
            "alert": False,
            "reason": "AI not available, using basic detection",
            "ai_available": False,
            "processing_ms": float((time.perf_counter() - start_time) * 1000.0)
        }
    
    image = decode_base64_image(payload.image_base64)
    
    # Smaller image for faster processing
    max_side = 384
    w, h = image.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.BILINEAR)
    
    # Convert RGBA to RGB if needed (JPEG doesn't support alpha)
    if image.mode == 'RGBA':
        image = image.convert('RGB')
    
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=70)
    image_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    
    prompt = """Security scan. Check for: intruders, weapons, suspicious activity, masked persons, unauthorized vehicles.

Respond ONLY with JSON:
{"alert": true/false, "alert_level": "none/low/medium/high/critical", "reason": "brief", "detected_threats": [], "confidence": 0.0-1.0, "recommended_action": "action"}"""

    try:
        completion = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}"
                            }
                        }
                    ]
                }
            ],
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        
        response_text = completion.choices[0].message.content
        
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            result = json_module.loads(json_match.group())
        else:
            result = {
                "alert": False,
                "reason": "Could not parse AI response",
                "raw_response": response_text
            }
        
        result["processing_ms"] = float((time.perf_counter() - start_time) * 1000.0)
        result["ai_model"] = "llama-4-scout-17b"
        result["ai_available"] = True
        
        return result
        
    except Exception as e:
        return {
            "alert": False,
            "reason": f"AI analysis failed: {str(e)}",
            "ai_available": False,
            "processing_ms": float((time.perf_counter() - start_time) * 1000.0)
        }
