#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "numpy>=2.0",
#   "pillow>=11.0",
#   "scipy>=1.14",
# ]
# ///
"""Generate hostile diagnostic views for subtle ocean moire and banding."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


def parse_args() -> argparse.Namespace:
    """Parse the capture directory and optional output directory."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture_dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    return parser.parse_args()


def ocean_crop(image: Image.Image) -> np.ndarray:
    """Return the bottom ocean region as normalized luminance."""
    luminance = np.asarray(image.convert("L"), dtype=np.float32) / 255.0
    height = min(760, round(luminance.shape[0] * 0.74))
    return luminance[-height:, :]


def normalize(array: np.ndarray, low: float = 0.5, high: float = 99.5) -> np.ndarray:
    """Percentile-stretch an array into displayable eight-bit luminance."""
    minimum, maximum = np.percentile(array, [low, high])
    scale = max(float(maximum - minimum), 1e-6)
    return np.clip((array - minimum) / scale, 0.0, 1.0)


def fft_view(array: np.ndarray) -> tuple[np.ndarray, dict[str, float]]:
    """Return a log-power spectrum and low-frequency energy measurements."""
    centered = array - ndimage.gaussian_filter(array, sigma=80.0)
    window = np.outer(np.hanning(array.shape[0]), np.hanning(array.shape[1]))
    spectrum = np.fft.fftshift(np.fft.fft2(centered * window))
    power = np.abs(spectrum) ** 2

    y, x = np.ogrid[-1.0:1.0:complex(array.shape[0]), -1.0:1.0:complex(array.shape[1])]
    radius = np.sqrt(x * x + y * y)
    usable = (radius >= 0.01) & (radius <= 0.95)
    low_band = (radius >= 0.01) & (radius < 0.08)
    mid_band = (radius >= 0.08) & (radius < 0.35)
    total = float(power[usable].sum()) or 1.0
    metrics = {
        "low_frequency_energy_ratio": float(power[low_band].sum() / total),
        "mid_frequency_energy_ratio": float(power[mid_band].sum() / total),
    }

    display = np.log1p(power)
    display[~usable] = 0.0
    return normalize(display, 2.0, 99.9), metrics


def diagnostic_views(array: np.ndarray) -> tuple[list[tuple[str, np.ndarray]], dict[str, float]]:
    """Build enhanced-contrast, high-pass, edge, and FFT views for one frame."""
    stretched = normalize(array)
    local_mean = ndimage.gaussian_filter(array, sigma=18.0)
    high_pass = array - local_mean
    high_pass_display = np.clip(0.5 + high_pass * 14.0, 0.0, 1.0)
    sobel_x = ndimage.sobel(array, axis=1)
    sobel_y = ndimage.sobel(array, axis=0)
    edges = normalize(np.hypot(sobel_x, sobel_y), 1.0, 99.5)
    spectrum, metrics = fft_view(array)
    metrics.update(
        {
            "local_mean_range": float(np.percentile(local_mean, 99) - np.percentile(local_mean, 1)),
            "high_pass_rms": float(np.sqrt(np.mean(high_pass * high_pass))),
        }
    )
    return [
        ("contrast", stretched),
        ("high-pass x14", high_pass_display),
        ("sobel edges", edges),
        ("log FFT power", spectrum),
    ], metrics


def image_from_array(array: np.ndarray) -> Image.Image:
    """Convert normalized luminance into an RGB image."""
    pixels = (np.clip(array, 0.0, 1.0) * 255.0).astype(np.uint8)
    return Image.fromarray(pixels, mode="L").convert("RGB")


def contact_sheet(entries: list[tuple[str, list[tuple[str, np.ndarray]]]]) -> Image.Image:
    """Arrange named diagnostic views into a readable comparison sheet."""
    tile_width = 420
    tile_height = 250
    label_height = 28
    sheet = Image.new("RGB", (tile_width * 4, (tile_height + label_height) * len(entries)), "#111111")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=15)

    for row, (name, views) in enumerate(entries):
        for column, (view_name, array) in enumerate(views):
            image = image_from_array(array)
            image.thumbnail((tile_width, tile_height), Image.Resampling.LANCZOS)
            x = column * tile_width + (tile_width - image.width) // 2
            y = row * (tile_height + label_height) + label_height
            sheet.paste(image, (x, y))
            draw.text((column * tile_width + 8, row * (tile_height + label_height) + 6), f"{name} - {view_name}", fill="white", font=font)
    return sheet


def temporal_metrics(frames: list[np.ndarray]) -> dict[str, float]:
    """Measure low-frequency drift across equal-sized animation frames."""
    if len(frames) < 2 or len({frame.shape for frame in frames}) != 1:
        return {}
    low_passed = np.stack([ndimage.gaussian_filter(frame, sigma=24.0) for frame in frames])
    temporal_standard_deviation = np.std(low_passed, axis=0)
    return {
        "low_frequency_temporal_rms": float(np.sqrt(np.mean(temporal_standard_deviation**2))),
        "low_frequency_temporal_p99": float(np.percentile(temporal_standard_deviation, 99)),
    }


def main() -> None:
    """Analyze every raw PNG capture and write visual and numeric evidence."""
    args = parse_args()
    output_dir = args.output_dir or args.capture_dir / "filtered"
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = sorted(args.capture_dir.glob("raw-*.png"))
    if not paths:
        raise SystemExit(f"No raw PNG captures found in {args.capture_dir}")

    entries: list[tuple[str, list[tuple[str, np.ndarray]]]] = []
    measurements: dict[str, dict[str, float]] = {}
    temporal_frames: list[np.ndarray] = []
    for path in paths:
        frame = ocean_crop(Image.open(path))
        views, metrics = diagnostic_views(frame)
        entries.append((path.stem, views))
        measurements[path.name] = metrics
        if path.stem.removeprefix("raw-").isdigit():
            temporal_frames.append(frame)
        for view_name, view in views:
            safe_name = view_name.replace(" ", "-")
            image_from_array(view).save(output_dir / f"{path.stem}-{safe_name}.png")

    measurements["temporal"] = temporal_metrics(temporal_frames)
    (output_dir / "metrics.json").write_text(json.dumps(measurements, indent=2) + "\n")
    contact_sheet(entries).save(output_dir / "contact-sheet.png")
    print(json.dumps(measurements, indent=2))


if __name__ == "__main__":
    main()
