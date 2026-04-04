from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageStat

from app.core.config import get_settings

_ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "application/pdf",
}
_MAX_UPLOAD_BYTES = 8 * 1024 * 1024


class SavedProof:
    def __init__(
        self,
        *,
        storage_path: str,
        original_filename: str,
        content_type: str,
        file_size: int,
        model_quality_score: float,
        processing_summary: str,
    ) -> None:
        self.storage_path = storage_path
        self.original_filename = original_filename
        self.content_type = content_type
        self.file_size = file_size
        self.model_quality_score = model_quality_score
        self.processing_summary = processing_summary


async def validate_and_store_proof(upload: UploadFile, *, category: str) -> SavedProof:
    content_type = (upload.content_type or "").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Allowed: PNG, JPG, WEBP, PDF.",
        )

    content = await upload.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded proof file is empty.")
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Uploaded file is too large. Max size is 8 MB.",
        )

    rel_path = _build_storage_path(
        category=category,
        original_filename=upload.filename or "proof",
        content_type=content_type,
    )
    full_path = _uploads_root() / rel_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(content)

    quality_score, summary = _model_process_quality(content=content, content_type=content_type)

    return SavedProof(
        storage_path=rel_path.as_posix(),
        original_filename=upload.filename or "proof",
        content_type=content_type,
        file_size=len(content),
        model_quality_score=quality_score,
        processing_summary=summary,
    )


def _uploads_root() -> Path:
    settings = get_settings()
    # backend/app/services -> backend
    return Path(__file__).resolve().parents[2] / "uploads"


def _build_storage_path(*, category: str, original_filename: str, content_type: str) -> Path:
    now = datetime.now(timezone.utc)
    safe_ext = _extension_for(content_type, original_filename)
    file_id = uuid4().hex
    return Path(category) / f"{now.year:04d}" / f"{now.month:02d}" / f"{file_id}{safe_ext}"


def _extension_for(content_type: str, original_filename: str) -> str:
    suffix = Path(original_filename).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".pdf"}:
        return suffix
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "application/pdf": ".pdf",
    }
    return mapping.get(content_type, ".bin")


def _model_process_quality(*, content: bytes, content_type: str) -> tuple[float, str]:
    # Lightweight "model" processing:
    # 1) image readability scoring from dimensions + brightness spread
    # 2) PDF fallback score when image signals are unavailable
    if content_type == "application/pdf":
        score = 62.0
        return score, "Model processed PDF proof (text extraction pipeline not enabled)."

    try:
        with Image.open(Path("_in_memory_placeholder"), formats=None) as _:
            pass
    except Exception:
        # The above block is intentionally bypassed; use BytesIO instead.
        pass

    from io import BytesIO

    try:
        img = Image.open(BytesIO(content)).convert("L")
    except Exception:
        return 35.0, "Model could not decode image cleanly; upload a clearer screenshot."

    width, height = img.size
    pixel_count = width * height
    size_score = min(100.0, max(10.0, (pixel_count / (1280 * 720)) * 50.0 + 30.0))

    stat = ImageStat.Stat(img)
    stddev = float(stat.stddev[0]) if stat.stddev else 0.0
    contrast_score = min(100.0, max(0.0, stddev * 3.0))

    quality = round(0.65 * size_score + 0.35 * contrast_score, 2)
    if quality >= 75:
        summary = "Model marked screenshot quality as good for earnings/proof verification."
    elif quality >= 50:
        summary = "Model marked screenshot quality as acceptable; consider a sharper capture."
    else:
        summary = "Model marked screenshot quality as low; recapture image for reliable verification."

    return quality, summary
