# Core Utility Modules

Python utility modules that provide the building blocks for creating Slack-optimized GIFs.

## core/gif_builder.py

GIF Builder - Core module for assembling frames into GIFs optimized for Slack.

```python
#!/usr/bin/env python3
"""
GIF Builder - Core module for assembling frames into GIFs optimized for Slack.

This module provides the main interface for creating GIFs from programmatically
generated frames, with automatic optimization for Slack's requirements.
"""

from pathlib import Path
from typing import Optional

import imageio.v3 as imageio
import numpy as np
from PIL import Image


class GIFBuilder:
    """Builder for creating optimized GIFs from frames."""

    def __init__(self, width: int = 480, height: int = 480, fps: int = 15):
        """
        Initialize GIF builder.

        Args:
            width: Frame width in pixels
            height: Frame height in pixels
            fps: Frames per second
        """
        self.width = width
        self.height = height
        self.fps = fps
        self.frames: list[np.ndarray] = []

    def add_frame(self, frame: np.ndarray | Image.Image):
        """
        Add a frame to the GIF.

        Args:
            frame: Frame as numpy array or PIL Image (will be converted to RGB)
        """
        if isinstance(frame, Image.Image):
            frame = np.array(frame.convert("RGB"))

        # Ensure frame is correct size
        if frame.shape[:2] != (self.height, self.width):
            pil_frame = Image.fromarray(frame)
            pil_frame = pil_frame.resize(
                (self.width, self.height), Image.Resampling.LANCZOS
            )
            frame = np.array(pil_frame)

        self.frames.append(frame)

    def add_frames(self, frames: list[np.ndarray | Image.Image]):
        """Add multiple frames at once."""
        for frame in frames:
            self.add_frame(frame)

    def optimize_colors(
        self, num_colors: int = 128, use_global_palette: bool = True
    ) -> list[np.ndarray]:
        """
        Reduce colors in all frames using quantization.

        Args:
            num_colors: Target number of colors (8-256)
            use_global_palette: Use a single palette for all frames (better compression)

        Returns:
            List of color-optimized frames
        """
        optimized = []

        if use_global_palette and len(self.frames) > 1:
            # Create a global palette from all frames
            sample_size = min(5, len(self.frames))
            sample_indices = [
                int(i * len(self.frames) / sample_size) for i in range(sample_size)
            ]
            sample_frames = [self.frames[i] for i in sample_indices]

            all_pixels = np.vstack(
                [f.reshape(-1, 3) for f in sample_frames]
            )

            total_pixels = len(all_pixels)
            width = min(512, int(np.sqrt(total_pixels)))
            height = (total_pixels + width - 1) // width

            pixels_needed = width * height
            if pixels_needed > total_pixels:
                padding = np.zeros((pixels_needed - total_pixels, 3), dtype=np.uint8)
                all_pixels = np.vstack([all_pixels, padding])

            img_array = (
                all_pixels[:pixels_needed].reshape(height, width, 3).astype(np.uint8)
            )
            combined_img = Image.fromarray(img_array, mode="RGB")

            global_palette = combined_img.quantize(colors=num_colors, method=2)

            for frame in self.frames:
                pil_frame = Image.fromarray(frame)
                quantized = pil_frame.quantize(palette=global_palette, dither=1)
                optimized.append(np.array(quantized.convert("RGB")))
        else:
            for frame in self.frames:
                pil_frame = Image.fromarray(frame)
                quantized = pil_frame.quantize(colors=num_colors, method=2, dither=1)
                optimized.append(np.array(quantized.convert("RGB")))

        return optimized

    def deduplicate_frames(self, threshold: float = 0.9995) -> int:
        """
        Remove duplicate or near-duplicate consecutive frames.

        Args:
            threshold: Similarity threshold (0.0-1.0). Higher = more strict.

        Returns:
            Number of frames removed
        """
        if len(self.frames) < 2:
            return 0

        deduplicated = [self.frames[0]]
        removed_count = 0

        for i in range(1, len(self.frames)):
            prev_frame = np.array(deduplicated[-1], dtype=np.float32)
            curr_frame = np.array(self.frames[i], dtype=np.float32)

            diff = np.abs(prev_frame - curr_frame)
            similarity = 1.0 - (np.mean(diff) / 255.0)

            if similarity < threshold:
                deduplicated.append(self.frames[i])
            else:
                removed_count += 1

        self.frames = deduplicated
        return removed_count

    def save(
        self,
        output_path: str | Path,
        num_colors: int = 128,
        optimize_for_emoji: bool = False,
        remove_duplicates: bool = False,
    ) -> dict:
        """
        Save frames as optimized GIF for Slack.

        Args:
            output_path: Where to save the GIF
            num_colors: Number of colors to use (fewer = smaller file)
            optimize_for_emoji: If True, optimize for emoji size (128x128, fewer colors)
            remove_duplicates: If True, remove duplicate consecutive frames

        Returns:
            Dictionary with file info (path, size, dimensions, frame_count)
        """
        if not self.frames:
            raise ValueError("No frames to save. Add frames with add_frame() first.")

        output_path = Path(output_path)

        if remove_duplicates:
            removed = self.deduplicate_frames(threshold=0.9995)
            if removed > 0:
                print(f"  Removed {removed} nearly identical frames")

        if optimize_for_emoji:
            if self.width > 128 or self.height > 128:
                self.width = 128
                self.height = 128
                resized_frames = []
                for frame in self.frames:
                    pil_frame = Image.fromarray(frame)
                    pil_frame = pil_frame.resize((128, 128), Image.Resampling.LANCZOS)
                    resized_frames.append(np.array(pil_frame))
                self.frames = resized_frames
            num_colors = min(num_colors, 48)

            if len(self.frames) > 12:
                keep_every = max(1, len(self.frames) // 12)
                self.frames = [
                    self.frames[i] for i in range(0, len(self.frames), keep_every)
                ]

        optimized_frames = self.optimize_colors(num_colors, use_global_palette=True)
        frame_duration = 1000 / self.fps

        imageio.imwrite(
            output_path,
            optimized_frames,
            duration=frame_duration,
            loop=0,
        )

        file_size_kb = output_path.stat().st_size / 1024
        file_size_mb = file_size_kb / 1024

        info = {
            "path": str(output_path),
            "size_kb": file_size_kb,
            "size_mb": file_size_mb,
            "dimensions": f"{self.width}x{self.height}",
            "frame_count": len(optimized_frames),
            "fps": self.fps,
            "duration_seconds": len(optimized_frames) / self.fps,
            "colors": num_colors,
        }

        return info

    def clear(self):
        """Clear all frames."""
        self.frames = []
```

