import base64
import io
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from scipy.ndimage import gaussian_filter, median_filter, uniform_filter, label

app = FastAPI(title="Night Vision Backend", version="0.2.0")
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


def numpy_to_image(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(arr.astype(np.uint8))


def to_gray(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return 0.299 * r + 0.587 * g + 0.114 * b


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
):
    """Enhancement modes: log, clahe, retinex, smart, all
    intensity: 0.0 (no effect) to 2.0 (double strength), default 1.0"""
    content = await file.read()
    image = Image.open(io.BytesIO(content))
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

    return {
        "applied": needs_enhancement or mode == "smart",
        "luminance": float(lum),
        "noise_level": float(noise_level),
        "mode": mode,
        "enhancement_applied": enhancement_applied,
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
