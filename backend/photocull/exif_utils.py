"""EXIF extraction utilities using exifread.

Handles date parsing, GPS coordinate conversion, and metadata extraction
from RAW and JPEG files.
"""

from dataclasses import dataclass, field
from pathlib import Path

import exifread


@dataclass
class ExifData:
    """Parsed EXIF metadata for a photo."""
    date_taken: str | None = None
    gps_lat: float | None = None
    gps_lon: float | None = None
    camera_make: str | None = None
    camera_model: str | None = None
    lens_model: str | None = None
    focal_length: float | None = None
    aperture: float | None = None
    shutter_speed: str | None = None
    iso: int | None = None
    image_width: int | None = None
    image_height: int | None = None
    orientation: int | None = None


def _dms_to_decimal(dms_values, ref: str) -> float | None:
    """Convert GPS DMS (degrees, minutes, seconds) to decimal degrees."""
    try:
        d = float(dms_values[0])
        m = float(dms_values[1])
        s = float(dms_values[2])
        decimal = d + m / 60.0 + s / 3600.0
        if ref in ("S", "W"):
            decimal = -decimal
        return round(decimal, 7)
    except (IndexError, TypeError, ValueError, ZeroDivisionError):
        return None


def _ratio_to_float(tag) -> float | None:
    """Convert an exifread Ratio tag to a float."""
    try:
        values = tag.values
        if values:
            r = values[0]
            return float(r.num) / float(r.den) if r.den != 0 else None
    except (AttributeError, IndexError, TypeError, ZeroDivisionError):
        pass
    return None


def _tag_str(tags: dict, key: str) -> str | None:
    """Get a tag value as a stripped string, or None."""
    tag = tags.get(key)
    if tag is None:
        return None
    val = str(tag).strip()
    return val if val else None


def extract_exif(file_path: str | Path) -> ExifData:
    """Extract EXIF metadata from a file using exifread."""
    data = ExifData()
    try:
        with open(file_path, "rb") as f:
            tags = exifread.process_file(f, details=False)
    except Exception:
        return data

    if not tags:
        return data

    # Date taken
    for date_key in ("EXIF DateTimeOriginal", "EXIF DateTimeDigitized", "Image DateTime"):
        val = _tag_str(tags, date_key)
        if val:
            # Convert "2024:01:15 14:30:00" → "2024-01-15T14:30:00"
            try:
                date_part, time_part = val.split(" ", 1)
                data.date_taken = date_part.replace(":", "-") + "T" + time_part
            except ValueError:
                data.date_taken = val
            break

    # GPS
    gps_lat_tag = tags.get("GPS GPSLatitude")
    gps_lat_ref = _tag_str(tags, "GPS GPSLatitudeRef")
    gps_lon_tag = tags.get("GPS GPSLongitude")
    gps_lon_ref = _tag_str(tags, "GPS GPSLongitudeRef")
    if gps_lat_tag and gps_lat_ref and gps_lon_tag and gps_lon_ref:
        data.gps_lat = _dms_to_decimal(gps_lat_tag.values, gps_lat_ref)
        data.gps_lon = _dms_to_decimal(gps_lon_tag.values, gps_lon_ref)

    # Camera info
    data.camera_make = _tag_str(tags, "Image Make")
    data.camera_model = _tag_str(tags, "Image Model")
    data.lens_model = _tag_str(tags, "EXIF LensModel")

    # Exposure
    data.focal_length = _ratio_to_float(tags.get("EXIF FocalLength"))
    data.aperture = _ratio_to_float(tags.get("EXIF FNumber"))
    data.shutter_speed = _tag_str(tags, "EXIF ExposureTime")
    iso_tag = tags.get("EXIF ISOSpeedRatings")
    if iso_tag:
        try:
            data.iso = int(str(iso_tag))
        except (ValueError, TypeError):
            pass

    # Dimensions
    for w_key in ("EXIF ExifImageWidth", "Image ImageWidth"):
        tag = tags.get(w_key)
        if tag:
            try:
                data.image_width = int(str(tag))
                break
            except (ValueError, TypeError):
                pass
    for h_key in ("EXIF ExifImageLength", "Image ImageLength"):
        tag = tags.get(h_key)
        if tag:
            try:
                data.image_height = int(str(tag))
                break
            except (ValueError, TypeError):
                pass

    # Orientation
    orient_tag = tags.get("Image Orientation")
    if orient_tag:
        try:
            data.orientation = int(str(orient_tag))
        except (ValueError, TypeError):
            pass

    return data