## core/validators.py

Validators - Check if GIFs meet Slack's requirements.

```python
#!/usr/bin/env python3
"""
Validators - Check if GIFs meet Slack's requirements.
"""

from pathlib import Path


def validate_gif(
    gif_path: str | Path, is_emoji: bool = True, verbose: bool = True
) -> tuple[bool, dict]:
    """
    Validate GIF for Slack (dimensions, size, frame count).

    Args:
        gif_path: Path to GIF file
        is_emoji: True for emoji (128x128 recommended), False for message GIF
        verbose: Print validation details

    Returns:
        Tuple of (passes: bool, results: dict with all details)
    """
    from PIL import Image

    gif_path = Path(gif_path)

    if not gif_path.exists():
        return False, {"error": f"File not found: {gif_path}"}

    size_bytes = gif_path.stat().st_size
    size_kb = size_bytes / 1024
    size_mb = size_kb / 1024

    try:
        with Image.open(gif_path) as img:
            width, height = img.size
            frame_count = 0
            try:
                while True:
                    img.seek(frame_count)
                    frame_count += 1
            except EOFError:
                pass

            try:
                duration_ms = img.info.get("duration", 100)
                total_duration = (duration_ms * frame_count) / 1000
                fps = frame_count / total_duration if total_duration > 0 else 0
            except:
                total_duration = None
                fps = None
    except Exception as e:
        return False, {"error": f"Failed to read GIF: {e}"}

    if is_emoji:
        optimal = width == height == 128
        acceptable = width == height and 64 <= width <= 128
        dim_pass = acceptable
    else:
        aspect_ratio = (
            max(width, height) / min(width, height)
            if min(width, height) > 0
            else float("inf")
        )
        dim_pass = aspect_ratio <= 2.0 and 320 <= min(width, height) <= 640

    results = {
        "file": str(gif_path),
        "passes": dim_pass,
        "width": width,
        "height": height,
        "size_kb": size_kb,
        "size_mb": size_mb,
        "frame_count": frame_count,
        "duration_seconds": total_duration,
        "fps": fps,
        "is_emoji": is_emoji,
        "optimal": optimal if is_emoji else None,
    }

    return dim_pass, results


def is_slack_ready(
    gif_path: str | Path, is_emoji: bool = True, verbose: bool = True
) -> bool:
    """Quick check if GIF is ready for Slack."""
    passes, _ = validate_gif(gif_path, is_emoji, verbose)
    return passes
```

## core/easing.py

Easing Functions - Timing functions for smooth animations.

```python
#!/usr/bin/env python3
"""
Easing Functions - Timing functions for smooth animations.

All functions take a value t (0.0 to 1.0) and return eased value (0.0 to 1.0).
"""

import math


def linear(t: float) -> float:
    return t

def ease_in_quad(t: float) -> float:
    return t * t

def ease_out_quad(t: float) -> float:
    return t * (2 - t)

def ease_in_out_quad(t: float) -> float:
    if t < 0.5:
        return 2 * t * t
    return -1 + (4 - 2 * t) * t

def ease_in_cubic(t: float) -> float:
    return t * t * t

def ease_out_cubic(t: float) -> float:
    return (t - 1) * (t - 1) * (t - 1) + 1

def ease_in_out_cubic(t: float) -> float:
    if t < 0.5:
        return 4 * t * t * t
    return (t - 1) * (2 * t - 2) * (2 * t - 2) + 1

def ease_in_bounce(t: float) -> float:
    return 1 - ease_out_bounce(1 - t)

def ease_out_bounce(t: float) -> float:
    if t < 1 / 2.75:
        return 7.5625 * t * t
    elif t < 2 / 2.75:
        t -= 1.5 / 2.75
        return 7.5625 * t * t + 0.75
    elif t < 2.5 / 2.75:
        t -= 2.25 / 2.75
        return 7.5625 * t * t + 0.9375
    else:
        t -= 2.625 / 2.75
        return 7.5625 * t * t + 0.984375

def ease_in_out_bounce(t: float) -> float:
    if t < 0.5:
        return ease_in_bounce(t * 2) * 0.5
    return ease_out_bounce(t * 2 - 1) * 0.5 + 0.5

def ease_in_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    return -math.pow(2, 10 * (t - 1)) * math.sin((t - 1.1) * 5 * math.pi)

def ease_out_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    return math.pow(2, -10 * t) * math.sin((t - 0.1) * 5 * math.pi) + 1

def ease_in_out_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    t = t * 2 - 1
    if t < 0:
        return -0.5 * math.pow(2, 10 * t) * math.sin((t - 0.1) * 5 * math.pi)
    return math.pow(2, -10 * t) * math.sin((t - 0.1) * 5 * math.pi) * 0.5 + 1

def ease_back_in(t: float) -> float:
    c1 = 1.70158
    c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t

def ease_back_out(t: float) -> float:
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)

def ease_back_in_out(t: float) -> float:
    c1 = 1.70158
    c2 = c1 * 1.525
    if t < 0.5:
        return (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    return (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2


# Convenience mapping
EASING_FUNCTIONS = {
    "linear": linear,
    "ease_in": ease_in_quad,
    "ease_out": ease_out_quad,
    "ease_in_out": ease_in_out_quad,
    "bounce_in": ease_in_bounce,
    "bounce_out": ease_out_bounce,
    "bounce": ease_in_out_bounce,
    "elastic_in": ease_in_elastic,
    "elastic_out": ease_out_elastic,
    "elastic": ease_in_out_elastic,
    "back_in": ease_back_in,
    "back_out": ease_back_out,
    "back_in_out": ease_back_in_out,
    "anticipate": ease_back_in,
    "overshoot": ease_back_out,
}


def get_easing(name: str = "linear"):
    return EASING_FUNCTIONS.get(name, linear)


def interpolate(start: float, end: float, t: float, easing: str = "linear") -> float:
    """Interpolate between two values with easing."""
    ease_func = get_easing(easing)
    eased_t = ease_func(t)
    return start + (end - start) * eased_t


def apply_squash_stretch(
    base_scale: tuple[float, float], intensity: float, direction: str = "vertical"
) -> tuple[float, float]:
    """Calculate squash and stretch scales for more dynamic animation."""
    width_scale, height_scale = base_scale
    if direction == "vertical":
        height_scale *= 1 - intensity * 0.5
        width_scale *= 1 + intensity * 0.5
    elif direction == "horizontal":
        width_scale *= 1 - intensity * 0.5
        height_scale *= 1 + intensity * 0.5
    elif direction == "both":
        width_scale *= 1 - intensity * 0.3
        height_scale *= 1 - intensity * 0.3
    return (width_scale, height_scale)


def calculate_arc_motion(
    start: tuple[float, float], end: tuple[float, float], height: float, t: float
) -> tuple[float, float]:
    """Calculate position along a parabolic arc (natural motion path)."""
    x1, y1 = start
    x2, y2 = end
    x = x1 + (x2 - x1) * t
    arc_offset = 4 * height * t * (1 - t)
    y = y1 + (y2 - y1) * t - arc_offset
    return (x, y)
```

## core/frame_composer.py

Frame Composer - Utilities for composing visual elements into frames.

```python
#!/usr/bin/env python3
"""
Frame Composer - Utilities for composing visual elements into frames.

Provides functions for drawing shapes, text, and compositing elements
together to create animation frames.
"""

from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def create_blank_frame(
    width: int, height: int, color: tuple[int, int, int] = (255, 255, 255)
) -> Image.Image:
    """Create a blank frame with solid color background."""
    return Image.new("RGB", (width, height), color)


def draw_circle(
    frame: Image.Image,
    center: tuple[int, int],
    radius: int,
    fill_color: Optional[tuple[int, int, int]] = None,
    outline_color: Optional[tuple[int, int, int]] = None,
    outline_width: int = 1,
) -> Image.Image:
    """Draw a circle on a frame."""
    draw = ImageDraw.Draw(frame)
    x, y = center
    bbox = [x - radius, y - radius, x + radius, y + radius]
    draw.ellipse(bbox, fill=fill_color, outline=outline_color, width=outline_width)
    return frame


def draw_text(
    frame: Image.Image,
    text: str,
    position: tuple[int, int],
    color: tuple[int, int, int] = (0, 0, 0),
    centered: bool = False,
) -> Image.Image:
    """Draw text on a frame."""
    draw = ImageDraw.Draw(frame)
    font = ImageFont.load_default()
    if centered:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = position[0] - text_width // 2
        y = position[1] - text_height // 2
        position = (x, y)
    draw.text(position, text, fill=color, font=font)
    return frame


def create_gradient_background(
    width: int,
    height: int,
    top_color: tuple[int, int, int],
    bottom_color: tuple[int, int, int],
) -> Image.Image:
    """Create a vertical gradient background."""
    frame = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(frame)
    r1, g1, b1 = top_color
    r2, g2, b2 = bottom_color
    for y in range(height):
        ratio = y / height
        r = int(r1 * (1 - ratio) + r2 * ratio)
        g = int(g1 * (1 - ratio) + g2 * ratio)
        b = int(b1 * (1 - ratio) + b2 * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return frame


def draw_star(
    frame: Image.Image,
    center: tuple[int, int],
    size: int,
    fill_color: tuple[int, int, int],
    outline_color: Optional[tuple[int, int, int]] = None,
    outline_width: int = 1,
) -> Image.Image:
    """Draw a 5-pointed star."""
    import math
    draw = ImageDraw.Draw(frame)
    x, y = center
    points = []
    for i in range(10):
        angle = (i * 36 - 90) * math.pi / 180
        radius = size if i % 2 == 0 else size * 0.4
        px = x + radius * math.cos(angle)
        py = y + radius * math.sin(angle)
        points.append((px, py))
    draw.polygon(points, fill=fill_color, outline=outline_color, width=outline_width)
    return frame
```
